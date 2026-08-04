import * as vscode from 'vscode';

const QUERY_FOLDER_NAME = 'query';

/** Opens (creating if needed) a real file under `<workspace>/query/`, rather than
 * an in-memory untitled buffer — so query files land somewhere predictable instead
 * of wherever VSCode's "Save" dialog happens to default to. Falls back to an
 * untitled buffer if no workspace folder is open (nowhere sensible to create it). */
export async function openQueryFile(filename: string, contentIfNew: string): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: contentIfNew });
    await vscode.window.showTextDocument(doc);
    return;
  }

  const queryDirUri = vscode.Uri.joinPath(folder.uri, QUERY_FOLDER_NAME);
  await vscode.workspace.fs.createDirectory(queryDirUri);

  const fileUri = vscode.Uri.joinPath(queryDirUri, filename);
  if (!(await fileExists(fileUri))) {
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(contentIfNew, 'utf8'));
  }

  const doc = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(doc);
}

export function timestampedQueryFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
  return `query-${stamp}.sql`;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
