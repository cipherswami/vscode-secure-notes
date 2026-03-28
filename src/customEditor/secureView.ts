/*********************************************************************************
 * @file        : src/customEditor/secureView.ts
 * @description : Secure View is read-only in RAM decrypted interactive preview.
 **********************************************************************************/

import * as vscode from "vscode";
import * as fs from "fs";
import { decryptData, WrongPasswordError } from "../encryption";
import { validateFormat } from "../utils";
import { Logger } from "../logger";
import MarkdownIt from "markdown-it";
import katex from "@vscode/markdown-it-katex";
import taskLists from "markdown-it-task-lists";
import table from "markdown-it-multimd-table";

/**
 * Markdown renderer instance configured with:
 * - HTML support
 * - Link auto-detection
 * - Typographic replacements
 * - Line break handling
 * - Plugins: task lists, tables, KaTeX (math rendering)
 */
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})
  .use(taskLists)
  .use(table)
  .use(katex);

/**
 * Custom image renderer override.
 *
 * Ensures that:
 * - External images (http/data) are left unchanged
 * - Local images are resolved and converted into webview-safe URIs
 */
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src");

  // If no source exists, fallback to default renderer
  if (!src) {
    return self.renderToken(tokens, idx, options);
  }

  // Preserve external images as-is
  if (/^(https?|data):/.test(src)) {
    return self.renderToken(tokens, idx, options);
  }

  try {
    // Resolve relative path against document base URI
    const base = env.baseUri;
    const resource = vscode.Uri.joinPath(base, src.replace(/^.\//, ""));

    // Convert to webview-safe URI
    const webviewUri = env.webview.asWebviewUri(resource);
    token.attrSet("src", webviewUri.toString());
  } catch (e) {
    console.error("Image resolve failed:", src, e);
  }

  return self.renderToken(tokens, idx, options);
};

/**
 * Custom editor provider for rendering encrypted secure notes.
 * Implements VS Code CustomTextEditorProvider interface.
 */
export class SecureNotesEditorProvider
  implements vscode.CustomTextEditorProvider
{
  /**
   * Registers the custom editor provider with VS Code.
   *
   * @param context Extension context
   * @param logger Logger instance
   * @returns Disposable registration
   */
  public static register(
    context: vscode.ExtensionContext,
    logger: Logger,
  ): vscode.Disposable {
    const provider = new SecureNotesEditorProvider(context, logger);

    return vscode.window.registerCustomEditorProvider(
      "secureNotes.editor",
      provider,
      { supportsMultipleEditorsPerDocument: false },
    );
  }

  /**
   * Constructor
   *
   * @param context Extension context
   * @param logger Logger instance
   */
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
  ) {}

  /**
   * Resolves and initializes the custom editor for a secure note.
   *
   * Handles:
   * - Format validation
   * - Webview setup
   * - Message handling (unlock/decrypt)
   *
   * @param document Target document
   * @param webviewPanel Webview panel instance
   */
  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const text = document.getText();

    // Validate encrypted format before proceeding
    const parsed = validateFormat(text);

    if (!parsed) {
      this.logger.warn(
        "Invalid secure note format, fallback to default editor",
      );

      // Fallback to default editor if format is invalid
      await vscode.commands.executeCommand(
        "vscode.openWith",
        document.uri,
        "default",
      );
      return;
    }

    this.logger.debug(`Secure Note Opened: ${document.fileName}`);

    // Configure webview permissions and resource roots
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
        vscode.Uri.file("/"),
      ],
    };

    // Inject HTML content into webview
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    /**
     * Handle incoming messages from the webview.
     * Expected message type: "unlock"
     */
    webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type !== "unlock") {
        return;
      }

      try {
        // Validate password input
        if (!msg.password) {
          this.logger.debug("Secure View password can not be empty");

          webviewPanel.webview.postMessage({
            type: "error",
            message: "Password can not be empty",
          });
          return;
        }

        // Perform decryption
        const decrypted = await decryptData(
          parsed.aesOptions,
          parsed.data,
          msg.password,
        );

        // Render decrypted Markdown into HTML
        const rendered = md.render(decrypted, {
          webview: webviewPanel.webview,
          baseUri: vscode.Uri.joinPath(document.uri, ".."),
        });

        // Send rendered content back to webview
        webviewPanel.webview.postMessage({
          type: "success",
          content: rendered,
        });

        this.logger.debug("Secure View Opened successfully");
      } catch (err) {
        let message = "Error";

        if (err instanceof WrongPasswordError) {
          this.logger.debug("Secure View entered wrong password");
          message = "Wrong password";
        } else {
          this.logger.error("Secure View decryption failed: " + err);
          message = "Decryption failed";
        }

        // Send error response to webview
        webviewPanel.webview.postMessage({
          type: "error",
          message,
        });
      }
    });

    // Handle disposal of webview
    webviewPanel.onDidDispose(() => {
      this.logger.debug("Webview disposed: " + document.uri.toString());
    });
  }

  /**
   * Loads and prepares HTML template for the webview.
   *
   * Injects:
   * - CSS
   * - JavaScript
   * - KaTeX styles
   * - CSP nonce
   *
   * @param webview Webview instance
   * @returns Final HTML string
   */
  private getHtml(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      "media",
      "secureView.html",
    );

    // Ensure HTML template exists
    if (!fs.existsSync(htmlPath.fsPath)) {
      throw new Error("secureView.html not found");
    }

    let html = fs.readFileSync(htmlPath.fsPath, "utf-8");

    // Resolve asset URIs for webview usage
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "secureView.css"),
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "secureView.js"),
    );

    const katexCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "katex.min.css"),
    );

    // Generate CSP nonce
    const nonce = getNonce();

    // Inject dynamic values into HTML template
    return html
      .replace("{{styleUri}}", styleUri.toString())
      .replace("{{scriptUri}}", scriptUri.toString())
      .replace("{{katexCssUri}}", katexCssUri.toString())
      .replace(/{{nonce}}/g, nonce)
      .replace(/{{cspSource}}/g, webview.cspSource);
  }
}

/**
 * Generates a random nonce for Content Security Policy (CSP).
 *
 * @returns Random alphanumeric string
 */
function getNonce() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let nonce = "";

  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
