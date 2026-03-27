import * as vscode from "vscode";
import { encryptData, decryptData, WrongPasswordError } from "./encryption";
import { generateEncryptedNote, validateFormat, getAesOptions } from "./utils";

export function activate(context: vscode.ExtensionContext) {
  console.log("Secure Notes Extension started!");

  /**
   * Encrypt full document
   */
  const encryptNote = vscode.commands.registerCommand(
    "vsc-secure-notes.encrypt",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const document = editor.document;
      const text = document.getText();

      if (!text) {
        vscode.window.showErrorMessage("File is empty");
        return;
      }

      // prevent double encryption
      if (validateFormat(text)) {
        vscode.window.showWarningMessage("File is already encrypted");
        return;
      }

      const password = await vscode.window.showInputBox({
        prompt: "Enter password",
        password: true,
      });
      if (!password) {
        return;
      }

      try {
        const aesOptions = getAesOptions();

        const encrypted = await encryptData(aesOptions, text, password);

        const wrapped = await generateEncryptedNote(aesOptions, encrypted);

        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(text.length),
        );

        await editor.edit((editBuilder) => {
          editBuilder.replace(fullRange, wrapped);
        });

        await editor.document.save();

        vscode.window.showInformationMessage("Note Encrypted");
      } catch (err) {
        vscode.window.showErrorMessage("Encryption failed");
        console.error(err);
      }
    },
  );

  /**
   * Decrypt full document
   */
  const decryptNote = vscode.commands.registerCommand(
    "vsc-secure-notes.decrypt",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const document = editor.document;
      const text = document.getText();

      if (!text) {
        vscode.window.showErrorMessage("File is empty");
        return;
      }

      const parsed = validateFormat(text);

      if (!parsed) {
        vscode.window.showErrorMessage("Not a valid encrypted note");
        return;
      }

      const password = await vscode.window.showInputBox({
        prompt: "Enter password",
        password: true,
      });
      if (!password) {
        return;
      }

      try {
        const decrypted = await decryptData(
          parsed.aesOptions,
          parsed.data,
          password,
        );

        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(text.length),
        );

        await editor.edit((editBuilder) => {
          editBuilder.replace(fullRange, decrypted);
        });

        await editor.document.save();

        vscode.window.showInformationMessage("Note Decrypted");
      } catch (err) {
        if (err instanceof WrongPasswordError) {
          vscode.window.showErrorMessage("Wrong password");
        } else {
          vscode.window.showErrorMessage("Decryption failed");
          console.error(err);
        }
      }
    },
  );

  context.subscriptions.push(encryptNote, decryptNote);
}

export function deactivate() {}
