import { assert, assertNotNull } from "@sergei-dyshel/typescript/error";
import type { ExtensionContext as VsCodeExtensionContext } from "vscode";
import * as vscode from "vscode";

export { VsCodeExtensionContext as ExtensionContext };

export namespace ExtensionContext {
  let currentContext: vscode.ExtensionContext | undefined;

  export function get() {
    assertNotNull(currentContext, `Extension is not activated`);
    return currentContext;
  }

  export function globalStorageUri() {
    // fix sceme from `vscode-userdata` to 'file'
    return get().globalStorageUri.with({ scheme: "file" });
  }

  export function inDevelopmentMode() {
    return get().extensionMode === vscode.ExtensionMode.Development;
  }

  export function set(context: vscode.ExtensionContext | undefined) {
    assert(currentContext === undefined, "Extension context already set");
    currentContext = context;
  }
}
