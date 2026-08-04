import { listDatabases, listTables } from '../warehouse/discovery';
import { getTableSchema } from '../warehouse/tableSchema';
import { CatalogRef, DatabaseRef, TableRef } from '../warehouse/model';
import { computeCatalogNames, maybeQuoteIdent } from './identifiers';

export interface CandidateCompletion {
  label: string;
  kind: 'keyword' | 'table' | 'column';
  detail?: string;
  insertText: string;
}

interface IndexEntry {
  catalogName: string;
  database: DatabaseRef;
  table: TableRef;
}

interface ReferencedTable extends IndexEntry {
  alias?: string;
}

const KEYWORDS = [
  'SELECT',
  'DISTINCT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'FULL JOIN',
  'ON',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'AS',
  'WITH',
  'UNION',
  'UNION ALL',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS NULL',
  'IS NOT NULL',
  'BETWEEN',
  'LIKE',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'ASC',
  'DESC',
];

const IDENT_OR_QUOTED = '(?:"(?:[^"]|"")*"|[A-Za-z_]\\w*)';
const DOT_TRIGGER_RE = new RegExp(`(${IDENT_OR_QUOTED})\\s*\\.\\s*$`);
const FROM_JOIN_CLAUSE_RE = /\b(?:from|join)\s+([\s\S]*?)(?=,|;|$|\bjoin\b|\bwhere\b|\bon\b|\bgroup\b|\border\b|\bhaving\b|\blimit\b|\bunion\b)/gi;
const TARGET_RE = new RegExp(
  `^(${IDENT_OR_QUOTED})(?:\\s*\\.\\s*(${IDENT_OR_QUOTED}))?(?:\\s*\\.\\s*(${IDENT_OR_QUOTED}))?\\s*(?:as\\s+)?([A-Za-z_]\\w*)?\\s*$`,
  'i',
);

function unquote(token: string): string {
  if (token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1).replace(/""/g, '"');
  }
  return token;
}

async function buildTableIndex(catalogs: CatalogRef[]): Promise<IndexEntry[]> {
  const catalogNames = computeCatalogNames(catalogs);
  const index: IndexEntry[] = [];

  for (const catalog of catalogs) {
    const catalogName = catalogNames.get(catalog.path)!;
    const databases = await listDatabases(catalog.path);
    for (const database of databases) {
      const tables = await listTables(database);
      for (const table of tables) {
        index.push({ catalogName, database, table });
      }
    }
  }

  return index;
}

/** Heuristic (not a real SQL parser): scans FROM/JOIN clauses for a 1-3 part
 * dotted table reference plus an optional trailing alias, and resolves each
 * against the known catalog/database/table index. Good enough for completion
 * purposes; won't handle CTEs, subqueries, etc. */
function findReferencedTables(textBeforeCursor: string, index: IndexEntry[]): ReferencedTable[] {
  const referenced: ReferencedTable[] = [];

  for (const clauseMatch of textBeforeCursor.matchAll(FROM_JOIN_CLAUSE_RE)) {
    const targetMatch = TARGET_RE.exec(clauseMatch[1].trim());
    if (!targetMatch) {
      continue;
    }

    const parts = [targetMatch[1], targetMatch[2], targetMatch[3]].filter((p): p is string => Boolean(p)).map(unquote);
    const alias = targetMatch[4];
    const matches = resolveParts(parts, index);
    for (const entry of matches) {
      referenced.push({ ...entry, alias });
    }
  }

  return referenced;
}

function resolveParts(parts: string[], index: IndexEntry[]): IndexEntry[] {
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  if (parts.length === 3) {
    const [catalogName, dbName, tableName] = parts;
    return index.filter(
      (e) => eq(e.catalogName, catalogName) && eq(e.database.name, dbName) && eq(e.table.name, tableName),
    );
  }
  if (parts.length === 2) {
    const [dbName, tableName] = parts;
    return index.filter((e) => eq(e.database.name, dbName) && eq(e.table.name, tableName));
  }
  if (parts.length === 1) {
    const [tableName] = parts;
    return index.filter((e) => eq(e.table.name, tableName));
  }
  return [];
}

function bareTableCompletion(entry: IndexEntry): CandidateCompletion {
  return {
    label: entry.table.name,
    kind: 'table',
    detail: entry.table.format,
    insertText: maybeQuoteIdent(entry.table.name),
  };
}

function fullTableCompletion(entry: IndexEntry): CandidateCompletion {
  return {
    label: `${entry.database.name}.${entry.table.name}`,
    kind: 'table',
    detail: entry.table.format,
    insertText: `${maybeQuoteIdent(entry.database.name)}.${maybeQuoteIdent(entry.table.name)}`,
  };
}

async function columnCompletions(tables: ReferencedTable[]): Promise<CandidateCompletion[]> {
  const seen = new Set<string>();
  const completions: CandidateCompletion[] = [];

  for (const ref of tables) {
    const schema = await getTableSchema(ref.table);
    for (const column of schema.columns) {
      if (seen.has(column.name)) {
        continue;
      }
      seen.add(column.name);
      completions.push({
        label: column.name,
        kind: 'column',
        detail: column.isPartitionKey ? `${column.type} · partition` : column.type,
        insertText: maybeQuoteIdent(column.name),
      });
    }
  }

  return completions;
}

function dedupeByLabel(completions: CandidateCompletion[]): CandidateCompletion[] {
  const seen = new Set<string>();
  return completions.filter((c) => {
    if (seen.has(c.label)) {
      return false;
    }
    seen.add(c.label);
    return true;
  });
}

/** Pure completion logic — no `vscode` dependency, so it's directly unit
 * testable. Takes the full document text plus a plain character offset
 * (not a `vscode.Position`); the extension-side glue converts between them. */
export async function getCompletions(
  text: string,
  offset: number,
  catalogs: CatalogRef[],
): Promise<CandidateCompletion[]> {
  const beforeCursor = text.slice(0, offset);
  const index = await buildTableIndex(catalogs);

  const dotMatch = DOT_TRIGGER_RE.exec(beforeCursor);
  if (dotMatch) {
    const name = unquote(dotMatch[1]);

    const matchingDatabases = index.filter((e) => e.database.name.toLowerCase() === name.toLowerCase());
    if (matchingDatabases.length > 0) {
      return dedupeByLabel(matchingDatabases.map(bareTableCompletion));
    }

    const referenced = findReferencedTables(beforeCursor, index).filter(
      (e) => e.table.name.toLowerCase() === name.toLowerCase() || e.alias?.toLowerCase() === name.toLowerCase(),
    );
    if (referenced.length > 0) {
      return columnCompletions(referenced);
    }

    return [];
  }

  const keywordCompletions: CandidateCompletion[] = KEYWORDS.map((keyword) => ({
    label: keyword,
    kind: 'keyword',
    insertText: keyword,
  }));
  const tableCompletions = dedupeByLabel(index.map(fullTableCompletion));
  const referenced = findReferencedTables(beforeCursor, index);
  const referencedColumnCompletions = referenced.length > 0 ? await columnCompletions(referenced) : [];

  return [...keywordCompletions, ...tableCompletions, ...referencedColumnCompletions];
}
