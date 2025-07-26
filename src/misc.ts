import type { AnyFunction } from "@sergei-dyshel/typescript/types";
import { zod } from "@sergei-dyshel/typescript/zod";
import { registerCommand } from "@sergei-dyshel/vscode/error-handling";
import type * as vscode from "vscode";
import {
  ProcessExecution,
  ShellExecution,
  Task,
  TaskRevealKind,
  TaskScope,
  tasks,
  type CancellationToken,
} from "vscode";
import { UriFactory } from "./uri-factory";

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

export class HiddenCommand<F extends AnyFunction> {
  constructor(
    private command: string,
    private callback: F,
  ) {}

  register() {
    return registerCommand(this.command, this.callback);
  }

  makeReference(...args: Parameters<F>) {
    const cmd: vscode.Command = {
      title: "",
      command: this.command,
      arguments: args,
    };
    return cmd;
  }

  run(...args: Parameters<F>): ReturnType<F> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.callback(...args);
  }
}

const gitQuerySchema = zod.object({
  path: zod.string(),
  ref: zod.string(),
  submoduleOf: zod.string().optional(),
});

export const gitUri = new UriFactory("git", gitQuerySchema);
