import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { CatalogRef } from './warehouse/model';

async function resolveConfiguredPaths(): Promise<{ valid: CatalogRef[]; missing: string[] }> {
  const configured = vscode.workspace.getConfiguration('sparkCatalog').get<string[]>('warehousePaths', []);
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const valid: CatalogRef[] = [];
  const missing: string[] = [];

  for (const configuredPath of configured) {
    const resolved = resolvePath(configuredPath, workspaceFolders);
    if (await isDirectory(resolved)) {
      valid.push({ name: path.basename(resolved), path: resolved });
    } else {
      missing.push(resolved);
    }
  }

  return { valid, missing };
}

export async function resolveCatalogs(): Promise<CatalogRef[]> {
  const configured = vscode.workspace.getConfiguration('sparkCatalog').get<string[]>('warehousePaths', []);
  if (configured.length > 0) {
    return (await resolveConfiguredPaths()).valid;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const catalogs: CatalogRef[] = [];
  for (const folder of workspaceFolders) {
    const candidate = path.join(folder.uri.fsPath, 'spark-warehouse');
    if (await isDirectory(candidate)) {
      catalogs.push({ name: `${folder.name}/spark-warehouse`, path: candidate });
    }
  }
  return catalogs;
}

/** Configured `sparkCatalog.warehousePaths` entries that don't resolve to an
 * existing directory — surfaced in the tree so a bad path is visible instead
 * of silently vanishing (e.g. a relative path resolved against the wrong
 * workspace folder, or a typo'd absolute path missing its leading slash). */
export async function getMissingWarehousePaths(): Promise<string[]> {
  const configured = vscode.workspace.getConfiguration('sparkCatalog').get<string[]>('warehousePaths', []);
  if (configured.length === 0) {
    return [];
  }
  return (await resolveConfiguredPaths()).missing;
}

function resolvePath(configuredPath: string, workspaceFolders: readonly vscode.WorkspaceFolder[]): string {
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }
  const base = workspaceFolders[0]?.uri.fsPath ?? process.cwd();
  return path.join(base, configuredPath);
}

async function isDirectory(candidatePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidatePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
