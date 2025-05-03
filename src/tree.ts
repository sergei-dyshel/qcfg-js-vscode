import { InstanceLogger, type Logger, ModuleLogger } from "@sergei-dyshel/node/logging";
import { DisposableContainer } from "@sergei-dyshel/typescript";
import { mapAsync, normalizeArray } from "@sergei-dyshel/typescript/array";
import { assert, assertNotNull, LoggableError } from "@sergei-dyshel/typescript/error";
import { objectGetOrSetProperty } from "@sergei-dyshel/typescript/object";
import type { Arrayable, Awaitable, WithRequired } from "@sergei-dyshel/typescript/types";
import {
  type CancellationToken,
  type Command,
  type DataTransfer,
  DataTransferItem,
  EventEmitter,
  type FileDecoration,
  type MarkdownString,
  type TreeCheckboxChangeEvent,
  type TreeDataProvider,
  type TreeDragAndDropController,
  TreeItem,
  TreeItemCheckboxState,
  TreeItemCollapsibleState,
  type TreeView,
  type TreeViewSelectionChangeEvent,
  type Uri,
  window,
} from "vscode";
import { libraryLogger } from "./common";
import { reportErrorsAndRethrow, reportErrorsNoRethrow } from "./error-handling";
import { Commands } from "./namespaces/commands";
import { URI } from "./uri";

const logger = new ModuleLogger({ parent: libraryLogger });

/**
 * Interface that every tree item must implement
 *
 * For better type safety can be parametrized by node type (but not required).
 */
export interface TreeNode {
  /** Same as {@link TreeDataProvider.getChildren} */
  getChildren?(): Awaitable<TreeNode[]> | undefined;
  /**
   * Same as {@link TreeDataProvider.getTreeItem}
   *
   * Should not provide {@link TreeItem.checkboxState}, instead use {@link TreeNode.getChecked}
   */
  getTreeItem(): Awaitable<TreeItem>;
  /** Called when node is selected */
  onSelected?(): void;
  /**
   * Called together with {@link TreeNode.getTreeItem getTreeItem} to augment TreeItem with checkbox
   * state
   */
  getChecked?(): Awaitable<boolean>;
  /** Called when node checkbox state changes */
  onChecked?(checked: boolean): void;
  /** Called when node starts dragging, returns whether node can be dragged */
  onDrag?(): boolean;
  /**
   * Called when dropping another node from same tree
   *
   * NOTE: dropping other items is not supported
   */
  onDrop?(source: TreeNode): void | Promise<void>;
  /** @returns Object where keys are decoration names provided in {@link Tree.createView} */
  getDecorations?(): Tree.Decorations | undefined;
  /**
   * When parent node provides {@link TreeItem.resourceUri}, construct this node's resourceUri by
   * appending these segments to path.
   *
   * NOTE: when defined, {@link TreeItem.resourceUri} returned {@link TreeNode.getTreeItem} for this
   * node should be undefined
   */
  // REFACTOR: make this a property
  getUriPathSegments?(): Arrayable<string>;
  /**
   * Provide tooltip/command later when ${@link Tree.getTreeItem} returned tree item without them.
   *
   * See {@link TreeDataProvider.resolveTreeItem} for further explanation.
   */
  resolveTreeItem?(): Awaitable<{
    tooltip?: string | MarkdownString;
    command?: Command;
  }>;
}

interface StaticTreeNodeParams {
  treeItem: TreeItem;
  children?: TreeNode[];
  pathSegments?: Arrayable<string>;
  decorations?: Tree.Decorations;
}

/**
 * Convenience class to quickly define TreeNode that never changes by providing all callback's
 * results as parameters.
 *
 * NODE: for node with checkboxes use {@link StaticCheckBoxTreeNode}
 */
export class StaticTreeNode implements TreeNode {
  readonly treeItem: TreeItem;
  readonly children?: TreeNode[];
  readonly pathSegments?: Arrayable<string>;

  getChecked?: TreeNode["getChecked"];
  getChildren?: TreeNode["getChildren"];
  getDecorations?: TreeNode["getDecorations"];

  constructor(params: StaticTreeNodeParams) {
    this.treeItem = params.treeItem;
    this.pathSegments = params.pathSegments;
    if (params.children) {
      this.children = params.children;
      this.getChildren = function (this: StaticTreeNode) {
        return this.children;
      };
    }
    if (params.decorations) {
      this.getDecorations = function (this: StaticTreeNode) {
        return params.decorations;
      };
    }
  }

  getTreeItem() {
    return this.treeItem;
  }

  getUriPathSegments() {
    return this.pathSegments;
  }
}

/**
 * Like {@link StaticTreeNode} but with checkbox.
 */
export class StaticCheckBoxTreeNode extends StaticTreeNode {
  onChecked: TreeNode["onChecked"];

  constructor(params: StaticTreeNodeParams & { checked: boolean } & Pick<TreeNode, "onChecked">) {
    super(params);
    this.checked = params.checked;
    this.onChecked = params.onChecked;
  }

  get checked() {
    return this.treeItem.checkboxState === TreeItemCheckboxState.Checked;
  }

  set checked(state: boolean) {
    this.treeItem.checkboxState = state
      ? TreeItemCheckboxState.Checked
      : TreeItemCheckboxState.Unchecked;
  }
}

export function newTreeItem(
  params: (WithRequired<TreeItem, "label"> | WithRequired<TreeItem, "resourceUri">) & {
    /** Shortcut for setting {@link TreeItem.collapsibleState} */
    expanded?: boolean;
  },
) {
  const treeItem = params.label ? new TreeItem(params.label) : new TreeItem(params.resourceUri!);
  treeItem.id = params.id;
  treeItem.resourceUri = params.resourceUri;
  treeItem.command = params.command;
  treeItem.iconPath = params.iconPath;
  treeItem.checkboxState = params.checkboxState;
  treeItem.tooltip = params.tooltip;
  treeItem.description = params.description;
  treeItem.contextValue = params.contextValue;
  treeItem.collapsibleState =
    params.expanded !== undefined
      ? params.expanded
        ? Tree.EXPANDED
        : Tree.COLLAPSED
      : params.collapsibleState;
  return treeItem;
}

export class RadioBoxGroup<T extends TreeNode> {
  readonly nodes: T[] = [];

  private checked_: T;

  /**
   * @param checked Initially checked node, by default first one.
   */
  constructor(nodes: T[], checked?: T) {
    assert(nodes.length > 0, "RadioBoxGroup created with no nodes");
    this.checked_ = checked ?? nodes[0];
    assert(nodes.includes(this.checked_), "Default checked nodoe is not in the list");
    for (const node of nodes) this.add(node);
  }

  get checked() {
    return this.checked_;
  }

  set checked(node: T) {
    assert(this.nodes.includes(node), "Trying to check node that is not in the list");
    if (this.checked === node) return;
    const prev = this.checked;
    this.checked_ = node;

    // update will call onChecked which will provide updated value
    Tree.dataChanged(prev);
    Tree.dataChanged(node);
  }

  /**
   * Called when currently checked item changes.
   *
   * To be overriden in subclasses.
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onChecked(_node: T) {}

  private add(node: T) {
    this.nodes.push(node);
    assert(node.onChecked === undefined, "Should not define onChecked callback on RadioBoxNode");
    assert(node.getChecked === undefined, "Should not define getChecked callback on RadioBoxNode");

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const group = this;
    node.getChecked = function (this: T) {
      return group.checked == this;
    };
    node.onChecked = function (this: T, checked: boolean) {
      if (this === group.checked) {
        // if user tried to uncheck currently checked node, check it back by emitting changed event
        if (!checked) Tree.dataChanged(this);
      } else {
        group.checked = this;
        group.onChecked(this);
      }
    };
  }
}

/**
 * Integration of {@link TreeNode} with VScode's APIs ({@link TreeDataProvider} and
 * ${@link TreeDragAndDropController}).
 *
 * @template T Optional type which can be union of all node types used in the tree. NOTE: since
 *   TreeNode is not templated, there is no type-checking for that.}
 */
export class Tree<T extends TreeNode = TreeNode>
  extends DisposableContainer
  implements TreeDataProvider<T>, TreeDragAndDropController<T>
{
  logger!: Logger;

  /** Initialized with {@link Tree.createView } */
  treeView!: TreeView<T>;
  viewId!: string;

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  private readonly onChangeEmitter = new EventEmitter<T | T[] | undefined | void>();
  private data: T[] = [];
  private promise?: Promise<T[]>;

  protected decorationChangeEmitter = new EventEmitter<Uri | Uri[] | undefined>();

  static readonly EXPANDED = TreeItemCollapsibleState.Expanded;
  static readonly COLLAPSED = TreeItemCollapsibleState.Collapsed;

  async getData(): Promise<T[]> {
    if (this.promise) return await this.promise;
    return this.data;
  }

  createView(
    viewId: string,
    options?: { allowDragAndDrop?: boolean; decorationNames?: readonly string[] },
  ) {
    this.viewId = viewId;
    this.logger = new InstanceLogger(viewId, { parent: logger });
    this.treeView = window.createTreeView<T>(viewId, {
      treeDataProvider: this,
      dragAndDropController: options?.allowDragAndDrop ? this : undefined,
    });
    this.treeView.onDidChangeSelection(
      reportErrorsNoRethrow((event: TreeViewSelectionChangeEvent<T>) =>
        this.onDidChangeSelection(event),
      ),
    );
    this.treeView.onDidChangeCheckboxState(
      reportErrorsNoRethrow((event: TreeCheckboxChangeEvent<T>) =>
        this.onDidChangeCheckboxState(event),
      ),
    );
    this.registerDisposable(this.treeView);
    if (options?.decorationNames) {
      this.registerDisposable(
        ...options.decorationNames.map((name) =>
          window.registerFileDecorationProvider({
            onDidChangeFileDecorations: this.decorationChangeEmitter.event,
            provideFileDecoration: async (uri: Uri, _token: CancellationToken) => {
              const node = await this.findFirstNode((node) => {
                const resourceUri = this.getMetadata(node).treeItem?.resourceUri;
                return resourceUri ? URI.equals(uri, resourceUri) : false;
              });
              if (!node) return;
              const metadata = this.getMetadata(node);
              if (!metadata.decorations && node.getDecorations) {
                metadata.decorations = node.getDecorations() ?? {};
                for (const name in metadata.decorations)
                  assert(
                    options.decorationNames!.includes(name),
                    `Unknown decoration name ${name}`,
                    node,
                  );
              }
              if (metadata.decorations) return metadata.decorations[name];
              return;
            },
          }),
        ),
      );
    }
    return this;
  }

  // OPTIMIZE: : go over all Tree.setData uses and add recursive = false where possible
  setData(data: T[], recursive?: boolean): void;
  setData(data: Promise<T[]>, recursive?: boolean): Promise<void>;
  async setData(data: Awaitable<T[]>, recursive = true) {
    this.data.forEach((node) => this.clearMetadata(node, recursive));
    this.onChangeEmitter.fire(undefined);
    if (data instanceof Promise) {
      this.promise = data;
      try {
        this.data = await data;
      } finally {
        this.promise = undefined;
      }
    } else {
      this.data = data;
    }
  }

  async expandAll(levels?: number) {
    await mapAsync(this.data, async (node) =>
      this.treeView.reveal(node, { expand: levels ?? true }),
    );
  }

  // OPTIMIZE: go over all Tree.dataChanged uese and add recursive = false where possible
  dataChanged(node: T | T[] | undefined = undefined, recursive = true) {
    const nodes = node ? (Array.isArray(node) ? node : [node]) : this.data;
    for (const node of nodes) this.clearMetadata(node, recursive);
    this.onChangeEmitter.fire(node);
  }

  static dataChanged<T extends TreeNode>(node: T) {
    this.getTree(node).dataChanged(node);
  }

  updateDecorations(node: T, propogateToParent = false) {
    const metadata = this.getMetadata(node);
    assertNotNull(
      !metadata.treeItem,
      "Can not update decorations on node which have not called getTreeItem yet",
    );
    assertNotNull(
      !metadata.treeItem?.resourceUri,
      "Can not update decorations on node that does not provide resourceUri",
    );
    metadata.decorations = undefined;
    this.decorationChangeEmitter.fire(metadata.treeItem?.resourceUri);
    if (propogateToParent && metadata.parent)
      this.updateDecorations(metadata.parent, propogateToParent);
  }

  async *iterateNodes(root?: T): AsyncIterableIterator<T> {
    if (!root) {
      for (const root of await this.getData())
        for await (const node of this.iterateNodes(root)) yield node;
      return;
    }
    yield root;
    for (const child of (await this.getChildren(root)) ?? [])
      for await (const node of this.iterateNodes(child)) yield node;
  }

  async findFirstNode(condition: (_: T) => boolean, root?: T) {
    for await (const node of this.iterateNodes(root)) if (condition(node)) return node;
    return undefined;
  }

  /**
   * Get {@link Tree} of node, recorded in in its metadata.
   *
   * Prefer to use Tree object directly (from code context) instead of this function.
   */
  static getTree<T extends TreeNode>(node: T) {
    return this.getMetadata(node).tree;
  }

  private clearMetadata(node: T, recursive: boolean) {
    const metadata = this.getMetadata(node);
    if (recursive && metadata.children)
      metadata.children.forEach((child) => this.clearMetadata(child, recursive));
    metadata.treeItem = undefined;
    metadata.children = undefined;
    metadata.decorations = undefined;
  }

  private getMetadata(node: T) {
    // the idiomatic way here is to use WeakMap
    // but embedding metadata in the node makes debugging easier
    return objectGetOrSetProperty(node, "__tree", () => new TreeNodeMetadata<T>(this));
  }

  private static getMetadata<T extends TreeNode>(node: T) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const metadata = (node as any).__tree as TreeNodeMetadata<T>;
    assertNotNull(metadata, "Node does not have metadata yet", node);
    return metadata;
  }

  private onDidChangeSelection(event: TreeViewSelectionChangeEvent<T>) {
    for (const selected of event.selection) if (selected.onSelected) selected.onSelected();
  }

  private onDidChangeCheckboxState(event: TreeCheckboxChangeEvent<T>) {
    for (const [node, state] of event.items) {
      node.onChecked?.(state === TreeItemCheckboxState.Checked);
    }
  }

  getResourceUri(node: T) {
    return this.getMetadata(node).treeItem?.resourceUri;
  }

  /*
   * TreeDataProvider impl
   */

  // REFACTOR: go over all getTreeItem implementations and remove explicit caching
  getTreeItem(node: T) {
    return reportErrorsAndRethrow(
      async () => {
        const metadata = this.getMetadata(node);
        if (metadata.treeItem) return metadata.treeItem;
        const treeItem = await node.getTreeItem();
        // this will overwrite checkboxState if it was provided by getTreeItem
        if (node.getChecked)
          treeItem.checkboxState = (await node.getChecked())
            ? TreeItemCheckboxState.Checked
            : TreeItemCheckboxState.Unchecked;
        // if available, copy static property viewItemId from node class so that
        // commands defined with decorator would work (the "when" clause)
        if (!treeItem.contextValue) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const metadata = Commands.getMetadata((node as any)?.constructor);
          if (metadata.viewItemId) {
            assert(
              treeItem.contextValue === undefined,
              "Can not override `contextValue` when `viewItemId` is defined by tree view item class",
              treeItem,
            );
            treeItem.contextValue = metadata.viewItemId;
          }
        }

        const parentTreeItem = metadata.parent
          ? await this.getTreeItem(metadata.parent)
          : undefined;
        const pathSegments = normalizeArray(node.getUriPathSegments?.());
        if (pathSegments.length > 0) {
          assertNotNull(metadata.parent, `Node only defines path segments but has no parent`, node);
          const parentUri = parentTreeItem?.resourceUri;
          if (!parentUri)
            throw new LoggableError(
              `Node only defines path segments but parent node does not provide resourceUri`,
              { data: [node] },
            );
          const resourceId = URI.appendPath(parentUri, ...pathSegments);
          // usually user should not define both treeItem.resourceId and getUriPathSegments
          // but in certain cases like StaticTreeNode resourceId will be calculated and filled into treeItem
          if (treeItem.resourceUri) {
            assert(
              URI.equals(treeItem.resourceUri, resourceId),
              `Static TreeItem.resourceUri does not match one calculated with getUriPathSegments`,
              treeItem,
              resourceId,
            );
          }
          treeItem.resourceUri = resourceId;
        }

        metadata.treeItem = treeItem;

        if (node.getDecorations) {
          const uri = treeItem.resourceUri;
          assertNotNull(
            uri,
            `Can not have getDecorations defined on node which doesn't provide resourceUri`,
            node,
          );
          this.decorationChangeEmitter.fire(uri);
        }

        return treeItem;
      },
      {
        prefix: "getTreeItem failed: ",
      },
    )();
  }

  async getChildren(node?: T): Promise<T[] | undefined> {
    if (node) {
      const metadata = this.getMetadata(node);
      if (metadata.children) return metadata.children;
    }

    return reportErrorsNoRethrow(
      async () => {
        if (node === undefined) {
          if (this.promise) {
            this.data = await this.promise;
          }
          return this.data;
        }
        const metadata = this.getMetadata(node);
        metadata.children = ((await node.getChildren?.()) ?? []) as T[];
        for (const child of metadata.children) this.getMetadata(child).parent = node;
        return metadata.children;
      },
      { prefix: "getChildren failed: " },
    )();
  }

  getParent(node: T): T | undefined {
    return this.getMetadata(node).parent;
  }

  async resolveTreeItem(treeItem: TreeItem, node: T, _: CancellationToken) {
    if (!node.resolveTreeItem) return undefined;
    const resolved = await node.resolveTreeItem();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!resolved) return undefined;
    treeItem.tooltip = resolved.tooltip ?? treeItem.tooltip;
    treeItem.command = resolved.command ?? treeItem.command;
    return treeItem;
  }

  get onDidChangeTreeData() {
    return this.onChangeEmitter.event;
  }

  /** TreeDragAndDropController impl */

  private get mimeType() {
    return `application/vnd.code.tree.<${this.viewId.toLowerCase()}>`;
  }

  get dropMimeTypes() {
    return [this.mimeType];
  }

  get dragMimeTypes() {
    return [this.mimeType];
  }

  handleDrag(sources: readonly T[], dataTransfer: DataTransfer, _token: CancellationToken) {
    reportErrorsNoRethrow(() => {
      assert(sources.length === 1, "Multi-select not supported");
      const node = sources[0];
      if (!node.onDrag) return;
      if (!node.onDrag()) return;
      const md = this.getMetadata(node);
      assertNotNull(md.treeItem);
      assertNotNull(md.treeItem.resourceUri, "Dragged node has no resourceUri");
      this.logger.debug(`Dragging node`, sources[0], node);
      // DataTrasfer values must be JSON objects
      dataTransfer.set(
        this.mimeType,
        new DataTransferItem(md.treeItem.resourceUri.toString(true /* skipEncoding */)),
      );
    })();
  }

  async handleDrop(target: T | undefined, dataTransfer: DataTransfer, _token: CancellationToken) {
    return reportErrorsNoRethrow(async () => {
      const dtItem = dataTransfer.get(this.mimeType);
      assertNotNull(dtItem, `No DataTransferItem for tree's MIME type`);
      const sourceUri = dtItem.value as string;
      const source = await this.findFirstNode(
        (node) =>
          this.getMetadata(node).treeItem?.resourceUri?.toString(true /* skipEncoding */) ===
          sourceUri,
      );
      assertNotNull(source, "Can not find dragged node with uri", sourceUri);
      if (!target) {
        this.logger.debug(`Tree view ${this.viewId}: dropping outside`, source);
        return;
      }
      // if (source.__type === 'uri') logger.debug(`Tree view ${this.viewId}: dropping onto`, source, target);
      if (target.onDrop) {
        await target.onDrop(source);
        return;
      }
      this.logger.debug(`onDrop not implemented`, target);
    })();
  }
}

export namespace Tree {
  /**
   * Instantiate this type with elements of array provided to {@link Tree.createView}
   *
   * Example:
   *
   *     const decorationNames = ["a", "b"] as const;
   *     tree.createView("id", { decorationNames });
   *     type Decorations = Tree.Decorations<(typeof decorationNames)[number]>;
   *     class Node implements TreeNode {
   *       getDecorations(): Decorations {
   *         return { a: new FileDecoration("A"), b: undefined };
   *       }
   *     }
   */
  export type Decorations<T extends string = string> = Partial<
    Record<T, FileDecoration | undefined>
  >;
}

class TreeNodeMetadata<T extends TreeNode> {
  constructor(readonly tree: Tree<T>) {}
  treeItem?: TreeItem;
  children?: T[];
  parent?: T;
  decorations?: Record<string, FileDecoration | undefined> | undefined;
}
