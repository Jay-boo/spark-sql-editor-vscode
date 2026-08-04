import * as vscode from 'vscode';
import { resolveCatalogs } from '../config';
import { CandidateCompletion, getCompletions } from './completionLogic';

const KIND_MAP: Record<CandidateCompletion['kind'], vscode.CompletionItemKind> = {
  keyword: vscode.CompletionItemKind.Keyword,
  table: vscode.CompletionItemKind.Class,
  column: vscode.CompletionItemKind.Field,
};

export class SparkSqlCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const offset = document.offsetAt(position);
    const catalogs = await resolveCatalogs();
    const candidates = await getCompletions(document.getText(), offset, catalogs);
    return candidates.map(toCompletionItem);
  }
}

function toCompletionItem(candidate: CandidateCompletion): vscode.CompletionItem {
  const item = new vscode.CompletionItem(candidate.label, KIND_MAP[candidate.kind]);
  item.detail = candidate.detail;
  item.insertText = candidate.insertText;
  return item;
}
