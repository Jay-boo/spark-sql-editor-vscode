import * as fs from 'fs/promises';
import * as path from 'path';
import { Column } from './model';

interface DeltaSchemaField {
  name: string;
  type: unknown;
  nullable: boolean;
}

interface DeltaMetaDataAction {
  schemaString: string;
  partitionColumns?: string[];
}

interface DeltaAddAction {
  stats?: string;
}

interface DeltaLogLine {
  metaData?: DeltaMetaDataAction;
  add?: DeltaAddAction;
}

export interface DeltaSchemaResult {
  columns: Column[];
  approxRowCount: number | undefined;
}

const COMMIT_FILE_RE = /^\d{20}\.json$/;

/** Reads schema from the latest `metaData` action found by scanning commit
 * JSON files newest-first. Older history rolled into a `.checkpoint.parquet`
 * (with no metaData in the remaining JSON commits) isn't handled in v1 —
 * returns an empty column list in that rare case. */
export async function readDeltaSchema(tablePath: string): Promise<DeltaSchemaResult> {
  const logDir = path.join(tablePath, '_delta_log');
  const entries = await fs.readdir(logDir);
  const commitFiles = entries.filter((name) => COMMIT_FILE_RE.test(name)).sort();

  let columns: Column[] = [];
  let rowCount: number | undefined;

  for (let i = commitFiles.length - 1; i >= 0; i--) {
    const lines = await readJsonLines(path.join(logDir, commitFiles[i]));

    if (columns.length === 0) {
      const metaDataLine = lines.find((line) => line.metaData);
      if (metaDataLine?.metaData) {
        columns = parseSchemaString(metaDataLine.metaData.schemaString, metaDataLine.metaData.partitionColumns ?? []);
      }
    }

    const countedInFile = sumStatsRowCount(lines);
    if (countedInFile !== undefined) {
      rowCount = (rowCount ?? 0) + countedInFile;
    }

    if (columns.length > 0 && rowCount !== undefined) {
      break;
    }
  }

  return { columns, approxRowCount: rowCount };
}

async function readJsonLines(filePath: string): Promise<DeltaLogLine[]> {
  const content = await fs.readFile(filePath, 'utf8');
  const lines: DeltaLogLine[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      lines.push(JSON.parse(trimmed));
    } catch {
      // ignore malformed/partial lines
    }
  }

  return lines;
}

function sumStatsRowCount(lines: DeltaLogLine[]): number | undefined {
  let total: number | undefined;
  for (const line of lines) {
    if (!line.add?.stats) {
      continue;
    }
    try {
      const stats = JSON.parse(line.add.stats) as { numRecords?: number };
      if (typeof stats.numRecords === 'number') {
        total = (total ?? 0) + stats.numRecords;
      }
    } catch {
      // ignore unparsable stats
    }
  }
  return total;
}

function parseSchemaString(schemaString: string, partitionColumns: string[]): Column[] {
  const parsed = JSON.parse(schemaString) as { fields: DeltaSchemaField[] };
  const partitionColumnSet = new Set(partitionColumns);
  return parsed.fields.map((field) => ({
    name: field.name,
    type: deltaTypeName(field.type),
    nullable: field.nullable,
    isPartitionKey: partitionColumnSet.has(field.name),
  }));
}

function deltaTypeName(type: unknown): string {
  if (typeof type === 'string') {
    return type;
  }
  if (type && typeof type === 'object') {
    const record = type as { type?: string };
    if (record.type === 'struct') {
      return 'struct';
    }
    if (record.type === 'array') {
      return 'array';
    }
    if (record.type === 'map') {
      return 'map';
    }
  }
  return 'unknown';
}
