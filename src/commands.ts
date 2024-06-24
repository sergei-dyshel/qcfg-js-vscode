import { Dataclass, type DataclassParams } from "@sergei-dyshel/typescript";
import { defaultCompare } from "@sergei-dyshel/typescript/array";
import {
  LoggableError,
  assert,
  assertInstanceOf,
  assertNotNull,
} from "@sergei-dyshel/typescript/error";
import { pick, sortObjectKeys } from "@sergei-dyshel/typescript/object";
import { lowerCaseFirstLetter, upperCaseFirstLetter } from "@sergei-dyshel/typescript/string";
import type { AnyFunction, ValueOf } from "@sergei-dyshel/typescript/types";
import { registerCommand } from "@sergei-dyshel/vscode/error-handling";
import "reflect-metadata";
import type * as vscode from "vscode";
import { ExtensionContext } from "./extension-context";
import { Icon } from "./icon";
import { When } from "./when";

// REFACTOR: move this file to library, add function to set prefix

export const METADATA = Symbol("qcfg-js-vscode/commands/metadata");

type Menu = ValueOf<typeof Menu>;

export const Menu = {
  EDITOR_TITLE: "editor/title",
  COMMENT_TITLE: "comments/comment/title",
  COMMENT_CONTEXT: "comments/comment/context",
  COMMENT_THREAD_CONTEXT: "comments/commentThread/context",
  COMMENT_THREAD_TITLE: "comments/commentThread/title",
  COMMENT_THREAD_TITLE_CONTEXT: "comments/commentThread/title/context",
  COMMENT_THREAD_COMMENT_CONTEXT: "comments/commentThread/comment/context",
  VIEW_TITLE: "view/title",
  VIEW_ITEM_CONTEXT: "view/item/context",
  COMMENT_THREAD_ADDITIONAL_ACTIONS: "comments/commentThread/additionalActions",
  LINE_NUMBER_CONTEXT: "editor/lineNumber/context",
  MULTI_EDITOR_RESOURCE_TITLE: "multiDiffEditor/resource/title",
} as const;

export interface MenuCommand {
  group?: string;
  when?: When.Clause;
}

export interface BaseCommand {
  command: string;
  title: string;
  icon?: Icon;
}

interface Command extends BaseCommand {
  category?: string;
  enablement?: When.Clause;
  commandPallete?: When.Clause;
  callback: AnyFunction;
  menus?: Partial<Record<Menu, MenuCommand>>;
}

/** @param group */
export function OrderedGroup(group = "") {
  let cnt = 0;
  return () => `${group}@${cnt++}`;
}

class CommandsMetadataError extends LoggableError {}

/** @param constructor */
export function getMetadata(constructor: any): Metadata {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
  const metadata = constructor[METADATA];
  if (!metadata) return Metadata.empty;
  assertInstanceOf(
    metadata,
    Metadata,
    "Command metadata must be instance of CommandMetadata class",
  );
  return metadata;
}

export class Metadata extends Dataclass {
  /**
   * First component of command name, usually extension-specific.
   *
   * Needs to be defined when class has commands without custom `name` property.
   */
  commandPrefix?: string;

  /**
   * See {@link vscode.comments.createCommentController}.
   *
   * Must be defined for all classes that have controller commands.
   */
  commentControlledId?: string;

  /**
   * ID of view (webview/tree) contribued by extension.
   *
   * Must be defined in class with view-related commands.
   */
  viewId?: string;

  /**
   * Second component of command name.
   *
   * May be defined for all ${@link Basic} classes
   */
  commandSuffix?: string;

  /** Add this clause to `when` of all commands defined by the class. */
  when?: When.Clause;

  /**
   * ID specific to particuliar type of tree view item.
   *
   * Using separate view item IDs for each type of item allows to separate commands.
   */
  viewItemId?: string;

  static empty = Metadata.create({});

  getCommandPrefix() {
    assertNotNull(this.commandPrefix, "Must define commandPrefix command metadata");
    return this.commandPrefix;
  }

  getCommentControllerId() {
    assertNotNull(this.commentControlledId, "Must define commentControllerId command metadata");
    return this.commentControlledId;
  }

  getViewId() {
    assertNotNull(this.viewId, "Must define viewId command metadata");
    return this.viewId;
  }
}

/** @param metadata */
export function makeMetadata(metadata: DataclassParams<Metadata>) {
  return Metadata.create(metadata);
}

/**
 * @param base
 * @param metadata
 */
export function inheritMetadata(
  base: Function & { prototype: any },
  metadata?: DataclassParams<Metadata>,
) {
  const baseMetadata = getMetadata(base);
  return makeMetadata({ ...baseMetadata, ...metadata });
}

/**
 * @param decoratorName
 * @param decorator
 */
function wrapDecorator(
  decoratorName: string,
  decorator: (args: {
    constructor: any;
    className: string;
    method: Function;
    methodName: string;
    counter: number;
    callback: (item: any) => any;
  }) => void,
) {
  return (target: any, property: string, descriptor: PropertyDescriptor) => {
    assert(
      typeof descriptor.value === "function",
      `${decoratorName} can only be applied to methods methods`,
    );
    const func = descriptor.value as Function;
    assert(func.length == 0, `'${decoratorName}' can only be applied to methods without arguments`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    let counter = Reflect.getMetadata("qcfg-command-counter", target) as number | undefined;
    if (counter === undefined) counter = 0;
    else counter++;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    Reflect.defineMetadata("qcfg-command-counter", counter, target);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const className: string = target.constructor.name;
    const methodName = property;
    try {
      decorator({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        constructor: target.constructor,
        className,
        methodName,
        method: descriptor.value as Function,
        counter: counter,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        callback: (item: any) => (descriptor.value as Function).call(item),
      });
    } catch (err) {
      throw CommandsMetadataError.wrap(err, `Can not define command on ${className}.${methodName}`);
    }
  };
}

/**
 * @param root0
 * @param root0.command
 * @param root0.title
 * @param root0.icon
 * @param root0.group
 * @param root0.when
 */
export function ViewItemCommand({
  command,
  title,
  icon,
  group,
  when,
}: Omit<BaseCommand, "title" | "command"> & {
  command?: string;
  title?: string;
  group?: string;
  when?: When.Clause;
}) {
  const decoratorName = ViewItemCommand.name;
  return wrapDecorator(decoratorName, (args) => {
    const metadata = getMetadata(args.constructor);

    const menuWhen = When.and(
      When.view.equals(metadata.getViewId()),
      metadata.viewItemId ? When.viewItem.equals(metadata.viewItemId) : When.True,
      metadata.when ?? When.True,
    );
    defineCommands({
      command:
        command ??
        [
          metadata.getCommandPrefix(),
          metadata.viewItemId ?? lowerCaseFirstLetter(args.className),
          args.methodName,
        ].join("."),
      title: title ?? upperCaseFirstLetter(args.methodName),
      icon,
      callback: args.callback,
      commandPallete: When.False,
      menus: {
        [Menu.VIEW_ITEM_CONTEXT]: {
          group: makeGroupName(group ?? (icon !== undefined ? "inline" : "menu"), args.counter),
          when: When.and(menuWhen, when ?? When.True),
        },
      },
    });
  });
}

/**
 * @param root0
 * @param root0.command
 * @param root0.title
 * @param root0.icon
 * @param root0.group
 * @param root0.menu
 * @param root0.when
 */
export function CommentCommand({
  command,
  title,
  icon,
  group,
  menu,
  when,
}: Omit<BaseCommand, "command"> & {
  command?: string;
  group?: string;
  menu:
    | typeof Menu.COMMENT_TITLE
    | typeof Menu.COMMENT_CONTEXT
    | typeof Menu.COMMENT_THREAD_COMMENT_CONTEXT;
  when?: When.Clause;
}) {
  return wrapDecorator(CommentCommand.name, (args) => {
    const metadata = getMetadata(args.constructor);
    defineCommands({
      command: command ?? [metadata.getCommandPrefix(), "comment", args.methodName].join("."),
      title,
      icon,
      callback: args.callback,
      commandPallete: When.False,
      menus: {
        [menu]: {
          group: makeGroupName(group ?? (icon !== undefined ? "inline" : undefined), args.counter),
          when: When.and(
            When.commentController.equals(metadata.getCommentControllerId()),
            when ?? When.True,
          ),
        },
      },
    });
  });
}

type DecoratingCommand = Omit<Command, "callback" | "command"> & { command?: string };

export abstract class Basic {
  private static metadataKey = "commands";

  /**
   * Main decorator API, to be overriden for other kinds of commands
   *
   * The command type should be the same as in {@link Basic.processCommand}
   *
   * @param command
   */
  static command(command: DecoratingCommand) {
    return Basic.addCommand(command);
  }

  /**
   * Convert command added in {@link Basic.command} to proper type.
   *
   * Should be overriden for different kinds of commands.
   *
   * @param command
   * @param _counter
   */
  protected processCommand(command: any, _counter: number): DecoratingCommand {
    return command as DecoratingCommand;
  }

  protected static addCommand(command: any) {
    return Reflect.metadata(Basic.metadataKey, command);
  }

  /** For logging, error messages etc. */
  protected get className() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (this as any).constructor.name as string;
  }

  protected commandName(methodName: string) {
    const metadata = getMetadata(this.constructor);
    const words: string[] = [metadata.getCommandPrefix()];
    const suffix = metadata.commandSuffix;
    if (suffix) words.push(suffix);
    words.push(methodName);
    return words.join(".");
  }

  constructor() {
    let counter = 0;
    for (const methodName of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const metadata = Reflect.getMetadata(Basic.metadataKey, this, methodName);
      if (!metadata) continue;
      const command = this.processCommand(metadata, counter++);
      const qualName = `${this.className}.${methodName}`;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const method = (this as any)[methodName] as Function;
      assert(typeof method === "function", `Expected ${qualName} to be function`);
      const callback = method.bind(this) as () => any;

      try {
        defineCommands({
          ...command,
          command: command.command ?? this.commandName(methodName),
          callback,
        });
      } catch (err) {
        throw CommandsMetadataError.wrap(
          err,
          `Can not define command for ${this.constructor.name}.${methodName}`,
        );
      }
    }
  }
}

type DecoratedViewCommand = Omit<DecoratingCommand, "menus"> & {
  group?: string;
  when?: When.Clause;
};

export class View extends Basic {
  static override command(command: DecoratedViewCommand) {
    return Basic.addCommand(command);
  }

  protected override processCommand(command: DecoratedViewCommand, counter: number) {
    const metadata = getMetadata(this.constructor);
    const group = command.group ?? (command.icon ? "navigation" : "_default");
    const when = When.and(When.view.equals(metadata.getViewId()), command.when ?? When.True);
    return {
      ...command,
      commandPallete: command.commandPallete ?? When.False,
      menus: {
        [Menu.VIEW_TITLE]: {
          group: makeGroupName(group, counter),
          when: when,
        },
      },
    };
  }
}

const allCommands: Command[] = [];

/** @param commands */
function defineCommands(...commands: Command[]) {
  allCommands.push(...commands);
}

/**
 * Register all commands defined by using decorators.
 *
 * Called by extension's entry point (`activate` function)
 */
export function register() {
  ExtensionContext.get().subscriptions.push(
    ...allCommands.map((command) => registerCommand(command.command, command.callback)),
  );
}

export function generatePackageJson() {
  allCommands.sort((c1, c2) => defaultCompare(c1.command, c2.command));
  const commands = allCommands.map((command) => ({
    category:
      command.category ??
      (command.commandPallete && !When.isFalse(command.commandPallete) ? "CRUX" : undefined),
    ...pick(command, "command", "title"),
    enablement: command.enablement ? command.enablement.string() : undefined,
    icon: command.icon
      ? command.icon instanceof Icon
        ? command.icon.label
        : command.icon
      : undefined,
  }));
  const commandPallete = allCommands
    .filter(
      (command) => command.commandPallete !== undefined && !When.isTrue(command.commandPallete),
    )
    .map((command) => ({
      command: command.command,
      when: command.commandPallete!.string(),
    }));

  const menus: Record<string, { command: string; group?: string; when?: string }[]> = {
    commandPallete,
  };
  for (const command of allCommands) {
    if (command.menus)
      for (const [menu, info] of Object.entries(command.menus)) {
        if (!(menu in menus)) menus[menu] = [];
        menus[menu].push({
          command: command.command,
          ...info,
          when: !info.when || When.isTrue(info.when) ? undefined : info.when.string(),
        });
      }
  }
  return { commands, menus: sortObjectKeys(menus) };
}

/**
 * @param group
 * @param counter
 */
function makeGroupName(group: string | undefined, counter: number) {
  return group?.includes("@") ? group : (group ?? "") + "@" + String(counter);
}

const COMMENT_THREAD_BACK_REFERENCE = Symbol(
  "qcfg-js-vscode/commands/comment-thread-back-reference",
);

/**
 * @param thread
 * @param backRef
 */
export function commentThreadSetBackReference(thread: vscode.CommentThread, backRef: any) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  (thread as any)[COMMENT_THREAD_BACK_REFERENCE] = backRef;
}

/** @param thread */
export function commentThreadGetBackReference(thread: vscode.CommentThread) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const backRef = (thread as any)[COMMENT_THREAD_BACK_REFERENCE];
  assertNotNull(backRef, "Comment thread back reference not set");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return backRef;
}

/**
 * @param root0
 * @param root0.command
 * @param root0.icon
 * @param root0.title
 * @param root0.when
 * @param root0.menu
 * @param root0.group
 */
export function CommentThreadCommand({
  command,
  icon,
  title,
  when,
  menu,
  group,
}: Omit<BaseCommand, "command"> & {
  command?: string;
  menu?:
    | typeof Menu.COMMENT_THREAD_ADDITIONAL_ACTIONS
    | typeof Menu.COMMENT_THREAD_TITLE
    | typeof Menu.COMMENT_THREAD_CONTEXT
    | typeof Menu.COMMENT_THREAD_TITLE_CONTEXT;
  group?: string;
  when?: When.Clause;
}) {
  return wrapDecorator(CommentThreadCommand.name, (args) => {
    const metadata = getMetadata(args.constructor);

    const menus = {
      [menu ?? (icon ? Menu.COMMENT_THREAD_TITLE : Menu.COMMENT_THREAD_CONTEXT)]: {
        // if group is given and has '@' in it then just use it
        // otherwise append method counter
        group: makeGroupName(group, args.counter),
        when: When.and(
          When.commentController.equals(metadata.getCommentControllerId()),
          when ?? When.True,
          metadata.when ?? When.True,
        ),
      },
    };

    defineCommands({
      command: command ?? [metadata.getCommandPrefix(), "commentThread", args.methodName].join("."),
      title,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument
      callback: (item) => args.method.call(commentThreadGetBackReference(item)),
      commandPallete: When.False,
      icon,
      menus,
    });
  });
}
