import { assert } from "@sergei-dyshel/typescript/error";
import type { ValueOf } from "@sergei-dyshel/typescript/types";
import { setContext, type ContextValue } from "../builtin-commands";

export interface Operand {
  string: () => string;
}

class Literal<T extends number | string> implements Operand {
  constructor(readonly value: T) {}
  string() {
    return String(this.value);
  }
}

class Context implements Operand {
  constructor(readonly key: string) {}
  string() {
    return this.key;
  }
}

class UserContext<T extends ContextValue> extends Context {
  async set(value: T) {
    await setContext(this.key, value);
  }
}

export const UserStringContext = UserContext<string>;

export class StringContext extends Context {
  equals(other: string) {
    return new Binary(this, "==", new Literal(other));
  }
  notEquals(other: string) {
    return new Binary(this, "!=", new Literal(other));
  }
  match(other: string) {
    return Binary.match(this, other);
  }
}

export class FlagsContext<T extends string> extends Context {
  has(other: T) {
    return Binary.match(this, `(^|,)${other}($|,)`);
  }
}

const EQUALS = "==";
const NOT_EQUALS = "!=";
const MATCHES = "=~";
type Operator = typeof EQUALS | typeof NOT_EQUALS | typeof MATCHES;

const MAX_PRIORITY = 10;
const MIN_PRIORITY = 0;

export abstract class Clause {
  protected abstract stringImpl(): string;

  constructor(readonly priority: number = MIN_PRIORITY) {
    assert(priority < MAX_PRIORITY);
  }

  string(outerPriority = MAX_PRIORITY) {
    if (outerPriority < this.priority) return `(${this.stringImpl()})`;
    return this.stringImpl();
  }
}

class Binary extends Clause {
  constructor(
    readonly left: Operand,
    readonly op: Operator,
    readonly right: Operand,
  ) {
    super(1 /* priority */);
  }

  static match(left: Operand, right: string) {
    return new Binary(left, MATCHES, new Literal(`/${right}/`));
  }

  stringImpl() {
    return `${this.left.string()} ${this.op} ${this.right.string()}`;
  }
}

class And extends Clause {
  constructor(readonly clauses: readonly Clause[]) {
    super(2 /* priority */);
  }

  stringImpl(): string {
    return this.clauses.map((cl) => cl.string(this.priority)).join(" && ");
  }
}

class Or extends Clause {
  constructor(readonly clauses: readonly Clause[]) {
    super(3 /* priority */);
  }

  stringImpl(): string {
    return this.clauses.map((cl) => cl.string(this.priority)).join(" || ");
  }
}

class Not extends Clause {
  constructor(readonly clause: Clause) {
    super();
  }

  stringImpl(): string {
    return "!" + this.clause.string(this.priority);
  }
}

class BooleanContext extends Clause {
  constructor(private key: string) {
    super();
  }

  stringImpl() {
    return this.key;
  }

  not() {
    return new Not(this);
  }
}

export class UserBooleanContext extends BooleanContext {
  private context: UserContext<boolean>;
  constructor(key: string) {
    super(key);
    this.context = new UserContext<boolean>(key);
  }
  async set(value = true) {
    await this.context.set(value);
  }
}

export function and(...clauses: readonly Clause[]) {
  for (const cl of clauses) if (isFalse(cl)) return False;
  return new And(clauses.filter((cl) => !isTrue(cl)));
}

export function or(...clauses: readonly Clause[]) {
  for (const cl of clauses) if (isTrue(cl)) return True;
  return new Or(clauses.filter((cl) => !isFalse(cl)));
}

export function not(clause: Clause) {
  return new Not(clause);
}

class BooleanLiteral extends Clause {
  constructor(public readonly value: boolean) {
    super();
  }

  stringImpl() {
    return String(this.value);
  }
}

export function isFalse(clause: Clause) {
  return clause instanceof BooleanLiteral && !clause.value;
}

export function isTrue(clause: Clause) {
  return clause instanceof BooleanLiteral && clause.value;
}

export const False = new BooleanLiteral(false);
export const True = new BooleanLiteral(true);

export const commentController = new StringContext("commentController");
export const commentThread = new FlagsContext<CommentThread>("commentThread");
export const commentThreadIsEmpty = new BooleanContext("commentThreadIsEmpty");
export const resourceScheme = new StringContext("resourceScheme");
export const activeEditor = new StringContext("activeEditor");
export const view = new StringContext("view");
export const viewItem = new StringContext("viewItem");
export const comment = new FlagsContext<Comment>("comment");
export const commentIsEmpty = new BooleanContext("commentIsEmpty");
export const inMultiDiffEditor = activeEditor.equals("multiDiffEditor");

export const fileScheme = resourceScheme.equals("file");

export type CommentThread = ValueOf<typeof CommentThread>;

export const CommentThread = {
  CAN_RESOLVE: "canResolve",
  CAN_UNRESOLVE: "canUnresolve",
  CAN_FLAG: "canFlag",
  CAN_UNFLAG: "canUnflag",
  // REFACTOR: these are crux extension-specific, move there
  IS_TOP: "isTop",
  IS_COMMIT_MESSAGE: "isCommitMessage",
  IS_FILE: "isFile",
} as const;

export type Comment = ValueOf<typeof Comment>;

export const Comment = {
  CAN_EDIT: "canEdit",
} as const;

export function Flags<T extends string>(flags: Record<T, boolean>) {
  const val = Object.keys(flags)
    .filter((key) => flags[key as T])
    .join(",");
  // context must be non-empty string, otherwise comment thread does not refresh
  return val != "" ? val : " ";
}
