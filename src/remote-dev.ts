import { assert, assertNotNull } from "@sergei-dyshel/typescript/error";
import { removePrefix } from "@sergei-dyshel/typescript/string";
import { env, Uri } from "vscode";

const REMOTE_SCHEME = "vscode-remote";

/** Describes remote environment in which VScode runs */
export interface RemoteEnv {
  /** Type of remote connection as defined by extension, taken from {@link env.remoteName} */
  type: string;

  /** Hostname of remote connection, extracted from {@link env.remoteAuthority} */
  name: string;
}

export namespace RemoteEnv {
  /**
   * Current environment in which VScode extension runs, or 'undefined' if running locally
   */
  export function current(): RemoteEnv | undefined {
    if (env.remoteName === undefined) return undefined;

    assertNotNull(env.remoteAuthority);
    return { type: env.remoteName, name: removePrefix(env.remoteAuthority, env.remoteName + "+") };
  }

  export function equal(env1: RemoteEnv | undefined, env2: RemoteEnv | undefined) {
    return (
      (env1 === undefined && env2 === undefined) ||
      (env1 !== undefined &&
        env2 !== undefined &&
        env1.name == env2.name &&
        env1.type === env2.type)
    );
  }

  export function isRemoteUri(uri: Uri) {
    return uri.scheme === REMOTE_SCHEME;
  }

  export function toRemoteUri(uri: Uri | string, remote: RemoteEnv) {
    if (uri instanceof Uri) assert(uri.scheme === "file");
    const path = uri instanceof Uri ? uri.fsPath : uri;
    const authority = `${remote.type}+${remote.name}`;
    return Uri.from({ scheme: REMOTE_SCHEME, authority, path });
  }
}
