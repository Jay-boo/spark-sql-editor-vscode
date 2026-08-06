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
      { enableScripts: true, retainContextWhenHidden: true },
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
  const nonce = getNonce();

  const payload = {
    columns: result.columns,
    columnTypes: result.columnTypes,
    rows: rows.map((row) => result.columns.map((column) => row[column])),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 0 1rem; color: var(--vscode-foreground); }
    .meta { opacity: 0.7; margin: 0.75rem 0; font-size: 0.85em; display: flex; gap: 1rem; align-items: baseline; }
    .meta .count { flex: 1; }
    #tableWrap { overflow: auto; max-height: calc(100vh - 4rem); }
    table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
    th, td { text-align: left; padding: 0.3rem 0.6rem; border-bottom: 1px solid var(--vscode-widget-border, #444); white-space: nowrap; }
    th { position: sticky; top: 0; background: var(--vscode-editor-background); z-index: 1; }
    th.pinned, td.pinned { position: sticky; left: 0; z-index: 2; background: var(--vscode-editor-background); box-shadow: 1px 0 0 0 var(--vscode-widget-border, #444); }
    th.pinned { z-index: 3; }
    .col-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.4rem; }
    .col-name { cursor: default; }
    .col-type { opacity: 0.6; font-weight: normal; font-size: 0.85em; }
    .pin-btn { border: none; background: none; color: var(--vscode-foreground); opacity: 0.4; cursor: pointer; padding: 0 0.2rem; font-size: 0.9em; }
    .pin-btn:hover { opacity: 1; }
    .pin-btn.active { opacity: 1; color: var(--vscode-textLink-foreground, #3794ff); }
    .filter-row th { padding: 0.2rem 0.4rem; }
    .filter-row input { width: 100%; box-sizing: border-box; font-size: 0.85em; padding: 0.15rem 0.3rem;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; }
    .null { opacity: 0.5; font-style: italic; }
    #clearFilters { background: none; border: 1px solid var(--vscode-button-border, transparent); color: var(--vscode-foreground);
      border-radius: 3px; padding: 0.1rem 0.5rem; cursor: pointer; opacity: 0.8; }
    #clearFilters:hover { opacity: 1; }
  </style>
</head>
<body>
  <p class="meta">
    <span class="count" id="rowCount"></span>
    <button id="clearFilters" title="Clear all column filters">Clear filters</button>
  </p>
  <div id="tableWrap"></div>
  <script nonce="${nonce}">
    const data = ${JSON.stringify(payload)};
    const truncated = ${JSON.stringify(truncated)};
    const totalRows = ${JSON.stringify(result.rows.length)};
    const pinned = new Set();
    const filters = data.columns.map(() => '');

    function escapeHtml(value) {
      return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatCell(value) {
      if (value === null || value === undefined) return '<span class="null">NULL</span>';
      if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
      return escapeHtml(String(value));
    }

    function orderedColumnIndexes() {
      const pinnedIdx = data.columns.map((_, i) => i).filter((i) => pinned.has(i));
      const restIdx = data.columns.map((_, i) => i).filter((i) => !pinned.has(i));
      return [...pinnedIdx, ...restIdx];
    }

    function filteredRows() {
      const active = filters.map((f, i) => ({ i, needle: f.trim().toLowerCase() })).filter((f) => f.needle);
      if (!active.length) return data.rows;
      return data.rows.filter((row) => active.every(({ i, needle }) => {
        const cell = row[i];
        if (cell === null || cell === undefined) return false;
        return String(cell).toLowerCase().includes(needle);
      }));
    }

    function renderBody() {
      const order = orderedColumnIndexes();
      const rows = filteredRows();

      const bodyHtml = rows.map((row) =>
        '<tr>' + order.map((i) => '<td class="' + (pinned.has(i) ? 'pinned' : '') + '">' + formatCell(row[i]) + '</td>').join('') + '</tr>'
      ).join('');

      document.getElementById('tableBody').innerHTML =
        bodyHtml || '<tr><td colspan="' + (order.length || 1) + '">No rows match the current filters</td></tr>';

      const filterChanged = rows.length !== totalRows;
      document.getElementById('rowCount').textContent =
        (filterChanged ? rows.length.toLocaleString() + ' of ' + totalRows.toLocaleString() : totalRows.toLocaleString()) +
        ' row' + (totalRows === 1 ? '' : 's') +
        (truncated ? ' — showing first ' + data.rows.length.toLocaleString() : '');
    }

    function renderHead() {
      const order = orderedColumnIndexes();

      const headHtml = order.map((i) => {
        const isPinned = pinned.has(i);
        return '<th class="' + (isPinned ? 'pinned' : '') + '">' +
          '<div class="col-head">' +
            '<span class="col-name">' + escapeHtml(data.columns[i]) + ' <span class="col-type">' + escapeHtml(data.columnTypes[i]) + '</span></span>' +
            '<button class="pin-btn ' + (isPinned ? 'active' : '') + '" data-col="' + i + '" title="' + (isPinned ? 'Unpin column' : 'Pin column') + '">\u{1F4CC}</button>' +
          '</div>' +
        '</th>';
      }).join('');

      const filterHtml = order.map((i) =>
        '<th class="' + (pinned.has(i) ? 'pinned' : '') + '"><input type="text" data-filter-col="' + i + '" placeholder="Filter…" value="' + escapeHtml(filters[i]) + '" /></th>'
      ).join('');

      document.getElementById('tableHead').innerHTML = '<tr>' + headHtml + '</tr><tr class="filter-row">' + filterHtml + '</tr>';

      document.querySelectorAll('.pin-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const col = Number(btn.getAttribute('data-col'));
          if (pinned.has(col)) pinned.delete(col); else pinned.add(col);
          renderHead();
          renderBody();
        });
      });
      document.querySelectorAll('[data-filter-col]').forEach((input) => {
        input.addEventListener('input', () => {
          filters[Number(input.getAttribute('data-filter-col'))] = input.value;
          renderBody();
        });
      });
    }

    document.getElementById('clearFilters').addEventListener('click', () => {
      filters.fill('');
      renderHead();
      renderBody();
    });

    document.getElementById('tableWrap').innerHTML = '<table><thead id="tableHead"></thead><tbody id="tableBody"></tbody></table>';
    renderHead();
    renderBody();
  </script>
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
