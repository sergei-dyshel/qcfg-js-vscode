import { ModuleLogger } from "@sergei-dyshel/node/logging";
import { assertNotNull } from "@sergei-dyshel/typescript/error";
import { expandTemplate } from "@sergei-dyshel/typescript/string";
import {
  Uri,
  window,
  workspace,
  type TextDocument,
  type TextDocumentShowOptions,
  type TextEditor,
} from "vscode";
import { getWorkspaceRoot, getWorkspaceRootName } from "./workspace";

const WINDOW_TITLE = "window.title";

const logger = new ModuleLogger({ name: "window" });
/**
 * Window title for current workspace/folder
 */
export function getWindowTitle(): string | undefined {
  const root = getWorkspaceRoot();
  if (!root) return undefined;
  const title = workspace.getConfiguration().get<string>(WINDOW_TITLE);
  return title ? expandTitle(root, title) : getWorkspaceRootName(root);
}

/**
 * Expand placeholders in `window.title` value, or basename of workspace root if empty. Unlike in
 * real title, remote name is never included.
 *
 * If title can not be expanded, return result of {@link getWorkspaceRoot}.
 *
 * See
 * {@link https://github.com/sergei-dyshel/vscode/blob/78a1c2301661c322bac61f1db87d7c950705bedb/src/vs/workbench/browser/parts/titlebar/windowTitle.ts#L345}
 * for all available placeholders.
 */
function expandTitle(root: string, title: string): string {
  const rootName = getWorkspaceRootName(root);
  const folderName = rootName;
  const rootNameShort = rootName;
  try {
    return expandTemplate(title, { folderName, rootName, rootNameShort, remoteName: "" }, true);
  } catch (err) {
    logger.error(`Could not expand window title "${title}: ${String(err)}`);
    return rootName;
  }
}

export function getActiveTextEditor(): TextEditor {
  const editor = window.activeTextEditor;
  assertNotNull(editor, "No active text editor");
  return editor;
}

/**
 * Safe version of {@link window.showTextDocument}.
 *
 * When function is called repeately with overlapping invokation, the call may fail because another
 * editor is being open at the same time. If older invokation (not the most recent one) failed we
 * just abort (return `undefined`). If newest invokation failed, we retry.
 */
export async function showTextDocument(
  docOrUri: TextDocument | Uri,
  options?: TextDocumentShowOptions,
): Promise<TextEditor | undefined> {
  // const column =
  //   options?.viewColumn ?? window.tabGroups.activeTabGroup.viewColumn;
  showTextDocumentGen += 1;
  const gen = showTextDocumentGen;
  try {
    if (docOrUri instanceof Uri) return await window.showTextDocument(docOrUri, options);
    return await window.showTextDocument(docOrUri, options);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Could NOT open editor")) {
      if (gen !== showTextDocumentGen) return undefined;
      return showTextDocument(docOrUri, options);
    }
    throw err; // unrelated error
  }
}

let showTextDocumentGen = 0;
