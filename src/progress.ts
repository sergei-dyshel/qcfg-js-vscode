import { AsyncContext } from "@sergei-dyshel/node";
import { ModuleLogger } from "@sergei-dyshel/node/logging";
import { assert, assertNotNull } from "@sergei-dyshel/typescript/error";
import { cancellationTokenToAbortSignal } from "@sergei-dyshel/vscode";
import * as vscode from "vscode";
import { libraryLogger } from "./common";

const logger = new ModuleLogger({ parent: libraryLogger });

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

  public private?: AbortSignal;

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
          assert(this.private === undefined);
          this.private = cancellationTokenToAbortSignal(token);
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
    assertNotNull(this.private);
    try {
      return await AsyncContext.run(AsyncContext.addSignal(this.private), func);
    } finally {
      this.nrFinished += 1;
      assert(this.pending.delete(id));
      this.updateProgress();
      if (this.pending.size === 0) {
        this.dismiss!();
        this.dismiss = undefined;
        this.private = undefined;
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
