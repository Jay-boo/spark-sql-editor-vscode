import * as vscode from 'vscode';
import { CatalogTreeProvider } from './tree/CatalogTreeProvider';
import { CatalogNode } from './tree/nodes';
import { showSchemaPanel } from './panels/SchemaPanel';
import { QueryResultsPanel } from './panels/QueryResultsPanel';
import { clearTableSchemaCache } from './warehouse/tableSchema';
import { resolveCatalogs } from './config';
import { maybeQuoteIdent } from './sql/identifiers';
import { runQuery } from './sql/runQuery';
import { disposeEngine } from './sql/engine';
import { openQueryFile, timestampedQueryFilename } from './queryFiles';
import { SparkSqlCompletionProvider } from './sql/completionProvider';

const NEW_QUERY_TEMPLATE = `-- Tables are available as <db>.<table>, or fully qualified as
-- "<warehouse>"."<db>"."<table>" if you have multiple warehouses configured.
-- Run with Ctrl+Enter / Cmd+Enter (runs the selection, or the whole file if nothing is selected).

SELECT 1;
`;

export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new CatalogTreeProvider();
  const treeView = vscode.window.createTreeView('sparkCatalog.tree', {
    treeDataProvider: treeProvider,
  });

  const refresh = vscode.commands.registerCommand('sparkCatalog.refresh', () => {
    clearTableSchemaCache();
    treeProvider.refresh();
  });

  const addWarehouseFolder = vscode.commands.registerCommand('sparkCatalog.addWarehouseFolder', async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Add Warehouse Folder',
      title: 'Select a Spark warehouse folder',
    });
    if (!picked || picked.length === 0) {
      return;
    }

    const newPath = picked[0].fsPath;
    const config = vscode.workspace.getConfiguration('sparkCatalog');
    const current = config.get<string[]>('warehousePaths', []);
    if (current.includes(newPath)) {
      await vscode.window.showInformationMessage(`"${newPath}" is already configured.`);
      return;
    }

    const target = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await config.update('warehousePaths', [...current, newPath], target);
  });

  const showSchema = vscode.commands.registerCommand('sparkCatalog.showSchema', async (node?: CatalogNode) => {
    if (node?.kind !== 'table') {
      return;
    }
    await showSchemaPanel(node.table);
  });

  const revealInExplorer = vscode.commands.registerCommand(
    'sparkCatalog.revealInExplorer',
    async (node?: CatalogNode) => {
      if (!node || node.kind === 'column' || node.kind === 'missingPath') {
        return;
      }
      const targetPath = node.kind === 'catalog' ? node.catalog.path : node.kind === 'database' ? node.database.path : node.table.path;
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetPath));
    },
  );

  const newQuery = vscode.commands.registerCommand('sparkCatalog.newQuery', async () => {
    await openQueryFile(timestampedQueryFilename(), NEW_QUERY_TEMPLATE);
  });

  const newQueryForTable = vscode.commands.registerCommand(
    'sparkCatalog.newQueryForTable',
    async (node?: CatalogNode) => {
      if (node?.kind !== 'table') {
        return;
      }
      // db.table (not catalog-qualified): the catalog's search_path already makes
      // this resolve, and it's only ambiguous if two configured warehouses share a
      // database name — fall back to "<warehouse>"."<db>"."<table>" if that happens.
      const qualified = `${maybeQuoteIdent(node.database.name)}.${maybeQuoteIdent(node.table.name)}`;
      const filename = `${node.database.name}.${node.table.name}.sql`;
      await openQueryFile(filename, `-- Run with Ctrl+Enter / Cmd+Enter.\nSELECT * FROM ${qualified} LIMIT 100;\n`);
    },
  );

  const runQueryCommand = vscode.commands.registerCommand('sparkCatalog.runQuery', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'sql') {
      return;
    }
    const sql = editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection);
    if (!sql.trim()) {
      return;
    }

    const panel = QueryResultsPanel.getOrCreate();
    try {
      const catalogs = await resolveCatalogs();
      const result = await runQuery(sql, catalogs);
      panel.showResult(result);
    } catch (err) {
      panel.showError((err as Error).message);
    }
  });

  const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('sparkCatalog.warehousePaths')) {
      treeProvider.refresh();
    }
  });

  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => treeProvider.refresh());

  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: 'sql' },
    new SparkSqlCompletionProvider(),
    '.',
  );

  context.subscriptions.push(
    treeView,
    refresh,
    addWarehouseFolder,
    showSchema,
    revealInExplorer,
    newQuery,
    newQueryForTable,
    runQueryCommand,
    configWatcher,
    workspaceWatcher,
    completionProvider,
  );
}

export function deactivate(): void {
  clearTableSchemaCache();
  disposeEngine();
}
