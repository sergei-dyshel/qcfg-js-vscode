import type { FormattingOptions, TextEditor } from "vscode";
import { executeFormatDocumentProvider } from "./commands";

export async function formatDocument(editor: TextEditor, options?: FormattingOptions) {
  const edits = await executeFormatDocumentProvider(editor.document.uri, options);
  if (!edits) return;
  await editor.edit((builder) => {
    for (const edit of edits) builder.replace(edit.range, edit.newText);
  });
}
