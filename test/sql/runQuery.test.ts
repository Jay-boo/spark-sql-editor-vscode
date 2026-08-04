import * as assert from 'assert';
import * as path from 'path';
import { runQuery } from '../../src/sql/runQuery';
import { CatalogRef } from '../../src/warehouse/model';

const WAREHOUSE = path.join(process.cwd(), 'test', 'fixtures', 'spark-warehouse');
const CATALOGS: CatalogRef[] = [{ name: 'fixture-warehouse', path: WAREHOUSE }];

describe('runQuery', () => {
  it('queries an unpartitioned parquet table by db.table name', async () => {
    const result = await runQuery('SELECT * FROM sales.customers ORDER BY id', CATALOGS);
    assert.deepStrictEqual(result.columns, ['id', 'name', 'active']);
    assert.strictEqual(result.rows.length, 3);
    assert.deepStrictEqual(result.rows[0], { id: 1, name: 'Alice', active: true });
  });

  it('queries a partitioned parquet table, recovering the partition column via hive_partitioning', async () => {
    const result = await runQuery("SELECT * FROM sales.orders WHERE region = 'us' ORDER BY id", CATALOGS);
    assert.strictEqual(result.rows.length, 2);
    assert.strictEqual(result.rows[0].region, 'us');
    assert.strictEqual(result.rows[0].customer_name, 'Alice');
  });

  it('queries a Delta table via delta_scan, recovering the partition column from the log', async () => {
    const result = await runQuery('SELECT * FROM "default".events ORDER BY event_id', CATALOGS);
    assert.strictEqual(result.rows.length, 3);
    assert.deepStrictEqual(
      result.rows.map((r) => r.event_id),
      ['e1', 'e2', 'e3'],
    );
    assert.strictEqual(result.rows[0].ts, '1000000');
  });

  it('supports aggregate queries and reports row count/timing', async () => {
    const result = await runQuery('SELECT count(*) AS n FROM "default".events', CATALOGS);
    // count(*) is BIGINT; getRowObjectsJson() renders it as a string to avoid precision loss.
    assert.strictEqual(result.rows[0].n, '3');
    assert.strictEqual(result.rows.length, 1);
    assert.ok(result.durationMs >= 0);
  });

  it('surfaces a clear error for a query against a nonexistent table', async () => {
    await assert.rejects(() => runQuery('SELECT * FROM sales.nonexistent', CATALOGS), /nonexistent/);
  });
});
