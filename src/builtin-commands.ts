/** @file Special vscode commands defined as functions. */

import {
  commands,
  type FormattingOptions,
  type TextDocumentShowOptions,
  type TextEdit,
  type Uri,
  type ViewColumn,
} from "vscode";

export type ContextValue = null | number | string | boolean | string[] | Record<string, any>;

export async function setContext(name: string, value: ContextValue) {
  await commands.executeCommand("setContext", name, value);
}

export async function focusNextGroup() {
  return commands.executeCommand("workbench.action.focusNextGroup");
}

export function closeActiveTextEditor() {
  return commands.executeCommand("workbench.action.closeActiveEditor");
}

export async function openFileDiff(
  label: string,
  fromUri: Uri,
  toUri: Uri,
  options?: ViewColumn | TextDocumentShowOptions,
) {
  await commands.executeCommand("vscode.diff", fromUri, toUri, label, options);
}

export async function executeFormatDocumentProvider(
  uri: Uri,
  options?: FormattingOptions,
): Promise<TextEdit[] | undefined> {
  return commands.executeCommand("vscode.executeFormatDocumentProvider", uri, options);
}

export interface MultiDiffEditorResource {
  resource: Uri;
  original?: Uri;
  modified?: Uri;
}

export function openMultiDiffEditor(
  title: string,
  resources: MultiDiffEditorResource[],
): Thenable<void> {
  const resourceTuples = resources.map((r) => [r.resource, r.original, r.modified]);
  return commands.executeCommand("vscode.changes", title, resourceTuples);
}

export function restartExtensionHost() {
  return commands.executeCommand("workbench.action.restartExtensionHost");
}

export function reloadWindow() {
  return commands.executeCommand("workbench.action.reloadWindow");
}

export function quitVscode() {
  return commands.executeCommand("workbench.action.quit");
}

export function closeActiveEditor() {
  return commands.executeCommand("workbench.action.closeActiveEditor");
}
