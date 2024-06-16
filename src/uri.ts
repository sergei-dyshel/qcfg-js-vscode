import { join } from "node:path";
import * as querystring from "node:querystring";
import { Uri } from "vscode";

export namespace URI {
  export function appendPath(uri: Uri, ...pathSegments: string[]) {
    // joinPath can be only called on Uri which has non-empty path
    return uri.path === ""
      ? uri.with({ path: join(...pathSegments) })
      : Uri.joinPath(uri, ...pathSegments);
  }

  export function appendQuery(uri: Uri, query: Record<string, any>) {
    const oldQuery = uri.query === "" ? {} : querystring.parse(uri.query);
    const newQuery = querystring.stringify(Object.assign(oldQuery, query));
    return uri.with({ query: newQuery });
  }

  export function equals(uri: Uri, other: Uri) {
    return uri.toString() === other.toString();
  }
}
