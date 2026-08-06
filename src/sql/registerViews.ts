import { DuckDBConnection } from '@duckdb/node-api';
import { listDatabases, listTables } from '../warehouse/discovery';
import { CatalogRef, TableRef } from '../warehouse/model';
import { computeCatalogNames, quoteIdent, quoteLiteral, toSqlPath } from './identifiers';

interface Registration {
  catalogName: string;
  dbName: string;
  table: TableRef;
}

let deltaExtensionReady: Promise<void> | undefined;

async function ensureDeltaExtension(connection: DuckDBConnection): Promise<void> {
  if (!deltaExtensionReady) {
    deltaExtensionReady = (async () => {
      try {
        await connection.run('INSTALL delta');
        await connection.run('LOAD delta');
      } catch (err) {
        deltaExtensionReady = undefined;
        throw new Error(
          `Couldn't load DuckDB's "delta" extension (needed to query Delta tables) — check network access.\n${(err as Error).message}`,
        );
      }
    })();
  }
  return deltaExtensionReady;
}

function tableSource(table: TableRef): string | undefined {
  const globPath = toSqlPath(table.path);
  if (table.format === 'parquet') {
    return `SELECT * FROM read_parquet(${quoteLiteral(`${globPath}/**/*.parquet`)}, hive_partitioning = true)`;
  }
  if (table.format === 'delta') {
    return `SELECT * FROM delta_scan(${quoteLiteral(globPath)})`;
  }
  return undefined;
}

/** Re-registers every catalog/database/table as a DuckDB catalog/schema/view so
 * SQL can reference them the same way they appear in the tree. Cheap to re-run
 * before every query: view creation is metadata-only, no data is read. */
export async function syncCatalogViews(connection: DuckDBConnection, catalogs: CatalogRef[]): Promise<void> {
  const catalogNames = computeCatalogNames(catalogs);
  const registrations: Registration[] = [];

  for (const catalog of catalogs) {
    const catalogName = catalogNames.get(catalog.path)!;
    await connection.run(`ATTACH IF NOT EXISTS ':memory:' AS ${quoteIdent(catalogName)}`);

    const databases = await listDatabases(catalog.path);
    for (const database of databases) {
      await connection.run(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(catalogName)}.${quoteIdent(database.name)}`);
      const tables = await listTables(database);
      for (const table of tables) {
        registrations.push({ catalogName, dbName: database.name, table });
      }
    }
  }

  if (registrations.some((r) => r.table.format === 'delta')) {
    await ensureDeltaExtension(connection);
  }

  for (const { catalogName, dbName, table } of registrations) {
    const source = tableSource(table);
    if (!source) {
      continue;
    }
    const viewName = `${quoteIdent(catalogName)}.${quoteIdent(dbName)}.${quoteIdent(table.name)}`;
    try {
      await connection.run(`CREATE OR REPLACE VIEW ${viewName} AS ${source}`);
    } catch (err) {
      // A single unreadable table (e.g. a corrupt Delta log) must not block registering
      // — and therefore querying — every other table in the catalog.
      console.error(`Spark Catalog: skipping ${dbName}.${table.name}, couldn't register as a view:`, err);
    }
  }

  const searchPathEntries = [...new Set(registrations.map((r) => `${quoteIdent(r.catalogName)}.${quoteIdent(r.dbName)}`))];
  if (searchPathEntries.length > 0) {
    await connection.run(`SET search_path = ${quoteLiteral(searchPathEntries.join(','))}`);
  }
}
