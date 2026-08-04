import * as vscode from 'vscode';
import { TableRef, TableSchema } from '../warehouse/model';
import { getTableSchema } from '../warehouse/tableSchema';

export async function showSchemaPanel(table: TableRef): Promise<void> {
  const schema = await getTableSchema(table);

  const panel = vscode.window.createWebviewPanel(
    'sparkCatalog.schema',
    `${table.name} — schema`,
    vscode.ViewColumn.Active,
    { enableScripts: false },
  );

  panel.webview.html = renderHtml(table, schema);
}

function renderHtml(table: TableRef, schema: TableSchema): string {
  const rows = schema.columns
    .map(
      (column) => `
        <tr>
          <td>${escapeHtml(column.name)}</td>
          <td>${escapeHtml(column.type)}</td>
          <td>${column.nullable ? 'yes' : 'no'}</td>
          <td>${column.isPartitionKey ? 'yes' : ''}</td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 0 1.5rem; color: var(--vscode-foreground); }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
    dt { font-weight: 600; opacity: 0.8; }
    table { border-collapse: collapse; margin-top: 1rem; width: 100%; }
    th, td { text-align: left; padding: 0.35rem 0.75rem; border-bottom: 1px solid var(--vscode-widget-border, #444); }
    th { opacity: 0.8; font-weight: 600; }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <h2>${escapeHtml(table.name)}</h2>
  <dl>
    <dt>Format</dt><dd>${escapeHtml(schema.format)}</dd>
    <dt>Location</dt><dd><code>${escapeHtml(schema.location)}</code></dd>
    <dt>Approx. rows</dt><dd>${schema.approxRowCount !== undefined ? schema.approxRowCount.toLocaleString() : 'unknown'}</dd>
  </dl>
  <table>
    <thead>
      <tr><th>Column</th><th>Type</th><th>Nullable</th><th>Partition key</th></tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="4">No columns found</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
