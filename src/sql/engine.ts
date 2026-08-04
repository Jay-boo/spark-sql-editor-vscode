import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';

let connectionPromise: Promise<DuckDBConnection> | undefined;

export function getConnection(): Promise<DuckDBConnection> {
  if (!connectionPromise) {
    connectionPromise = DuckDBInstance.create(':memory:').then((instance) => instance.connect());
  }
  return connectionPromise;
}

export function disposeEngine(): void {
  if (!connectionPromise) {
    return;
  }
  const pending = connectionPromise;
  connectionPromise = undefined;
  pending.then((connection) => connection.closeSync()).catch(() => undefined);
}
