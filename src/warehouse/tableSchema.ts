import * as fs from 'fs/promises';
import { Column, TableRef, TableSchema } from './model';
import { findFirstParquetFile, partitionColumnsFromPath } from './discovery';
import { readParquetSchema } from './parquetSchema';
import { readDeltaSchema } from './deltaSchema';

interface CacheEntry {
  mtimeMs: number;
  schema: TableSchema;
}

const cache = new Map<string, CacheEntry>();

export async function getTableSchema(table: TableRef, options?: { bypassCache?: boolean }): Promise<TableSchema> {
  const mtimeMs = await tableMtime(table.path);
  const cached = cache.get(table.path);
  if (!options?.bypassCache && cached && cached.mtimeMs === mtimeMs) {
    return cached.schema;
  }

  const schema = await resolveSchema(table);
  cache.set(table.path, { mtimeMs, schema });
  return schema;
}

export function clearTableSchemaCache(): void {
  cache.clear();
}

async function tableMtime(tablePath: string): Promise<number> {
  try {
    const stat = await fs.stat(tablePath);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

async function resolveSchema(table: TableRef): Promise<TableSchema> {
  if (table.format === 'delta') {
    const { columns, approxRowCount } = await readDeltaSchema(table.path);
    return { format: 'delta', location: table.path, columns, approxRowCount };
  }

  if (table.format === 'parquet') {
    const dataFile = await findFirstParquetFile(table.path);
    if (!dataFile) {
      return { format: 'parquet', location: table.path, columns: [], approxRowCount: undefined };
    }
    const { columns, approxRowCount } = await readParquetSchema(dataFile);
    const partitionNames = partitionColumnsFromPath(table.path, dataFile);
    return {
      format: 'parquet',
      location: table.path,
      columns: mergePartitionColumns(columns, partitionNames),
      approxRowCount,
    };
  }

  return { format: 'unknown', location: table.path, columns: [], approxRowCount: undefined };
}

function mergePartitionColumns(columns: Column[], partitionNames: string[]): Column[] {
  if (partitionNames.length === 0) {
    return columns;
  }
  const partitionColumns: Column[] = partitionNames.map((name) => ({
    name,
    type: 'string',
    nullable: true,
    isPartitionKey: true,
  }));
  return [...columns, ...partitionColumns];
}
