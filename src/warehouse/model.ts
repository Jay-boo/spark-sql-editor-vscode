export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  isPartitionKey: boolean;
}

export type TableFormat = 'parquet' | 'delta' | 'unknown';

export interface TableRef {
  name: string;
  path: string;
  format: TableFormat;
}

export interface DatabaseRef {
  name: string;
  path: string;
}

export interface CatalogRef {
  name: string;
  path: string;
}

export interface TableSchema {
  format: TableFormat;
  location: string;
  columns: Column[];
  approxRowCount: number | undefined;
}
