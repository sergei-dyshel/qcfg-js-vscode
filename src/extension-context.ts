import { assert, assertNotNull } from "@sergei-dyshel/typescript/error";
import type * as vscode from "vscode";

export { ExtensionContext } from "vscode";

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

  export function set(context: vscode.ExtensionContext | undefined) {
    assert(currentContext === undefined, "Extension context already set");
    currentContext = context;
  }
}
