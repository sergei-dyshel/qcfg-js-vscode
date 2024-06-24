import { ModuleLogger } from "@sergei-dyshel/node/logging";
import { assert, assertNotNull } from "@sergei-dyshel/typescript/error";
import { cancellationTokenToAbortSignal } from "@sergei-dyshel/vscode";
import { reportAsyncErrors } from "@sergei-dyshel/vscode/error-handling";
import * as vscode from "vscode";
import { libraryLogger } from "./common";

const logger = new ModuleLogger({ parent: libraryLogger });

// REFACTOR: remove Task/Activity API if not used
export class Task {
  readonly signal: AbortSignal;

  private disposed = false;
  private pending = new Map<any, string>();

  constructor(
    private readonly progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken,
  ) {
    this.signal = cancellationTokenToAbortSignal(token);
  }

  async runSubtask<T>(subtitle: string, promise: Promise<T>): Promise<T> {
    assert(!this.disposed, "Trying to run subtask of an already finished task");
    this.pending.set(promise, subtitle);
    this.updateProgress();
    try {
      return await promise;
    } finally {
      this.pending.delete(promise);
      this.updateProgress();
    }
  }

  get hasPending() {
    return this.pending.size > 0;
  }

  dispose() {
    this.disposed = true;
  }

  private updateProgress() {
    const size = this.pending.size;
    if (size > 1) this.progress.report({ message: `${size} pending` });
    else if (size == 1) this.progress.report({ message: [...this.pending.values()][0] });
    else this.progress.report({ message: "" });
  }
}

export function runTask<T>(title: string, func: (task: Task) => Promise<T>): Promise<T> {
  return vscode.window.withProgress(
    {
      title,
      location: vscode.ProgressLocation.Notification,
      cancellable: true,
    },
    async (progress, token) => {
      const task = new Task(progress, token);
      try {
        return await func(task);
      } finally {
        task.dispose();
      }
    },
  ) as Promise<T>;
}

export class Activity {
  private task?: Task;
  private resolve?: () => void;

  constructor(private readonly title: string) {}

  async run<T>(subtitle: string, func: (task: Task) => Promise<T>): Promise<T> {
    if (!this.task) {
      reportAsyncErrors(
        runTask(this.title, (task) => {
          // assuming this will happen sync
          this.task = task;
          return new Promise<void>((resolve, _) => {
            this.resolve = resolve;
          });
        }),
      );
    }
    assertNotNull(this.task);
    try {
      return await this.task.runSubtask(subtitle, func(this.task));
    } finally {
      if (!this.task.hasPending) this.resolve!();
      this.task = undefined;
      this.resolve = undefined;
    }
  }
}

export class Progress {
  private thenable?: Thenable<void>;
  private progress?: vscode.Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>;
  private dismiss?: () => void;
  private percentage = 0;

  private pending = new Map<number, string>();
  private nrFinished = 0;

  public signal?: AbortSignal;

  constructor(private title: string) {}

  async with<T>(label: string, func: () => Promise<T>): Promise<T> {
    const id = Math.random();
    this.pending.set(id, label);
    if (!this.thenable) {
      this.thenable = vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: this.title,
          cancellable: true,
        },
        (progress, token) => {
          // XXX: make progress window cancellable and cancelling will reject promise and present warning to user
          assert(this.signal === undefined);
          this.signal = cancellationTokenToAbortSignal(token);
          this.progress = progress;
          this.updateProgress();
          return new Promise<void>((resolve, _) => {
            this.dismiss = resolve;
          });
        },
      );
    }
    this.updateProgress();

    // assuming vscode.window.wihtProgress will call callback synchronously
    assertNotNull(this.signal);
    try {
      return await func();
    } finally {
      this.nrFinished += 1;
      assert(this.pending.delete(id));
      this.updateProgress();
      if (this.pending.size === 0) {
        this.dismiss!();
        this.dismiss = undefined;
        this.signal = undefined;
        this.thenable = undefined;
        this.progress = undefined;
        this.nrFinished = 0;
      }
    }
  }

  async withLogged<T>(label: string, func: () => Promise<T>): Promise<T> {
    logger.info(label);
    return this.with(label, func);
  }

  private updateProgress() {
    if (!this.progress) return;
    const nrPending = this.pending.size;
    const newPercentage = this.nrFinished / (nrPending + this.nrFinished);
    const message =
      this.pending.size === 1
        ? (this.pending.entries().next().value as [number, string])[1]
        : `${this.nrFinished}/${nrPending + this.nrFinished}`;
    this.progress.report({
      message,
      increment: 100 * (newPercentage - this.percentage),
    });
    this.percentage = newPercentage;
  }
}
