// One-off generator for the checked-in test fixtures under test/fixtures/spark-warehouse.
// Run with: node test/fixtures/generate-fixtures.mjs
// (hyparquet-writer is ESM-only, so this script is .mjs rather than sharing the project's CJS tsconfig.)
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, sep } from 'path';
import { parquetWriteFile } from 'hyparquet-writer';

const here = dirname(fileURLToPath(import.meta.url));
const warehouse = join(here, 'spark-warehouse');

rmSync(warehouse, { recursive: true, force: true });

// sales.db/customers — plain, unpartitioned parquet table
const customersDir = join(warehouse, 'sales.db', 'customers');
mkdirSync(customersDir, { recursive: true });
parquetWriteFile({
  filename: join(customersDir, 'part-00000.parquet'),
  columnData: [
    { name: 'id', data: [1, 2, 3], type: 'INT32', nullable: false },
    { name: 'name', data: ['Alice', 'Bob', 'Charlie'], type: 'STRING' },
    { name: 'active', data: [true, true, false], type: 'BOOLEAN' },
  ],
});

// sales.db/orders — plain parquet table, partitioned by region=us / region=eu
const ordersDir = join(warehouse, 'sales.db', 'orders');
for (const region of ['us', 'eu']) {
  const partitionDir = join(ordersDir, `region=${region}`);
  mkdirSync(partitionDir, { recursive: true });
  parquetWriteFile({
    filename: join(partitionDir, 'part-00000.parquet'),
    columnData: [
      { name: 'id', data: [1n, 2n], type: 'INT64', nullable: false },
      { name: 'amount', data: [10.5, 20.25], type: 'DOUBLE' },
      { name: 'customer_name', data: ['Alice', 'Bob'], type: 'STRING' },
    ],
  });
}

// events — loose table at warehouse root (default database), Delta format,
// partitioned by ts (partition columns are excluded from the underlying
// parquet file's own schema per Delta convention, and come from partitionValues instead)
const eventsTableDir = join(warehouse, 'events');
const eventsDataRelPath = join('ts=1000000', 'part-00000-fixture.snappy.parquet');
mkdirSync(join(eventsTableDir, 'ts=1000000'), { recursive: true });
mkdirSync(join(eventsTableDir, '_delta_log'), { recursive: true });
parquetWriteFile({
  filename: join(eventsTableDir, eventsDataRelPath),
  columnData: [
    { name: 'event_id', data: ['e1', 'e2', 'e3'], type: 'STRING', nullable: false },
    { name: 'payload', data: ['{}', '{}', null], type: 'STRING' },
  ],
});
const schemaString = JSON.stringify({
  type: 'struct',
  fields: [
    { name: 'event_id', type: 'string', nullable: false, metadata: {} },
    { name: 'ts', type: 'long', nullable: false, metadata: {} },
    { name: 'payload', type: 'string', nullable: true, metadata: {} },
  ],
});
const commitLines = [
  { protocol: { minReaderVersion: 1, minWriterVersion: 2 } },
  {
    metaData: {
      id: 'fixture-table-id',
      format: { provider: 'parquet', options: {} },
      schemaString,
      partitionColumns: ['ts'],
      configuration: {},
      createdTime: 1700000000000,
    },
  },
  {
    add: {
      path: eventsDataRelPath.split(sep).join('/'),
      partitionValues: { ts: '1000000' },
      size: 1234,
      modificationTime: 1700000000000,
      dataChange: true,
      stats: JSON.stringify({ numRecords: 3 }),
    },
  },
  { commitInfo: { timestamp: 1700000000000, operation: 'WRITE', operationParameters: { mode: 'Append' } } },
];
writeFileSync(
  join(eventsTableDir, '_delta_log', '00000000000000000000.json'),
  commitLines.map((line) => JSON.stringify(line)).join('\n') + '\n',
);

console.log('Fixtures written to', warehouse);
