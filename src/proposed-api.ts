import { jsoncParser } from "@sergei-dyshel/typescript";
import { assert } from "@sergei-dyshel/typescript/error";
import type { Awaitable } from "@sergei-dyshel/typescript/types";
import { basename } from "node:path";
import * as vscode from "vscode";
import { closeActiveEditor } from "./builtin-commands";
import { documentRange } from "./document";
import { ExtensionContext } from "./extension-context";
import { Extensions } from "./extensions";
import { Message } from "./namespaces/message";
import { getActiveTextEditor } from "./window";

export namespace ProposedApi {
  /**
   * Allowlist given extension by modifying argv.json
   *
   * @returns True if extension was not allowlisted before.
   */
  export async function allowlistExtension(extensionId: string) {
    await vscode.commands.executeCommand("workbench.action.configureRuntimeArguments");
    const editor = getActiveTextEditor();
    const document = editor.document;
    assert(basename(document.fileName) === "argv.json", "Could not open runtime arguments file");
    const text = editor.document.getText();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const json = jsoncParser.parse(text);
    const KEY = "enable-proposed-api";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const allowlist = json[KEY] as string[];
    assert(Array.isArray(allowlist));
    if (allowlist.includes(extensionId)) {
      await closeActiveEditor();
      return false;
    }
    const newArray = [...allowlist, extensionId];
    const edit = jsoncParser.modify(editor.document.getText(), [KEY], newArray, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    });
    const newText = jsoncParser.applyEdits(text, edit);
    await editor.edit((builder) => builder.replace(documentRange(document), newText));
    await document.save();
    await closeActiveEditor();
    return true;
  }

  /**
   * Detect if extension is using proposed APIs and is not allowlisted. If so - propose user to add
   * allowlist.
   *
   * @param callback Function to run that should use some proposed API. If now allowlist, the
   *   function is expected to fail.
   */
  export async function detectAllowlist<T>(callback: () => Awaitable<T>) {
    const name = Extensions.name(ExtensionContext.get().extension);
    try {
      return await callback();
    } catch (error) {
      if (error instanceof Error && error.message.includes("CANNOT use API proposal")) {
        if (
          !(await Message.confirm(
            `Extension "${name}" is using proposed APIs and needs to be allowlisted in runtime arguments. Do you want to proceed?`,
            true /* modal */,
          ))
        )
          return;
        const allowlisted = await allowlistExtension(ExtensionContext.get().extension.id);
        if (!allowlisted) {
          await Message.showModal(
            "error",
            "Extension is already allowlisted. Try restarting the editor again.",
          );
          return;
        }
        await Message.showModal(
          "info",
          "Now please restart the editor. Note that you need to quiet entire application, not just close single window.",
        );
        return;
      } else {
        throw error;
      }
    }
  }
}
