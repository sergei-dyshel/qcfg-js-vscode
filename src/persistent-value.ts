import { assertNotNull } from "@sergei-dyshel/typescript/error";
import type { Awaitable } from "@sergei-dyshel/typescript/types";
import { ExtensionContext } from "./extension-context";

export class PersistentValue<T> {
  constructor(
    private readonly key: string,
    private readonly workspaceState = false,
  ) {}

  get(): T | undefined;
  get(defaultValue: T): T;
  get(defaultValue?: T): T | undefined {
    return this.state().get<T>(this.key) ?? defaultValue;
  }

  getWithAssert(): T {
    const value = this.get();
    assertNotNull(value, `Key ${this.key} is missing`);
    return value;
  }

  async cache(getter: () => Awaitable<T>) {
    const cached = this.get();
    if (cached) return cached;
    const value = await getter();
    await this.update(value);
    return value;
  }

  async update(value: T): Promise<void> {
    return this.state().update(this.key, value);
  }

  async delete(): Promise<void> {
    return this.state().update(this.key, undefined);
  }

  private state() {
    return this.workspaceState
      ? ExtensionContext.get().workspaceState
      : ExtensionContext.get().globalState;
  }
}
