import type { PackageJson } from "@sergei-dyshel/node";
import { exists, FileWatcher } from "@sergei-dyshel/node/filesystem";
import { ModuleLogger } from "@sergei-dyshel/node/logging";
import type { DisposableLike } from "@sergei-dyshel/typescript";
import {
  filterNonNull,
  lessCompare,
  mapAsync,
  mapSomeAsync,
} from "@sergei-dyshel/typescript/array";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { type Extension, extensions } from "vscode";
import { reloadWindow, restartExtensionHost } from "./builtin-commands";
import { ExtensionContext } from "./extension-context";
import { Message } from "./namespaces/message";

const logger = new ModuleLogger();

/**
 * Schema for VScode extension manifest (package.json).
 *
 * Superset of {@link PackageJson.PackageJson}. Basec on
 * {@link https://code.visualstudio.com/api/references/extension-manifest}.
 */
export type ExtensionManifest = PackageJson.PackageJson & {
  name: string;
  version: string;
  publisher: string;
  engines: {
    vscode: string;
  };
  displayName?: string;
};

export namespace Extensions {
  /**
   * Similar to {@link extensions.all} but returns ALL installed extensions, including new versions
   * etc.
   */
  export async function listInstalled() {
    const roots = listRoots();
    const dirs = (
      await mapAsync(roots, async (root) => (await readdir(root)).map((dir) => join(root, dir)))
    ).flat();
    return mapSomeAsync(dirs, (dir) => parseExtensionDir(dir));
  }

  /**
   * Return all directories which have installed extensions in them
   */
  export function listRoots() {
    const knownExtensions = extensions.all.map((ext) => {
      // skip current extension path if running in debugger, because the path would be git repo and not installed path
      if (ExtensionContext.inDevelopmentMode() && ext.id === ExtensionContext.get().extension.id)
        return undefined;
      return ext.extensionPath;
    });
    return [...new Set(filterNonNull(knownExtensions).map((path) => dirname(path)))];
  }

  /**
   * Best effort to get readable name of extension
   */
  export function name(extension: Extension<any>) {
    const packageJson = extension.packageJSON as ExtensionManifest;
    return packageJson.displayName ?? extension.id;
  }
}

/**
 * Detect new extension versions install and propse user to restart.
 */
export class ExtensionUpdateChecker implements DisposableLike {
  private GRACE_TIME_MS = 1000;
  private timeout?: NodeJS.Timeout;
  private watcher: FileWatcher;
  private lastUpdateTime!: Date;
  private checkRunning = false;

  private constructor(readonly extension: Extension<any>) {
    this.watcher = new FileWatcher(undefined /* paths */, { ignoreInitial: true, depth: 2 });
  }

  static async register(extension?: Extension<any>) {
    if (!extension) extension = ExtensionContext.get().extension;
    const self = new ExtensionUpdateChecker(extension);
    self.watcher.add(Extensions.listRoots());
    self.watcher.onAny((event, path) => {
      // filter out non-interesting updates
      if ((event !== "change" && event !== "add") || !path.includes(extension.id)) return;

      if (self.timeout) clearTimeout(self.timeout);
      self.timeout = setTimeout(() => {
        void self.check();
      }, self.GRACE_TIME_MS);
    });
    self.lastUpdateTime = (await parseExtensionDir(extension.extensionPath))!.time;
    ExtensionContext.get().subscriptions.push(self);
    logger.info(`Watching extension updates for ${self.extension.id}`);
  }

  private async check() {
    if (this.checkRunning) return;
    this.checkRunning = true;

    try {
      const allVersions = (await Extensions.listInstalled()).filter(
        (ext) => ext.id === this.extension.id,
      );
      allVersions.sort(lessCompare((v1, v2) => v1.time < v2.time));
      logger.debug(
        `All installed versions of ${this.extension.id}:`,
        allVersions.map(({ version, time }) => ({ version, time })),
      );
      if (allVersions.length === 0) {
        logger.debug(`No versions of ${this.extension.id} installed`);
        return;
      }
      const latestVersion = allVersions.at(-1)!;
      if (latestVersion.time > this.lastUpdateTime) {
        this.lastUpdateTime = latestVersion.time;
        await Message.select(
          "warn",
          `"${Extensions.name(this.extension)}" extension was updated to version ${latestVersion.version}`,
          ["Restart extensions", () => restartExtensionHost()],
          ["Reload window", () => reloadWindow()],
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          ["Ignore", () => {}],
        );
      }
    } finally {
      this.checkRunning = false;
    }
  }

  dispose() {
    if (this.timeout) clearTimeout(this.timeout);
    this.watcher.dispose();
  }
}

async function parseExtensionDir(path: string) {
  const packageJsonPath = join(path, "package.json");
  if (!(await exists(packageJsonPath))) return undefined;
  const packageJson = JSON.parse(
    await readFile(packageJsonPath, { encoding: "utf-8" }),
  ) as ExtensionManifest;
  const publisher = packageJson.publisher;
  const time = (await stat(packageJsonPath)).mtime;
  return {
    publisher,
    /* Extension ID */
    id: `${publisher}.${packageJson.name}`,
    name: packageJson.name,
    version: packageJson.version,
    /* Extension directory path */
    extensionPath: path,
    /** Contents of package.json */
    packageJson,
    /** Install time of extensions, based on mtime of package.json */
    time,
  } as const;
}
