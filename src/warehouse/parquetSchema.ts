import { asyncBufferFromFile, parquetMetadataAsync, SchemaElement } from 'hyparquet';
import { Column } from './model';

export interface ParquetSchemaResult {
  columns: Column[];
  approxRowCount: number;
}

export async function readParquetSchema(filePath: string): Promise<ParquetSchemaResult> {
  const file = await asyncBufferFromFile(filePath);
  const metadata = await parquetMetadataAsync(file);

  const approxRowCount = metadata.row_groups.reduce((sum, group) => sum + Number(group.num_rows), 0);
  const columns = parseTopLevelColumns(metadata.schema);

  return { columns, approxRowCount };
}

/** Parquet stores its schema as a flattened tree (root + descendants, ordered
 * depth-first); this walks it to pull out just the root's direct children. */
function parseTopLevelColumns(schema: SchemaElement[]): Column[] {
  if (schema.length === 0) {
    return [];
  }
  const root = schema[0];
  const columns: Column[] = [];
  let index = 1;

  for (let i = 0; i < (root.num_children ?? 0); i++) {
    const element = schema[index];
    const subtreeSize = countSubtreeSize(schema, index);
    columns.push(toColumn(element));
    index += subtreeSize;
  }

  return columns;
}

function countSubtreeSize(schema: SchemaElement[], index: number): number {
  const element = schema[index];
  let size = 1;
  let childIndex = index + 1;

  for (let i = 0; i < (element.num_children ?? 0); i++) {
    const childSize = countSubtreeSize(schema, childIndex);
    size += childSize;
    childIndex += childSize;
  }

  return size;
}

function toColumn(element: SchemaElement): Column {
  return {
    name: element.name,
    type: element.num_children ? complexTypeName(element) : primitiveTypeName(element),
    nullable: element.repetition_type !== 'REQUIRED',
    isPartitionKey: false,
  };
}

function complexTypeName(element: SchemaElement): string {
  if (element.converted_type === 'LIST' || element.logical_type?.type === 'LIST') {
    return 'array';
  }
  if (element.converted_type === 'MAP' || element.logical_type?.type === 'MAP') {
    return 'map';
  }
  return 'struct';
}

function primitiveTypeName(element: SchemaElement): string {
  const logical = element.logical_type;
  if (logical) {
    switch (logical.type) {
      case 'STRING':
        return 'string';
      case 'DATE':
        return 'date';
      case 'DECIMAL':
        return `decimal(${logical.precision},${logical.scale})`;
      case 'TIMESTAMP':
        return 'timestamp';
      case 'TIME':
        return 'time';
      case 'UUID':
        return 'uuid';
      case 'JSON':
        return 'json';
      case 'FLOAT16':
        return 'float16';
      case 'INTEGER':
        return integerTypeName(logical.bitWidth, logical.isSigned);
      default:
        break;
    }
  }

  switch (element.converted_type) {
    case 'UTF8':
    case 'ENUM':
      return 'string';
    case 'DATE':
      return 'date';
    case 'DECIMAL':
      return `decimal(${element.precision},${element.scale})`;
    case 'TIMESTAMP_MILLIS':
    case 'TIMESTAMP_MICROS':
      return 'timestamp';
    case 'TIME_MILLIS':
    case 'TIME_MICROS':
      return 'time';
    case 'INT_8':
      return 'tinyint';
    case 'INT_16':
      return 'smallint';
    case 'INT_32':
      return 'int';
    case 'INT_64':
      return 'bigint';
    case 'UINT_8':
    case 'UINT_16':
    case 'UINT_32':
    case 'UINT_64':
      return 'int (unsigned)';
    case 'JSON':
      return 'json';
    default:
      break;
  }

  switch (element.type) {
    case 'BOOLEAN':
      return 'boolean';
    case 'INT32':
      return 'int';
    case 'INT64':
      return 'bigint';
    case 'INT96':
      return 'timestamp';
    case 'FLOAT':
      return 'float';
    case 'DOUBLE':
      return 'double';
    case 'BYTE_ARRAY':
    case 'FIXED_LEN_BYTE_ARRAY':
      return 'binary';
    default:
      return 'unknown';
  }
}

function integerTypeName(bitWidth: number, isSigned: boolean): string {
  if (!isSigned) {
    return 'int (unsigned)';
  }
  if (bitWidth <= 8) {
    return 'tinyint';
  }
  if (bitWidth <= 16) {
    return 'smallint';
  }
  if (bitWidth <= 32) {
    return 'int';
  }
  return 'bigint';
}
