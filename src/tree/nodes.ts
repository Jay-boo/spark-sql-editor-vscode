import { CatalogRef, Column, DatabaseRef, TableRef } from '../warehouse/model';

export type CatalogNode =
  | { kind: 'catalog'; catalog: CatalogRef }
  | { kind: 'database'; catalog: CatalogRef; database: DatabaseRef }
  | { kind: 'table'; catalog: CatalogRef; database: DatabaseRef; table: TableRef }
  | { kind: 'column'; table: TableRef; column: Column }
  | { kind: 'missingPath'; path: string };

export function nodeId(node: CatalogNode): string {
  switch (node.kind) {
    case 'catalog':
      return `catalog:${node.catalog.path}`;
    case 'database':
      return `database:${node.database.path}`;
    case 'table':
      return `table:${node.table.path}`;
    case 'column':
      return `column:${node.table.path}:${node.column.name}`;
    case 'missingPath':
      return `missingPath:${node.path}`;
  }
}
