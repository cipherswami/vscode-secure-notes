/*********************************************************************************
 * @file        : src/extension.ts
 * @description : Secure Notes (MD) — VS code port of Joplin plugin [Secure Note].
 * @author      : Aravind Potluri <aravindswami135@gmail.com>
 **********************************************************************************/

import * as vscode from "vscode";
import * as path from "path";

import { encryptData, decryptData, WrongPasswordError } from "./encryption";
import { generateEncryptedNote, validateFormat, getAesOptions } from "./utils";
import { SecureNotesEditorProvider } from "./customEditor/secureView";
import { createLogger } from "./logger";

/**
 * Global constant representing the extension identifier.
 */
export const EXTENSION_ID = "SecureNotes";

/**
 * Entry point of the extension.
 * Responsible for initializing logging, registering commands,
 * and attaching custom editor providers.
 */
export function activate(context: vscode.ExtensionContext) {
  // Initialize logger instance for the extension lifecycle
  const logger = createLogger(`[${EXTENSION_ID}]`, "DEBUG");

  logger.info("Extension started!");

  /**
   * Command: Encrypts the currently active document
   * and converts it into a secure encrypted format.
   */
  const encryptNote = vscode.commands.registerCommand(
    "vsc-secure-notes.encrypt",
    async () => {
      // Retrieve active editor instance
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No File is open");
        logger.warn("No File is open");
        return;
      }

      const document = editor.document;
      const text = document.getText();

      // Prevent re-encryption of already encrypted files
      if (validateFormat(text)) {
        vscode.window.showWarningMessage("File is already encrypted");
        logger.warn("File is already encrypted");
        return;
      }

      // Prompt user for encryption password
      const password = await vscode.window.showInputBox({
        prompt: "Encrypt: Enter password",
        password: true,
      });

      if (!password) {
        vscode.window.showWarningMessage("Password can not be empty");
        logger.info("Password can not be empty");
        return;
      }

      const passwordConfirm = await vscode.window.showInputBox({
        prompt: "Encrypt: Again enter the password",
        password: true,
      });

      if (passwordConfirm !== password) {
        vscode.window.showWarningMessage("Password did not match");
        logger.info("Password do not match");
        return;
      }

      try {
        // Get AES options from settings
        const aesOptions = getAesOptions();

        // Encrypt document content
        const encryptedContent = await encryptData(aesOptions, text, password);

        // Wrap encrypted data with metadata/format
        const encryptedNote = await generateEncryptedNote(
          aesOptions,
          encryptedContent,
        );

        // Replace entire document content with encrypted output
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(text.length),
        );

        await editor.edit((editBuilder) => {
          editBuilder.replace(fullRange, encryptedNote);
        });

        // Save updated content to disk
        await editor.document.save();

        // Rename file to indicate encrypted state
        const oldUri = document.uri;
        const newUri = getEncryptedUri(oldUri);

        await vscode.workspace.fs.rename(oldUri, newUri, {
          overwrite: true,
        });

        vscode.window.showInformationMessage("Note Encrypted successfully");
        logger.info("Note Encrypted successfully");
      } catch (err) {
        vscode.window.showErrorMessage("Encryption failed");
        logger.error("Encryption failed: ", err);
      }
    },
  );

  /**
   * Command: Decrypts the currently active encrypted document
   * and restores it back to plain Markdown format.
   */
  const decryptNote = vscode.commands.registerCommand(
    "vsc-secure-notes.decrypt",
    async () => {
      // Retrieve active tab from the editor
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab;

      if (!tab) {
        vscode.window.showWarningMessage("No file is open");
        logger.warn("No file is open");
        return;
      }

      let uri: vscode.Uri | undefined;

      // Resolve URI depending on tab type (text or custom editor)
      if (tab.input instanceof vscode.TabInputText) {
        uri = tab.input.uri;
      } else if (tab.input instanceof vscode.TabInputCustom) {
        uri = tab.input.uri;
      }

      if (!uri) {
        logger.warn("Unable to resolve file from tab");
        return;
      }

      // Load document content from resolved URI
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();

      // Validate encrypted file format before attempting decryption
      const parsed = validateFormat(text);

      if (!parsed) {
        vscode.window.showErrorMessage("Not a valid encryption format");
        logger.error("Not a valid encryption format");
        return;
      }

      // Prompt user for decryption password
      const password = await vscode.window.showInputBox({
        prompt: "Decrypt: Enter password",
        password: true,
      });

      if (!password) {
        vscode.window.showWarningMessage("Password can not be empty");
        logger.info("Password can not be empty");
        return;
      }

      try {
        // Attempt decryption using provided credentials
        const decrypted = await decryptData(
          parsed.aesOptions,
          parsed.data,
          password,
        );

        // Replace encrypted content with decrypted plaintext
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(text.length),
        );

        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, fullRange, decrypted);

        await vscode.workspace.applyEdit(edit);
        await document.save();

        // Rename file back to standard Markdown format
        const oldUri = document.uri;
        const newUri = getDecryptedUri(oldUri);

        await vscode.workspace.fs.rename(oldUri, newUri, {
          overwrite: true,
        });

        // Open decrypted document in editor
        const newDoc = await vscode.workspace.openTextDocument(newUri);
        await vscode.window.showTextDocument(newDoc, { preview: false });

        vscode.window.showInformationMessage("Note Decrypted successfully");
        logger.info("Note Decrypted successfully");
      } catch (err) {
        if (err instanceof WrongPasswordError) {
          vscode.window.showErrorMessage("Wrong password");
          logger.info("Wrong password");
        } else {
          vscode.window.showErrorMessage("Decryption failed");
          logger.error("Decryption failed: ", err);
        }
      }
    },
  );

  /**
   * Register all disposables (commands and providers)
   * to ensure proper cleanup during extension deactivation.
   */
  context.subscriptions.push(encryptNote, decryptNote);
  context.subscriptions.push(
    SecureNotesEditorProvider.register(context, logger),
  );
}

/**
 * Cleanup hook invoked when the extension is deactivated.
 */
export function deactivate() {}

/**************************************************************************************
 * Helpers
 **************************************************************************************/

/**
 * Generates a new URI for the encrypted file.
 * Converts: .md -> .enc.md
 *
 * @param uri Original Markdown file URI
 * @returns Updated URI with encrypted file extension
 */
function getEncryptedUri(uri: vscode.Uri): vscode.Uri {
  const dir = path.dirname(uri.fsPath);
  const base = path.basename(uri.fsPath);

  const nameWithoutExt = base.replace(/\.[^/.]+$/, "");

  return vscode.Uri.file(path.join(dir, `${nameWithoutExt}.enc.md`));
}

/**
 * Generates a new URI for the decrypted file.
 * Converts: .enc.md -> .md
 *
 * @param uri Encrypted file URI
 * @returns Updated URI with standard Markdown extension
 */
function getDecryptedUri(uri: vscode.Uri): vscode.Uri {
  const dir = path.dirname(uri.fsPath);
  const base = path.basename(uri.fsPath);

  const newName = base.endsWith(".enc.md")
    ? base.replace(/\.enc\.md$/, ".md")
    : base.replace(/\.[^/.]+$/, ".md");

  return vscode.Uri.file(path.join(dir, newName));
}
