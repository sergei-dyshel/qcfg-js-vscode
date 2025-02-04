import { assert } from "@sergei-dyshel/typescript/error";
import type { zod } from "@sergei-dyshel/typescript/zod";
import jsonStableStringify from "json-stable-stringify";
import * as vscode from "vscode";
import { reportErrorsNoRethrow } from "./error-handling";
import { When } from "./when";

export type FileDecorator<T> = (_: T) => vscode.ProviderResult<vscode.FileDecoration>;

export interface UriFactoryCallbacks<T extends zod.ZodTypeAny> {
  addToUri?: (data: zod.infer<T>) => { path?: string; authority?: string };
}

export class UriFactory<T extends zod.ZodTypeAny> {
  constructor(
    public readonly scheme: string,
    private readonly querySchema: T,
    protected readonly callbacks?: UriFactoryCallbacks<T>,
  ) {}

  handles(uri: vscode.Uri) {
    return uri.scheme === this.scheme;
  }

  createUri(data: zod.infer<T>): vscode.Uri {
    const query = jsonStableStringify(this.querySchema.parse(data));
    let uri = vscode.Uri.from({ scheme: this.scheme, query });
    if (this.callbacks?.addToUri) uri = uri.with(this.callbacks.addToUri(data));
    return uri;
  }

  parseUri(uri: vscode.Uri): zod.infer<T> {
    assert(this.handles(uri), `Unexpected URI scheme: expected ${this.scheme}, got ${uri.scheme}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.querySchema.parse(JSON.parse(uri.query)) as zod.infer<T>;
  }

  get whenScheme() {
    return When.resourceScheme.equals(this.scheme);
  }

  equal(s1: zod.infer<T>, s2: zod.infer<T>) {
    return (
      jsonStableStringify(this.querySchema.parse(s1)) ===
      jsonStableStringify(this.querySchema.parse(s2))
    );
  }
}

interface FileSystemProviderCallbacks<T extends zod.ZodTypeAny> extends UriFactoryCallbacks<T> {
  readFile: (data: zod.infer<T>) => Uint8Array | Thenable<Uint8Array>;
}

export class FileSystemProvider<T extends zod.ZodTypeAny>
  extends UriFactory<T>
  implements vscode.FileSystemProvider
{
  protected onDidChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  protected generation = 0;

  constructor(
    scheme: string,
    querySchema: T,
    protected override readonly callbacks: FileSystemProviderCallbacks<T>,
  ) {
    super(scheme, querySchema, callbacks);
  }

  read(data: zod.infer<T>) {
    return this.callbacks.readFile(data);
  }

  register() {
    return vscode.Disposable.from(
      this.onDidChangeFileEmitter,
      vscode.workspace.registerFileSystemProvider(this.scheme, this, {
        isCaseSensitive: true,
        isReadonly: true,
      }),
    );
  }

  didChange(uri: vscode.Uri, type: vscode.FileChangeType) {
    /* XXX: URI generation should be per file */
    this.generation++;
    this.onDidChangeFileEmitter.fire([{ uri, type }]);
  }

  stat(_uri: vscode.Uri) {
    return {
      type: vscode.FileType.File,
      ctime: 0,
      mtime: this.generation,
      size: 0,
    };
  }

  readFile(uri: vscode.Uri) {
    const data = this.parseUri(uri);
    return this.read(data);
  }

  onDidChangeFile = this.onDidChangeFileEmitter.event;

  watch(
    _uri: vscode.Uri,
    _options: { readonly recursive: boolean; readonly excludes: readonly string[] },
  ): vscode.Disposable {
    // return empty watcher, as commit file contents can't change
    return {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      dispose: () => {},
    };
  }

  readDirectory(
    _uri: vscode.Uri,
  ): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
    throw new Error("Method not implemented.");
  }
  createDirectory(_uri: vscode.Uri): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }
  writeFile(
    _uri: vscode.Uri,
    _content: Uint8Array,
    _options: { readonly create: boolean; readonly overwrite: boolean },
  ): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }
  delete(_uri: vscode.Uri, _options: { readonly recursive: boolean }): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }
  rename(
    _oldUri: vscode.Uri,
    _newUri: vscode.Uri,
    _options: { readonly overwrite: boolean },
  ): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }
}

interface FileDecorationProviderCallbacks<T extends zod.ZodTypeAny> extends UriFactoryCallbacks<T> {
  decorate: FileDecorator<zod.infer<T>>[];
}

export class UriDecorationProvider<T extends zod.ZodTypeAny> extends UriFactory<T> {
  protected onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  constructor(
    scheme: string,
    querySchema: T,
    protected override readonly callbacks: FileDecorationProviderCallbacks<T>,
  ) {
    super(scheme, querySchema, callbacks);
  }

  register() {
    return vscode.Disposable.from(
      this.onDidChangeEmitter,
      ...this.callbacks.decorate.map((decorate) =>
        vscode.window.registerFileDecorationProvider({
          onDidChangeFileDecorations: this.onDidChangeEmitter.event,
          provideFileDecoration: (uri: vscode.Uri, _token: vscode.CancellationToken) => {
            if (uri.scheme !== this.scheme) return;
            return decorate(this.parseUri(uri));
          },
        }),
      ),
    );
  }

  didChange(...datas: zod.infer<T>[]) {
    this.onDidChangeEmitter.fire(datas.map((data) => this.createUri(data)));
  }
}

export class SimpleUriDecorationProvider {
  protected onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  onDidChangeFileDecorations = this.onDidChangeEmitter.event;

  constructor(
    public readonly scheme: string,
    private readonly decorate: FileDecorator<string>[],
  ) {}

  createUri(path: string) {
    return vscode.Uri.from({ scheme: this.scheme, path });
  }

  register() {
    return vscode.Disposable.from(
      this.onDidChangeEmitter,
      ...this.decorate.map((decorate) =>
        vscode.window.registerFileDecorationProvider({
          onDidChangeFileDecorations: this.onDidChangeEmitter.event,
          provideFileDecoration: reportErrorsNoRethrow(
            (uri: vscode.Uri, _token: vscode.CancellationToken) => {
              if (uri.scheme !== this.scheme) return;
              return decorate(uri.path);
            },
          ),
        }),
      ),
    );
  }

  didChange(...paths: string[]) {
    this.onDidChangeEmitter.fire(paths.map((path) => this.createUri(path)));
  }

  didChangeUri(...uris: vscode.Uri[]) {
    this.onDidChangeEmitter.fire(uris);
  }
}
