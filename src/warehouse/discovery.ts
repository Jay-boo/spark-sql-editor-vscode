import * as fs from 'fs/promises';
import * as path from 'path';
import { DatabaseRef, TableFormat, TableRef } from './model';

const HIDDEN_PREFIX = new Set(['_', '.']);

function isHidden(name: string): boolean {
  return HIDDEN_PREFIX.has(name[0]);
}

async function listDirs(dir: string): Promise<string[]> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/** Databases in a warehouse: `<name>.db` directories, plus a synthetic `default`
 * database for any loose table directories sitting directly at the warehouse root. */
export async function listDatabases(catalogPath: string): Promise<DatabaseRef[]> {
  const names = await listDirs(catalogPath);
  const databases: DatabaseRef[] = [];
  let hasDefaultTables = false;

  for (const name of names) {
    if (isHidden(name)) {
      continue;
    }
    if (name.endsWith('.db')) {
      databases.push({ name: name.slice(0, -3), path: path.join(catalogPath, name) });
    } else {
      hasDefaultTables = true;
    }
  }

  if (hasDefaultTables) {
    databases.push({ name: 'default', path: catalogPath });
  }

  return databases.sort((a, b) => a.name.localeCompare(b.name));
}

/** Tables in a database: subdirectories, excluding other `.db` databases
 * (relevant only when scanning the warehouse root for the `default` database). */
export async function listTables(database: DatabaseRef): Promise<TableRef[]> {
  const names = await listDirs(database.path);
  const tables: TableRef[] = [];

  for (const name of names) {
    if (isHidden(name) || name.endsWith('.db')) {
      continue;
    }
    const tablePath = path.join(database.path, name);
    tables.push({ name, path: tablePath, format: await detectFormat(tablePath) });
  }

  return tables.sort((a, b) => a.name.localeCompare(b.name));
}

async function detectFormat(tablePath: string): Promise<TableFormat> {
  try {
    const deltaLog = await fs.stat(path.join(tablePath, '_delta_log'));
    if (deltaLog.isDirectory()) {
      return 'delta';
    }
  } catch {
    // no _delta_log, fall through to parquet detection
  }

  const parquetFile = await findFirstParquetFile(tablePath);
  return parquetFile ? 'parquet' : 'unknown';
}

/** Recursively finds one representative `.parquet` file, descending into
 * partition directories (e.g. `year=2024/month=01/part-*.parquet`). */
export async function findFirstParquetFile(dir: string, depth = 0): Promise<string | undefined> {
  if (depth > 6) {
    return undefined;
  }
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    if (isHidden(entry.name)) {
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.parquet')) {
      return path.join(dir, entry.name);
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory() && !isHidden(entry.name)) {
      const found = await findFirstParquetFile(path.join(dir, entry.name), depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

/** Partition columns are directory segments of the form `key=value` between
 * the table root and a data file (not present in the file's own schema). */
export function partitionColumnsFromPath(tablePath: string, dataFilePath: string): string[] {
  const relative = path.relative(tablePath, path.dirname(dataFilePath));
  if (!relative || relative.startsWith('..')) {
    return [];
  }
  return relative
    .split(path.sep)
    .filter((segment) => segment.includes('='))
    .map((segment) => segment.split('=')[0]);
}
