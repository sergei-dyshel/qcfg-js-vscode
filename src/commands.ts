/** @file Special vscode commands defined as functions. */

import { commands } from "vscode";

export type ContextValue = null | number | string | boolean | string[] | Record<string, any>;

export async function setContext(name: string, value: ContextValue) {
  await commands.executeCommand("setContext", name, value);
}
