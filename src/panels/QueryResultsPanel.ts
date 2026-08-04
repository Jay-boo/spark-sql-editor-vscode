import * as vscode from 'vscode';
import { QueryResult } from '../sql/runQuery';

const MAX_RENDERED_ROWS = 1000;

export class QueryResultsPanel {
  private static current: QueryResultsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  private constructor() {
    this.panel = vscode.window.createWebviewPanel(
      'sparkCatalog.queryResults',
      'Query Results',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: false },
    );
    this.panel.onDidDispose(() => {
      QueryResultsPanel.current = undefined;
    });
  }

  static getOrCreate(): QueryResultsPanel {
    if (!QueryResultsPanel.current) {
      QueryResultsPanel.current = new QueryResultsPanel();
    } else {
      QueryResultsPanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
    }
    return QueryResultsPanel.current;
  }

  showResult(result: QueryResult): void {
    this.panel.title = 'Query Results';
    this.panel.webview.html = renderResultHtml(result);
  }

  showError(message: string): void {
    this.panel.title = 'Query Results (error)';
    this.panel.webview.html = renderErrorHtml(message);
  }
}

function renderResultHtml(result: QueryResult): string {
  const rows = result.rows.slice(0, MAX_RENDERED_ROWS);
  const truncated = result.rows.length > MAX_RENDERED_ROWS;
  const headerHtml = result.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
  const bodyHtml = rows
    .map((row) => `<tr>${result.columns.map((column) => `<td>${formatCell(row[column])}</td>`).join('')}</tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 0 1rem; color: var(--vscode-foreground); }
    table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
    th, td { text-align: left; padding: 0.3rem 0.6rem; border-bottom: 1px solid var(--vscode-widget-border, #444); white-space: nowrap; }
    th { position: sticky; top: 0; background: var(--vscode-editor-background); opacity: 0.85; }
    .meta { opacity: 0.7; margin: 0.75rem 0; font-size: 0.85em; }
    .null { opacity: 0.5; font-style: italic; }
  </style>
</head>
<body>
  <p class="meta">${result.rows.length.toLocaleString()} row${result.rows.length === 1 ? '' : 's'} in ${result.durationMs.toLocaleString()} ms${
    truncated ? ` — showing first ${MAX_RENDERED_ROWS.toLocaleString()}` : ''
  }</p>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml || `<tr><td colspan="${result.columns.length || 1}">No rows</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

function renderErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 1rem; color: var(--vscode-foreground); }
    pre { white-space: pre-wrap; background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
          border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100); padding: 0.75rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h3>Query failed</h3>
  <pre>${escapeHtml(message)}</pre>
</body>
</html>`;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '<span class="null">NULL</span>';
  }
  if (typeof value === 'object') {
    return escapeHtml(JSON.stringify(value));
  }
  return escapeHtml(String(value));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
