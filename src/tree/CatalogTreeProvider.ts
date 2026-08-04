import * as vscode from 'vscode';
import { listDatabases, listTables } from '../warehouse/discovery';
import { getTableSchema } from '../warehouse/tableSchema';
import { getMissingWarehousePaths, resolveCatalogs } from '../config';
import { CatalogNode, nodeId } from './nodes';

export class CatalogTreeProvider implements vscode.TreeDataProvider<CatalogNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<CatalogNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  async getChildren(element?: CatalogNode): Promise<CatalogNode[]> {
    if (!element) {
      const catalogs = await resolveCatalogs();
      const missingPaths = await getMissingWarehousePaths();
      return [
        ...catalogs.map((catalog): CatalogNode => ({ kind: 'catalog', catalog })),
        ...missingPaths.map((path): CatalogNode => ({ kind: 'missingPath', path })),
      ];
    }

    switch (element.kind) {
      case 'catalog': {
        const databases = await listDatabases(element.catalog.path);
        return databases.map((database) => ({ kind: 'database', catalog: element.catalog, database }));
      }
      case 'database': {
        const tables = await listTables(element.database);
        return tables.map((table) => ({ kind: 'table', catalog: element.catalog, database: element.database, table }));
      }
      case 'table': {
        const schema = await getTableSchema(element.table);
        return schema.columns.map((column) => ({ kind: 'column', table: element.table, column }));
      }
      case 'column':
        return [];
      case 'missingPath':
        return [];
    }
  }

  getTreeItem(element: CatalogNode): vscode.TreeItem {
    switch (element.kind) {
      case 'catalog':
        return this.catalogItem(element);
      case 'database':
        return this.databaseItem(element);
      case 'table':
        return this.tableItem(element);
      case 'column':
        return this.columnItem(element);
      case 'missingPath':
        return this.missingPathItem(element);
    }
  }

  private catalogItem(element: Extract<CatalogNode, { kind: 'catalog' }>): vscode.TreeItem {
    const item = new vscode.TreeItem(element.catalog.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.id = nodeId(element);
    item.contextValue = 'catalog';
    item.iconPath = new vscode.ThemeIcon('root-folder');
    item.tooltip = element.catalog.path;
    return item;
  }

  private databaseItem(element: Extract<CatalogNode, { kind: 'database' }>): vscode.TreeItem {
    const item = new vscode.TreeItem(element.database.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.id = nodeId(element);
    item.contextValue = 'database';
    item.iconPath = new vscode.ThemeIcon('database');
    item.tooltip = element.database.path;
    return item;
  }

  private tableItem(element: Extract<CatalogNode, { kind: 'table' }>): vscode.TreeItem {
    const item = new vscode.TreeItem(element.table.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.id = nodeId(element);
    item.contextValue = 'table';
    item.iconPath = new vscode.ThemeIcon('table');
    item.description = element.table.format;
    item.tooltip = element.table.path;
    return item;
  }

  private columnItem(element: Extract<CatalogNode, { kind: 'column' }>): vscode.TreeItem {
    const label = `${element.column.name}: ${element.column.type}`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.id = nodeId(element);
    item.contextValue = 'column';
    item.iconPath = new vscode.ThemeIcon(element.column.isPartitionKey ? 'symbol-key' : 'symbol-field');
    item.description = [
      element.column.isPartitionKey ? 'partition' : undefined,
      element.column.nullable ? undefined : 'not null',
    ]
      .filter((part): part is string => Boolean(part))
      .join(' | ');
    return item;
  }

  private missingPathItem(element: Extract<CatalogNode, { kind: 'missingPath' }>): vscode.TreeItem {
    const item = new vscode.TreeItem(element.path, vscode.TreeItemCollapsibleState.None);
    item.id = nodeId(element);
    item.contextValue = 'missingPath';
    item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
    item.description = 'configured path not found';
    item.tooltip = `sparkCatalog.warehousePaths includes "${element.path}", but no directory exists there.`;
    return item;
  }
}
