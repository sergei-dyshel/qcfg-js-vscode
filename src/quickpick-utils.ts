import { QuickPickItemKind, type QuickPickItem } from "vscode";

export interface QuickPickSeparator extends QuickPickItem {
  label: string;
  kind: QuickPickItemKind.Separator;
}

export const createQuickPickSeparator = (label: string): QuickPickSeparator => ({
  kind: QuickPickItemKind.Separator,
  label,
});
