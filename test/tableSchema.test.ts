import * as assert from 'assert';
import * as path from 'path';
import { listDatabases, listTables } from '../src/warehouse/discovery';
import { getTableSchema } from '../src/warehouse/tableSchema';
import { TableRef } from '../src/warehouse/model';

const WAREHOUSE = path.join(process.cwd(), 'test', 'fixtures', 'spark-warehouse');

async function findTable(databaseName: string, tableName: string): Promise<TableRef> {
  const databases = await listDatabases(WAREHOUSE);
  const database = databases.find((d) => d.name === databaseName);
  assert.ok(database, `database ${databaseName} not found`);
  const tables = await listTables(database);
  const table = tables.find((t) => t.name === tableName);
  assert.ok(table, `table ${tableName} not found`);
  return table;
}

describe('tableSchema', () => {
  it('reads schema from a plain unpartitioned parquet table', async () => {
    const table = await findTable('sales', 'customers');
    const schema = await getTableSchema(table);

    assert.strictEqual(schema.format, 'parquet');
    assert.strictEqual(schema.approxRowCount, 3);
    assert.deepStrictEqual(schema.columns, [
      { name: 'id', type: 'int', nullable: false, isPartitionKey: false },
      { name: 'name', type: 'string', nullable: true, isPartitionKey: false },
      { name: 'active', type: 'boolean', nullable: true, isPartitionKey: false },
    ]);
  });

  it('merges directory-derived partition columns into a partitioned parquet table', async () => {
    const table = await findTable('sales', 'orders');
    const schema = await getTableSchema(table);

    assert.strictEqual(schema.format, 'parquet');
    assert.strictEqual(schema.approxRowCount, 2);
    assert.deepStrictEqual(schema.columns, [
      { name: 'id', type: 'bigint', nullable: false, isPartitionKey: false },
      { name: 'amount', type: 'double', nullable: true, isPartitionKey: false },
      { name: 'customer_name', type: 'string', nullable: true, isPartitionKey: false },
      { name: 'region', type: 'string', nullable: true, isPartitionKey: true },
    ]);
  });

  it('reads schema and row count from a Delta table log', async () => {
    const table = await findTable('default', 'events');
    const schema = await getTableSchema(table);

    assert.strictEqual(schema.format, 'delta');
    assert.strictEqual(schema.approxRowCount, 3);
    assert.deepStrictEqual(schema.columns, [
      { name: 'event_id', type: 'string', nullable: false, isPartitionKey: false },
      { name: 'ts', type: 'long', nullable: false, isPartitionKey: true },
      { name: 'payload', type: 'string', nullable: true, isPartitionKey: false },
    ]);
  });
});
