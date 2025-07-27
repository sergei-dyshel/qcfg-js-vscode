/** @file Special vscode commands defined as functions. */

import {
  commands,
  Uri,
  type FormattingOptions,
  type TextDocumentShowOptions,
  type TextEdit,
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

/**
 * Open workspace/folder
 *
 * See
 * {@link https://github.com/sergei-dyshel/vscode/blob/78a1c2301661c322bac61f1db87d7c950705bedb/src/vs/workbench/browser/actions/workspaceCommands.ts#L167}
 * for details
 */
export async function openFolder(
  path: string | Uri,
  newWindow?:
    | boolean
    | {
        forceNewWindow?: boolean;
        forceReuseWindow?: boolean;
        noRecentEntry?: boolean;
        forceLocalWindow?: boolean;
        forceProfile?: string;
        forceTempProfile?: boolean;
      },
) {
  const uri = typeof path === "string" ? Uri.file(path) : path;
  return commands.executeCommand("vscode.openFolder", uri, newWindow);
}
