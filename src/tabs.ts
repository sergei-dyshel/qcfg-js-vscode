import { fail } from "@sergei-dyshel/typescript/error";
import {
  TabInputText,
  TabInputTextDiff,
  commands,
  window,
  type Tab,
  type ViewColumn,
} from "vscode";
import { focusNextGroup } from "./commands";

export type TabType = "diff" | "text";

interface TabInputMultiDiff {
  textDiffs: TabInputTextDiff[];
}

function isTabInputMultiDiff(input: unknown): input is TabInputMultiDiff {
  return input !== undefined && "textDiffs" in (input as any);
}

function tabMatchesType(tab: Tab, tabType: TabType) {
  switch (tabType) {
    case "text":
      return tab.input instanceof TabInputText;
    case "diff":
      return (
        tab.input instanceof TabInputTextDiff ||
        // consider multi-diff tab as diff too
        isTabInputMultiDiff(tab.input)
      );
  }
  fail("Invalid tab type", tabType);
}

/**
 * Find tag group that has or has not diff opened in it
 *
 * @param toTheSide Always return group to the side of the active one (split if needed)
 */
export async function findViewColumn(tabType: TabType, toTheSide = false) {
  const tabGroups = window.tabGroups.all;
  if (tabGroups.length === 1) {
    if (toTheSide) {
      await commands.executeCommand("workbench.action.splitEditorRight");
      return window.tabGroups.all[1].viewColumn;
    }
    return tabGroups[0].viewColumn;
  }
  const activeTabGroup = window.tabGroups.activeTabGroup;
  if (activeTabGroup.activeTab && tabMatchesType(activeTabGroup.activeTab, tabType))
    return activeTabGroup.viewColumn;
  for (const tabGroup of tabGroups) {
    if (!tabGroup.activeTab) continue;
    if (toTheSide && tabGroup !== activeTabGroup) return tabGroup.viewColumn;
    if (tabMatchesType(tabGroup.activeTab, tabType)) return tabGroup.viewColumn;
  }
  return;
}

/** Best-effort try to cycle groups until current group has this view column */
export async function focusViewColumn(viewColumn: ViewColumn) {
  const firstGroup = window.tabGroups.activeTabGroup;
  while (window.tabGroups.activeTabGroup.viewColumn != viewColumn) {
    await focusNextGroup();
    if (window.tabGroups.activeTabGroup == firstGroup) {
      // didn't find
      return;
    }
  }
}
