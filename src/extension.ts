import * as vscode from "vscode";
import * as path from "path";

import { encryptData, decryptData, WrongPasswordError } from "./encryption";
import { generateEncryptedNote, validateFormat, getAesOptions } from "./utils";
import { SecureNotesEditorProvider } from "./customEditor/secureView";
import { createLogger } from "./logger";

/**
 * Global Constants
 */
export const EXTENSION_ID = "SecureNotes";

/**
 * Constructor function for extension.
 *
 * @param context Has the context for the extension
 */
export function activate(context: vscode.ExtensionContext) {
  const logger = createLogger(`[${EXTENSION_ID}]`, "DEBUG");
  logger.info("Secure Notes Extension started!");

  /**
   * Encrypt full document
   */
  const encryptNote = vscode.commands.registerCommand(
    "vsc-secure-notes.encrypt",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No File is open");
        logger.warn("No File is open");
        return;
      }

      const document = editor.document;
      const text = document.getText();

      if (validateFormat(text)) {
        vscode.window.showWarningMessage("File is already encrypted");
        logger.warn("File is already encrypted");
        return;
      }

      const password = await vscode.window.showInputBox({
        prompt: "Encrypt: Enter password",
        password: true,
      });

      if (!password) {
        vscode.window.showWarningMessage("Password can not be empty");
        logger.warn("Password can not be empty");
        return;
      }

      const passwordConfirm = await vscode.window.showInputBox({
        prompt: "Encrypt: Again enter the password",
        password: true,
      });

      if (passwordConfirm !== password) {
        vscode.window.showWarningMessage("Password didn't match");
        logger.warn("Passowrd didn't match");
        return;
      }

      try {
        const aesOptions = getAesOptions();
        logger.debug(aesOptions);

        const encryptedContent = await encryptData(aesOptions, text, password);

        const encryptedNote = await generateEncryptedNote(
          aesOptions,
          encryptedContent,
        );

        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(text.length),
        );

        await editor.edit((editBuilder) => {
          editBuilder.replace(fullRange, encryptedNote);
        });

        await editor.document.save();

        // Rename to .enc.md
        const oldUri = document.uri;
        const newUri = getEncryptedUri(oldUri);

        await vscode.workspace.fs.rename(oldUri, newUri, {
          overwrite: true,
        });

        vscode.window.showInformationMessage("Note Encrypted");
        logger.info("Note Encrypted successfully");
      } catch (err) {
        vscode.window.showErrorMessage("Encryption failed");
        logger.error("Encryption failed: ", err);
      }
    },
  );

  /**
   * Decrypt full document
   */
  const decryptNote = vscode.commands.registerCommand(
    "vsc-secure-notes.decrypt",
    async () => {
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab;

      if (!tab) {
        vscode.window.showWarningMessage("No file is open");
        logger.warn("No file is open");
        return;
      }

      let uri: vscode.Uri | undefined;

      if (tab.input instanceof vscode.TabInputText) {
        uri = tab.input.uri;
      } else if (tab.input instanceof vscode.TabInputCustom) {
        uri = tab.input.uri;
      }

      if (!uri) {
        vscode.window.showWarningMessage("Unable to resolve file");
        logger.warn("Unable to resolve file from tab");
        return;
      }

      const document = await vscode.workspace.openTextDocument(uri);

      const fileName = document.fileName;
      const text = document.getText();

      if (!fileName.endsWith(".enc.md")) {
        vscode.window.showErrorMessage("Not a secure note [Invalid extension]");
        logger.warn("Invalid file extension for decryption");
        return;
      }

      const parsed = validateFormat(text);

      if (!parsed) {
        vscode.window.showErrorMessage("Not a valid encryption format");
        logger.error("Not a valid encryption format");
        return;
      }

      const password = await vscode.window.showInputBox({
        prompt: "Decrypt: Enter password",
        password: true,
      });

      if (!password) {
        vscode.window.showWarningMessage("Password can not be empty");
        logger.warn("Password can not be empty");
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

        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, fullRange, decrypted);

        await vscode.workspace.applyEdit(edit);
        await document.save();

        // Rename back to .md
        const oldUri = document.uri;
        const newUri = getDecryptedUri(oldUri);

        await vscode.workspace.fs.rename(oldUri, newUri, {
          overwrite: true,
        });

        const newDoc = await vscode.workspace.openTextDocument(newUri);
        await vscode.window.showTextDocument(newDoc, { preview: false });

        vscode.window.showInformationMessage("Note Decrypted successfully");
        logger.info("Note Decrypted");
      } catch (err) {
        if (err instanceof WrongPasswordError) {
          vscode.window.showInformationMessage("Wrong password");
          logger.info("Wrong password");
        } else {
          vscode.window.showErrorMessage("Decryption failed");
          logger.error("Decryption failed: ", err);
        }
      }
    },
  );

  /**
   * Push subscriptions
   */
  context.subscriptions.push(encryptNote, decryptNote);
  context.subscriptions.push(
    SecureNotesEditorProvider.register(context, logger),
  );
}

/**
 * Destructor function for extension
 */
export function deactivate() {}

/**************************************************************************************
 * Helpers
 **************************************************************************************/

/**
 * Function to generate encrypted file name.
 * .md -> .enc.md
 *
 * @param uri Markdown file path
 * @returns Encrypted Markdown file path
 */
function getEncryptedUri(uri: vscode.Uri): vscode.Uri {
  const dir = path.dirname(uri.fsPath);
  const base = path.basename(uri.fsPath);

  const nameWithoutExt = base.replace(/\.[^/.]+$/, "");

  return vscode.Uri.file(path.join(dir, `${nameWithoutExt}.enc.md`));
}

/**
 * Function to remove the encrypted file name.
 * .enc.md -> .md
 *
 * @param uri Encrypted Markdown file path
 * @returns Markdown File path
 */
function getDecryptedUri(uri: vscode.Uri): vscode.Uri {
  const dir = path.dirname(uri.fsPath);
  const base = path.basename(uri.fsPath);

  const newName = base.endsWith(".enc.md")
    ? base.replace(/\.enc\.md$/, ".md")
    : base.replace(/\.[^/.]+$/, ".md");

  return vscode.Uri.file(path.join(dir, newName));
}
