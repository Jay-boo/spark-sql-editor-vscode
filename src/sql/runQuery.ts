import { DuckDBConnection } from '@duckdb/node-api';
import { CatalogRef } from '../warehouse/model';
import { getConnection } from './engine';
import { syncCatalogViews } from './registerViews';

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  durationMs: number;
}

export async function runQuery(sql: string, catalogs: CatalogRef[]): Promise<QueryResult> {
  const connection = await getConnection();
  await syncCatalogViews(connection, catalogs);
  return executeAndRead(connection, sql);
}

async function executeAndRead(connection: DuckDBConnection, sql: string): Promise<QueryResult> {
  const start = Date.now();
  const reader = await connection.runAndReadAll(sql);
  const durationMs = Date.now() - start;

  return {
    columns: reader.columnNames(),
    rows: reader.getRowObjectsJson() as Record<string, unknown>[],
    durationMs,
  };
}
