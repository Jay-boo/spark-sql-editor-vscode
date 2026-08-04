/**
 * Minimal ambient types for the subset of `hyparquet` this extension uses.
 * Written by hand rather than relying on the package's own `.d.ts` because its
 * package.json `exports` map splits node-only symbols (`asyncBufferFromFile`)
 * across a conditional "node" types file that classic TS module resolution
 * doesn't reliably pick up.
 */
declare module 'hyparquet' {
  export interface AsyncBuffer {
    byteLength: number;
    slice(start: number, end?: number): Promise<ArrayBuffer> | ArrayBuffer;
  }

  export type ParquetType =
    | 'BOOLEAN'
    | 'INT32'
    | 'INT64'
    | 'INT96'
    | 'FLOAT'
    | 'DOUBLE'
    | 'BYTE_ARRAY'
    | 'FIXED_LEN_BYTE_ARRAY';

  export type FieldRepetitionType = 'REQUIRED' | 'OPTIONAL' | 'REPEATED';

  export type ConvertedType =
    | 'UTF8'
    | 'MAP'
    | 'MAP_KEY_VALUE'
    | 'LIST'
    | 'ENUM'
    | 'DECIMAL'
    | 'DATE'
    | 'TIME_MILLIS'
    | 'TIME_MICROS'
    | 'TIMESTAMP_MILLIS'
    | 'TIMESTAMP_MICROS'
    | 'UINT_8'
    | 'UINT_16'
    | 'UINT_32'
    | 'UINT_64'
    | 'INT_8'
    | 'INT_16'
    | 'INT_32'
    | 'INT_64'
    | 'JSON'
    | 'BSON'
    | 'INTERVAL';

  export type TimeUnit = 'MILLIS' | 'MICROS' | 'NANOS';

  export type LogicalType =
    | { type: 'STRING' }
    | { type: 'MAP' }
    | { type: 'LIST' }
    | { type: 'ENUM' }
    | { type: 'DATE' }
    | { type: 'INTERVAL' }
    | { type: 'NULL' }
    | { type: 'JSON' }
    | { type: 'BSON' }
    | { type: 'UUID' }
    | { type: 'FLOAT16' }
    | { type: 'DECIMAL'; precision: number; scale: number }
    | { type: 'TIME'; isAdjustedToUTC: boolean; unit: TimeUnit }
    | { type: 'TIMESTAMP'; isAdjustedToUTC: boolean; unit: TimeUnit }
    | { type: 'INTEGER'; bitWidth: number; isSigned: boolean };

  export interface SchemaElement {
    type?: ParquetType;
    type_length?: number;
    repetition_type?: FieldRepetitionType;
    name: string;
    num_children?: number;
    converted_type?: ConvertedType;
    scale?: number;
    precision?: number;
    logical_type?: LogicalType;
  }

  export interface RowGroup {
    num_rows: bigint;
  }

  export interface FileMetaData {
    schema: SchemaElement[];
    num_rows: bigint;
    row_groups: RowGroup[];
  }

  export function parquetMetadataAsync(file: AsyncBuffer): Promise<FileMetaData>;
  export function asyncBufferFromFile(filename: string): Promise<AsyncBuffer>;
}
