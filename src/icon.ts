import { assertNotNull } from "@sergei-dyshel/typescript/error";
import * as vscode from "vscode";
import { ExtensionContext } from "./extension-context";

export class Icon {
  readonly themeIcon: vscode.ThemeIcon;

  constructor(
    private id: string,
    color?: string,
  ) {
    assertNotNull(id.match(/^[a-z-]+$/), `Builtin icon ID ${id} must be kebab-case`);
    this.themeIcon = new vscode.ThemeIcon(id, color ? new vscode.ThemeColor(color) : undefined);
  }

  withColor(color: vscode.ThemeColor) {
    return new vscode.ThemeIcon(this.id, color);
  }

  // should not have public property `id` otherwise Typescript compiler will confuse it with ThemeIcon
  get name() {
    return this.id;
  }

  get label() {
    return `$(${this.id})`;
  }

  toString() {
    return this.label;
  }
}

/**
 * Codicons builtin in VS code
 *
 * Look in https://microsoft.github.io/vscode-codicons/dist/codicon.html
 */
export namespace BuiltinIcon {
  export const DELETE = new Icon("delete");
  export const GLOBE = new Icon("globe");
  export const GIT_COMPARE = new Icon("git-compare");
  export const TRASH = new Icon("trash");
  export const CLOUD_UPLOAD = new Icon("cloud-upload");
  export const EXPAND_ALL = new Icon("expand-all");
  export const COLLAPSE_ALL = new Icon("collapse-all");
  export const PENCIL = new Icon("pencil");
  export const REFRESH = new Icon("refresh");
  export const FOLDER_OPENED = new Icon("folder-opened");
  export const ADD = new Icon("add");
  export const CLOSE = new Icon("close");
  export const TARGET = new Icon("target");
  export const COMMENT_DISCUSSION = new Icon("comment-discussion");
  export const FOLDER = new Icon("folder");
  export const PACKAGE = new Icon("package");
  export const PACKAGE_INVALID = new Icon("package", "list.invalidItemForeground");
  export const GIT_PULL_REQUEST = new Icon("git-pull-request");
  export const GIT_COMMIT = new Icon("git-commit");
  export const ARROW_CIRCLE_UP = new Icon("arrow-circle-up");
  export const SETTINGS_GEAR = new Icon("settings-gear");
  export const ALERT = new Icon("alert");
  export const CHECK = new Icon("check");
  export const HISTORY = new Icon("history");
  export const ACCOUNT = new Icon("account");
  export const INBOX = new Icon("inbox");
  export const ORGANIZATION = new Icon("organization");
  export const DIFF_MULTIPLE = new Icon("diff-multiple");
  export const COPY = new Icon("copy");
  export const MERGE = new Icon("merge");
  export const CIRCLE_SLASH = new Icon("circle-slash");
  export const REACTIONS = new Icon("reactions");
  export const THUMBS_UP = new Icon("thumbsup");
  export const THUMBS_DOWN = new Icon("thumbsdown");
}

export class FontIcon extends Icon {
  constructor(
    id: string,
    public readonly character: string,
    color?: string,
  ) {
    super(id, color);
  }
}

/**
 * Icons from Nerd Fonts (https://www.nerdfonts.com/)
 *
 * Search all icons - https://www.nerdfonts.com/cheat-sheet.
 *
 * Search individual sets:
 *
 * - Material design - https://fonts.google.com/icons
 * - FontAwesome - https://fontawesome.com/search?o=r&m=free
 *
 * The patched font does not matter, as we only use symbols, but must use "Propo" variant of the
 * font.
 */
export const NerdFont = {
  /**
   * To add new icon:
   *
   * - Find icon in https://www.nerdfonts.com/cheat-sheet
   * - Copy UTF code by clicking on UTF
   */
  FA_SEND_O: new FontIcon("fa-send-o", "\uf1d9"),
  MD_PUBLISH: new FontIcon("md-email-send-outline", "\udb81\udea7"),
} as const;

type IconsContributionPoint = Record<
  string,
  {
    description: string;
    default: {
      fontPath: string;
      fontCharacter: string;
    };
  }
>;

export function generateFontIconsContribution(fontPath: string, icons: Record<string, FontIcon>) {
  const result: IconsContributionPoint = {};
  for (const icon of Object.values(icons)) {
    result[icon.name] = {
      description: "font icon",
      default: {
        fontPath,
        fontCharacter: icon.character,
      },
    };
  }
  return result;
}

/**
 * Icon stored in some resources dir.
 *
 * Can be used in both package.json and dynamically (via {@link ResourceIcon.uri}).
 */
export class ResourceIcon {
  constructor(readonly path: string) {}

  get uri() {
    return ExtensionContext.get().asAbsolutePath(this.path);
  }
}
