import { InstanceLogger, ModuleLogger, type Logger } from "@sergei-dyshel/node/logging";
import { DisposableContainer } from "@sergei-dyshel/typescript";
import { mapAsync } from "@sergei-dyshel/typescript/array";
import * as fail from "@sergei-dyshel/typescript/error";
import { assert } from "@sergei-dyshel/typescript/error";
import { objectGetOrSetProperty } from "@sergei-dyshel/typescript/object";
import type { Awaitable } from "@sergei-dyshel/typescript/types";
import { Commands, URI } from "@sergei-dyshel/vscode";
import { reportErrors } from "@sergei-dyshel/vscode/error-handling";
import * as vscode from "vscode";
import { libraryLogger } from "./common";

const logger = new ModuleLogger({ parent: libraryLogger });

export interface TreeNode<T = unknown> {
  /** Same as {@link vscode.TreeDataProvider.getChildren} */
  getChildren?(): Awaitable<T[]> | undefined;
  /** Same as {@link vscode.TreeDataProvider.getTreeItem} */
  getTreeItem(): Awaitable<vscode.TreeItem>;
  /** Called when node is selected */
  onSelected?(): void;
  /** Called when node starts dragging, returns whether node can be dragged */
  onDrag?(): boolean;
  /**
   * Called when dropping another node from same tree
   *
   * NOTE: dropping other items is not supported
   */
  onDrop?(source: T): void | Promise<void>;
  /** @returns Object where keys are decoration names provided in {@link Tree.createView} */
  getDecorations?(): Record<string, vscode.FileDecoration | undefined> | undefined;
  /**
   * When parent node provides {@link vscode.TreeItem.resourceUri}, construct this node's resourceUri
   * by appending these segments to path.
   */
  getUriPathSegments?(): string[] | string;
  /**
   * Provide tooltip/command later when ${@link Tree.getTreeItem} returned tree item without them.
   *
   * See {@link vscode.TreeDataProvider.resolveTreeItem} for further explanation.
   */
  resolveTreeItem?(): Awaitable<{
    tooltip?: string | vscode.MarkdownString;
    command?: vscode.Command;
  }>;
}

export class Tree<T extends TreeNode<T>>
  extends DisposableContainer
  implements vscode.TreeDataProvider<T>, vscode.TreeDragAndDropController<T>
{
  logger!: Logger;

  /** Initialized with {@link Tree.createView } */
  treeView!: vscode.TreeView<T>;
  viewId!: string;

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  private readonly onChangeEmitter = new vscode.EventEmitter<T | T[] | undefined | void>();
  private data: T[] = [];
  private promise?: Promise<T[]>;

  protected decorationChangeEmitter = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();

  static readonly EXPANDED = vscode.TreeItemCollapsibleState.Expanded;
  static readonly COLLAPSED = vscode.TreeItemCollapsibleState.Collapsed;

  createView(viewId: string, options?: { allowDragAndDrop?: boolean; decorationNames?: string[] }) {
    this.viewId = viewId;
    this.logger = new InstanceLogger(viewId, { parent: logger });
    this.treeView = vscode.window.createTreeView<T>(viewId, {
      treeDataProvider: this,
      dragAndDropController: options?.allowDragAndDrop ? this : undefined,
    });
    this.treeView.onDidChangeSelection(
      reportErrors((event: vscode.TreeViewSelectionChangeEvent<T>) =>
        this.onDidChangeSelection(event),
      ),
    );
    this.registerDisposable(this.treeView);
    if (options?.decorationNames) {
      this.registerDisposable(
        ...options.decorationNames.map((name) =>
          vscode.window.registerFileDecorationProvider({
            onDidChangeFileDecorations: this.decorationChangeEmitter.event,
            provideFileDecoration: (uri: vscode.Uri, _token: vscode.CancellationToken) => {
              const node = this.findFirstNode((node) => {
                const resourceUri = this.getMetadata(node).treeItem?.resourceUri;
                return resourceUri ? URI.equals(uri, resourceUri) : false;
              });
              if (!node) return;
              const metadata = this.getMetadata(node);
              if (!metadata.decorations && node.getDecorations) {
                metadata.decorations = node.getDecorations();
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

  updateDecorations(node: T, propogateToParent = false) {
    const metadata = this.getMetadata(node);
    fail.assertNotNull(
      !metadata.treeItem,
      "Can not update decorations on node which have not called getTreeItem yet",
    );
    fail.assertNotNull(
      !metadata.treeItem?.resourceUri,
      "Can not update decorations on node that does not provide resourceUri",
    );
    metadata.decorations = undefined;
    this.decorationChangeEmitter.fire(metadata.treeItem?.resourceUri);
    if (propogateToParent && metadata.parent)
      this.updateDecorations(metadata.parent, propogateToParent);
  }

  *iterateNodes(root?: T): IterableIterator<T> {
    if (!root) {
      for (const root of this.data) for (const node of this.iterateNodes(root)) yield node;
      return;
    }
    yield root;
    for (const child of this.getMetadata(root).children ?? [])
      for (const node of this.iterateNodes(child)) yield node;
  }

  findFirstNode(condition: (_: T) => boolean, root?: T) {
    for (const node of this.iterateNodes(root)) if (condition(node)) return node;
    return undefined;
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
    return objectGetOrSetProperty(node, "__tree", () => ({}) as TreeNodeMetadata<T>);
  }

  private onDidChangeSelection(event: vscode.TreeViewSelectionChangeEvent<T>) {
    for (const selected of event.selection) if (selected.onSelected) selected.onSelected();
  }

  /*
   * TreeDataProvider impl
   */

  // REFACTOR: go over all getTreeItem implementations and remove explicit caching
  getTreeItem(node: T) {
    return reportErrors(
      async () => {
        const metadata = this.getMetadata(node);
        if (metadata.treeItem) return metadata.treeItem;
        const treeItem = await node.getTreeItem();
        // if available, copy static property viewItemId from node class so that
        // commands defined with decorator would work (the "when" clause)
        if (!treeItem.contextValue) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const metadata = Commands.getMetadata((node as any)?.constructor);
          if (metadata.viewItemId) {
            assert(
              treeItem.contextValue === undefined,
              "Can not override `contextValue` when `viewItemId` is defined by tree view item class",
            );
            treeItem.contextValue = metadata.viewItemId;
          }
        }

        if (node.getUriPathSegments) {
          assert(
            treeItem.resourceUri === undefined,
            `Node defines both treeItem and ${node.getUriPathSegments.name}`,
            node,
          );
          fail.assertNotNull(
            metadata.parent,
            `Node defines ${node.getUriPathSegments.name} but has no parent`,
            node,
          );
          const parentUri = this.getMetadata(metadata.parent).treeItem?.resourceUri;
          fail.assertNotNull(
            parentUri,
            `Node defines ${node.getUriPathSegments.name} but parent node does not provide resourceUri`,
            node,
          );
          const segments = node.getUriPathSegments();
          treeItem.resourceUri = URI.appendPath(
            parentUri,
            ...(typeof segments === "string" ? [segments] : segments),
          );
        }

        metadata.treeItem = treeItem;

        if (node.getDecorations) {
          const uri = treeItem.resourceUri;
          fail.assertNotNull(
            uri,
            `Can not have ${node.getDecorations.name} defined on node which doesn't provide resourceUri`,
          );
          this.decorationChangeEmitter.fire(uri);
        }

        return treeItem;
      },
      {
        prefix: "getTreeItem failed: ",
        rethrow: true,
      },
    )();
  }

  async getChildren(node?: T) {
    if (node) {
      const metadata = this.getMetadata(node);
      if (metadata.children) return metadata.children;
    }

    return reportErrors(
      async () => {
        if (node === undefined) {
          if (this.promise) {
            this.data = await this.promise;
          }
          return this.data;
        }
        const metadata = this.getMetadata(node);
        metadata.children = node.getChildren ? await node.getChildren() : undefined;
        if (metadata.children)
          for (const child of metadata.children) this.getMetadata(child).parent = node;
        return metadata.children;
      },
      { prefix: "getChildren failed: " },
    )();
  }

  getParent(node: T): T | undefined {
    return this.getMetadata(node).parent;
  }

  async resolveTreeItem(treeItem: vscode.TreeItem, node: T, _: vscode.CancellationToken) {
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

  handleDrag(
    sources: readonly T[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ) {
    reportErrors(() => {
      assert(sources.length === 1, "Multi-select not supported");
      const node = sources[0];
      if (!node.onDrag) return;
      if (!node.onDrag()) return;
      const md = this.getMetadata(node);
      fail.assertNotNull(md.treeItem);
      fail.assertNotNull(md.treeItem.resourceUri, "Dragged node has no resourceUri");
      this.logger.debug(`Dragging node`, sources[0], node);
      // DataTrasfer values must be JSON objects
      dataTransfer.set(
        this.mimeType,
        new vscode.DataTransferItem(md.treeItem.resourceUri.toString(true /* skipEncoding */)),
      );
    })();
  }

  handleDrop(
    target: T | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ) {
    return reportErrors(() => {
      const dtItem = dataTransfer.get(this.mimeType);
      fail.assertNotNull(dtItem, `No DataTransferItem for tree's MIME type`);
      const sourceUri = dtItem.value as string;
      const source = this.findFirstNode(
        (node) =>
          this.getMetadata(node).treeItem?.resourceUri?.toString(true /* skipEncoding */) ===
          sourceUri,
      );
      fail.assertNotNull(source, "Can not find dragged node with uri", sourceUri);
      if (!target) {
        this.logger.debug(`Tree view ${this.viewId}: dropping outside`, source);
        return;
      }
      // if (source.__type === 'uri') logger.debug(`Tree view ${this.viewId}: dropping onto`, source, target);
      if (target.onDrop) return target.onDrop(source);
      this.logger.debug(`onDrop not implemented`, target);
    })();
  }
}

class TreeNodeMetadata<T> {
  treeItem?: vscode.TreeItem;
  children?: T[];
  parent?: T;
  decorations?: Record<string, vscode.FileDecoration | undefined> | undefined;
}

// interface NodeUriDtValue {
// 	__type: 'uri';
// 	uri: string;
// }
