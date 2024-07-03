import type { StackFrameFormatOptions } from "@sergei-dyshel/node/callsites";
import { RootLogger } from "@sergei-dyshel/node/logging";
import { AbortError, formatError, wrapWithCatch } from "@sergei-dyshel/typescript/error";
import type { AnyFunction } from "@sergei-dyshel/typescript/types";
import * as vscode from "vscode";
import { ExtensionContext } from "./extension-context";
import { Message } from "./namespaces/message";

const logger = RootLogger.get();

interface ReportErrorsParams {
  rethrow?: boolean;
  prefix?: string;
}

export function handleError(err: unknown, options?: { msgPrefix?: string }) {
  const stackFrameFormat: StackFrameFormatOptions = {
    file: ExtensionContext.inDevelopmentMode() ? "url" : "relative",
  };
  if (AbortError.is(err)) {
    logger.logError(err, { prefix: "User aborted: ", hideName: true, stackFrameFormat });
  } else {
    logger.logError(err, { prefix: "Exception thrown: ", stackFrameFormat });
    Message.show("error", (options?.msgPrefix ?? "") + formatError(err, { showCause: true }));
  }
}

export function reportErrors<F extends AnyFunction>(
  func: F,
  options?: ReportErrorsParams & { rethrow: true },
): (...funcArgs: Parameters<F>) => ReturnType<F>;
export function reportErrors<F extends AnyFunction>(
  func: F,
  options: ReportErrorsParams & { rethrow?: false },
): (...funcArgs: Parameters<F>) => ReturnType<F> | undefined;

export function reportErrors<T extends AnyFunction>(
  func: T,
  options?: ReportErrorsParams,
): Function {
  return wrapWithCatch(func, (err) => {
    handleError(err, { msgPrefix: options?.prefix });
    if (options?.rethrow) throw err;
  });
}

export function registerCommand(command: string, callback: AnyFunction): vscode.Disposable {
  return vscode.commands.registerCommand(
    command,
    reportErrors(callback, { prefix: `Failed to run command "${command}": ` }),
  );
}

export function reportAsyncErrors<T>(promise: Thenable<T>) {
  void (async () => {
    try {
      await promise;
    } catch (err) {
      handleError(err);
    }
  })();
}

export function listen<T>(
  event: vscode.Event<T>,
  listener: (e: T) => void | Thenable<void>,
): vscode.Disposable {
  return event(reportErrors(listener));
}
