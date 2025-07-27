import { JsoncEditor } from "@sergei-dyshel/typescript";
import { execSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { commands, workspace } from "vscode";
import { openFileDiff } from "./builtin-commands";
import { Message } from "./namespaces/message";

export class ExtensionPackageJson {
  readonly editor: JsoncEditor;
  readonly origText: string;

  constructor(public readonly filename: string) {
    this.origText = readFileSync(filename).toString();
    this.editor = new JsoncEditor(this.origText);
  }

  get text() {
    return this.editor.text;
  }

  get formattedText() {
    return JSON.stringify(JSON.parse(this.text), undefined, 2 /* space */);
  }

  get origFormattedText() {
    return JSON.stringify(JSON.parse(this.origText), undefined, 2 /* space */);
  }

  //TYPING: add types for extension package json properties
  /**
   * Update in-memory package.json with given properties
   *
   * TODO: For ease of use in scripts, this method should stay sync
   */
  modify(json: ExtensionPackageJson.Modification) {
    if (json.contributes) {
      if (json.contributes.commands)
        this.editor.modify(["contributes", "commands"], json.contributes.commands);
      if (json.contributes.menus)
        this.editor.modify(["contributes", "menus"], json.contributes.menus);
      if (json.contributes.views)
        this.editor.modify(["contributes", "views"], json.contributes.views);
      if (json.contributes.configuration)
        this.editor.modify(["contributes", "configuration"], json.contributes.configuration);
      if (json.contributes.icons)
        this.editor.modify(["contributes", "icons"], json.contributes.icons);
    }
    if (json.activationEvents) this.editor.modify(["activationEvents"], json.activationEvents);
  }

  write() {
    copyFileSync(this.filename, this.filename + ".bak");
    writeFileSync(this.filename, this.text);
    execSync("npx prettier --write " + this.filename);
  }

  isUpToDate() {
    // normalize formatting before comparing contents
    return this.formattedText === this.origFormattedText;
  }

  async verify() {
    if (!this.isUpToDate()) {
      const answer = await Message.ask(
        "info",
        "package.json is not up to date, do you want to update it and reload?",
        "Yes",
        "No",
        "Show diff",
      );
      if (answer === "Yes") {
        this.write();
        void commands.executeCommand("workbench.action.reloadWindow");
      } else if (answer === "Show diff") {
        const before = await workspace.openTextDocument({
          language: "json",
          content: this.origFormattedText,
        });
        const after = await workspace.openTextDocument({
          language: "json",
          content: this.formattedText,
        });
        await openFileDiff("package.json", before.uri, after.uri);
      }
    }
  }
}

export namespace ExtensionPackageJson {
  export interface Modification {
    activationEvents?: any;
    contributes?: { commands?: any; menus?: any; views?: any; configuration?: any; icons?: any };
  }
}
