import { assertNotNull } from "@sergei-dyshel/typescript/error";
import {
  ProcessExecution,
  ShellExecution,
  Task,
  TaskRevealKind,
  TaskScope,
  tasks,
  window,
  type CancellationToken,
} from "vscode";

export function cancellationTokenToAbortSignal(token: CancellationToken): AbortSignal;
export function cancellationTokenToAbortSignal(token: undefined): undefined;
export function cancellationTokenToAbortSignal(token?: CancellationToken): AbortSignal | undefined {
  if (!token) return;
  const controller = new AbortController();
  if (token.isCancellationRequested) controller.abort();
  else
    token.onCancellationRequested(() => {
      controller.abort();
    });
  return controller.signal;
}

export function getActiveTextEditor() {
  const editor = window.activeTextEditor;
  assertNotNull(editor, "Not in text editor");
  return editor;
}

export async function runInTerminal(
  cmd: string[] | string,
  options: {
    cwd: string;
    name: string;
    clear?: boolean;
    silent?: boolean;
    focus?: boolean;
    env?: Record<string, string>;
  },
) {
  const execution =
    typeof cmd === "string"
      ? new ShellExecution(cmd, { cwd: options.cwd, env: options.env })
      : new ProcessExecution(cmd[0], cmd.slice(1), { cwd: options.cwd, env: options.env });
  const task = new Task({ type: "crux" }, TaskScope.Workspace, options.name, "crux", execution);
  task.presentationOptions.clear = options.clear;
  task.presentationOptions.focus = options.focus;
  if (options.silent) task.presentationOptions.reveal = TaskRevealKind.Silent;
  await tasks.executeTask(task);
}
