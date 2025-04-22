import { AbortError } from "@sergei-dyshel/typescript/error";
import type { Awaitable } from "@sergei-dyshel/typescript/types";
import type { Config } from "@sergei-dyshel/vscode/config";
import { window, type MessageOptions } from "vscode";

type Severity = "info" | "warn" | "error";

function showImpl<T extends string>(
  severity: Severity,
  message: string,
  options: MessageOptions,
  ...items: T[]
): Thenable<T | undefined> {
  const func = {
    ["info"]: window.showInformationMessage,
    ["warn"]: window.showWarningMessage,
    ["error"]: window.showErrorMessage,
  }[severity];

  return func(message, options, ...items);
}

export function show(severity: Severity, message: string) {
  void showImpl(severity, message, {});
}

export function showModal(severity: Severity, message: string, detail?: string) {
  return showImpl(severity, message, { modal: true, detail });
}

export function ask<T extends readonly string[]>(
  severity: Severity,
  message: string,
  ...items: T
): Thenable<(typeof items)[number] | undefined> {
  return showImpl(severity, message, {}, ...items);
}

/**
 * Show message with button, execute callback depending on button pressed
 */
export async function select<T>(
  severity: Severity,
  message: string,
  ...items: [item: string, callback: () => Awaitable<T>][]
): Promise<T | undefined> {
  const answer = await ask(severity, message, ...items.map(([item]) => item));
  if (!answer) return;
  const [_, callback] = items.find(([item]) => item === answer)!;
  return await callback();
}

export function askModal<T extends readonly string[]>(
  severity: Severity,
  message: string,
  ...items: T
): Thenable<(typeof items)[number] | undefined> {
  return showImpl(severity, message, { modal: true }, ...items);
}

export async function confirmWithConfig(
  message: string,
  property: Config.Property<typeof Config.confirmSchema>,
  modal = false,
): Promise<boolean> {
  switch (property.get()) {
    case "always":
      return true;
    case "never":
      return false;
    case "ask": /* fallthrough */
  }

  const answers = ["Yes", "No", "Always", "Never"] as const;
  // XXX: if only ERROR guarantees message will not disappear on timeout
  // consider removing option of severity
  // see: https://github.com/microsoft/vscode/issues/90452
  const answer = modal
    ? await askModal("info", message, ...answers)
    : await ask("error", message, ...answers);
  switch (answer) {
    case "No":
      return false;
    case undefined:
      throw new AbortError("User cancelled dialog");
    case "Yes":
      return true;
    case "Always":
      await property.update("always", true);
      return true;
    case "Never":
      await property.update("never", true);
      return true;
  }
}

export async function confirm(message: string, modal = false): Promise<boolean> {
  const answers = ["Yes", "No"] as const;
  // Use ERROR message to prevent it disappearing on timeout
  const answer = modal
    ? await askModal("info", message, ...answers)
    : await ask("error", message, ...answers);
  switch (answer) {
    case "No":
    case undefined:
      return false;
    case "Yes":
      return true;
  }
}
