import { type FormattingOptions, Range, type TextDocument, type TextEditor } from "vscode";
import { executeFormatDocumentProvider } from "./builtin-commands";

export async function formatDocument(editor: TextEditor, options?: FormattingOptions) {
  const edits = await executeFormatDocumentProvider(editor.document.uri, options);
  if (!edits) return;
  await editor.edit((builder) => {
    for (const edit of edits) builder.replace(edit.range, edit.newText);
  });
}

/**
 * Full range of text in document
 */
export function documentRange(document: TextDocument): Range {
  const firstLine = document.lineAt(0);
  return new Range(firstLine.range.start, documentEnd(document));
}

export function documentEnd(document: TextDocument) {
  return document.lineAt(document.lineCount - 1).range.end;
}
