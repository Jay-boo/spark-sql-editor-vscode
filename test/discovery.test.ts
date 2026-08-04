import * as assert from 'assert';
import * as path from 'path';
import { findFirstParquetFile, listDatabases, listTables, partitionColumnsFromPath } from '../src/warehouse/discovery';

const WAREHOUSE = path.join(process.cwd(), 'test', 'fixtures', 'spark-warehouse');

describe('discovery', () => {
  it('lists .db directories plus a synthetic default database for loose tables', async () => {
    const databases = await listDatabases(WAREHOUSE);
    assert.deepStrictEqual(
      databases.map((d) => d.name),
      ['default', 'sales'],
    );
  });

  it('lists tables in a database, detecting parquet vs delta format', async () => {
    const [defaultDb, salesDb] = await listDatabases(WAREHOUSE);

    const defaultTables = await listTables(defaultDb);
    assert.deepStrictEqual(defaultTables.map((t) => ({ name: t.name, format: t.format })), [
      { name: 'events', format: 'delta' },
    ]);

    const salesTables = await listTables(salesDb);
    assert.deepStrictEqual(salesTables.map((t) => ({ name: t.name, format: t.format })), [
      { name: 'customers', format: 'parquet' },
      { name: 'orders', format: 'parquet' },
    ]);
  });

  it('finds a representative parquet file inside partition directories', async () => {
    const ordersPath = path.join(WAREHOUSE, 'sales.db', 'orders');
    const file = await findFirstParquetFile(ordersPath);
    assert.ok(file && file.endsWith('.parquet'));
    assert.ok(file.includes(`region=`));
  });

  it('parses partition column names from key=value path segments', () => {
    const tablePath = path.join(WAREHOUSE, 'sales.db', 'orders');
    const dataFile = path.join(tablePath, 'region=us', 'part-00000.parquet');
    assert.deepStrictEqual(partitionColumnsFromPath(tablePath, dataFile), ['region']);
  });

  it('returns no partition columns for an unpartitioned table', () => {
    const tablePath = path.join(WAREHOUSE, 'sales.db', 'customers');
    const dataFile = path.join(tablePath, 'part-00000.parquet');
    assert.deepStrictEqual(partitionColumnsFromPath(tablePath, dataFile), []);
  });
});
