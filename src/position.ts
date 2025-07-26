import { defaultCompare } from "@sergei-dyshel/typescript/array";
import { Location, type Position, Range } from "vscode";

export { Location, Range };

export function comparePosition(pos1: Position, pos2: Position): number {
  return defaultCompare(pos1.line, pos2.line) || defaultCompare(pos1.character, pos2.character);
}

export function compareRange(range1: Range, range2: Range): number {
  return comparePosition(range1.start, range2.start) || comparePosition(range1.end, range2.end);
}

export function compareLocation(loc1: Location, loc2: Location): number {
  return defaultCompare(loc1.uri.fsPath, loc2.uri.fsPath) || compareRange(loc1.range, loc2.range);
}
