import { assert } from "@sergei-dyshel/typescript/error";
import path from "node:path";
import { workspace } from "vscode";

export const WORKSPACE_FILE_EXTENSION = ".code-workspace";

/**
 * Workspace file path or folder path if single folder is opened, `undefined` otherwise
 */
export function getWorkspaceRoot(): string | undefined {
  if (workspace.workspaceFile) {
    const wsFile = workspace.workspaceFile;
    if (wsFile.scheme === "untitled") {
      return undefined;
    }
    return wsFile.fsPath;
  }
  if (workspace.workspaceFolders) {
    const wsFolders = workspace.workspaceFolders;
    assert(wsFolders.length === 1);
    return wsFolders[0].uri.fsPath;
  }
  return undefined;
}

export function getWorkspaceRootName(root: string) {
  return path.basename(root, WORKSPACE_FILE_EXTENSION);
}
