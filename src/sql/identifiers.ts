import * as path from 'path';
import { CatalogRef } from '../warehouse/model';

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

const SIMPLE_IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

// "default" is guaranteed to show up: it's the synthetic database name discovery.ts
// gives loose tables sitting at a warehouse root. The rest is a small, non-exhaustive
// set of other common reserved words that plausibly collide with real table/db names —
// quote a name by hand if it hits some more exotic reserved word not listed here.
const RESERVED_WORDS = new Set([
  'default',
  'order',
  'table',
  'group',
  'select',
  'column',
  'user',
  'key',
  'values',
  'check',
]);

/** Quotes only when actually needed (mixed case, spaces, hyphens, reserved
 * words, etc.) so generated SQL reads as plain `db.table` for the common
 * lowercase/underscore names Spark/Hive warehouses use, instead of always
 * wrapping in `"..."`. */
export function maybeQuoteIdent(name: string): string {
  const isSimple = SIMPLE_IDENTIFIER_RE.test(name) && !RESERVED_WORDS.has(name);
  return isSimple ? name : quoteIdent(name);
}

export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** DuckDB attaches each configured warehouse as its own "catalog"; folder
 * basenames often contain hyphens, which are safe once quoted but look odd
 * in hand-typed SQL, so this gives a friendlier identifier for that purpose. */
export function sanitizeIdentifier(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_');
  const withPrefix = /^[0-9]/.test(cleaned) ? `c_${cleaned}` : cleaned;
  return withPrefix || 'catalog';
}

/** Assigns a stable, deduped DuckDB catalog name per warehouse root, keyed by
 * path so it can be recomputed identically from separate `resolveCatalogs()`
 * calls (e.g. once when syncing views, once when pre-filling a query). */
export function computeCatalogNames(catalogs: CatalogRef[]): Map<string, string> {
  const used = new Set<string>();
  const result = new Map<string, string>();

  for (const catalog of catalogs) {
    const base = sanitizeIdentifier(catalog.name);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    result.set(catalog.path, candidate);
  }

  return result;
}

export function toSqlPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
