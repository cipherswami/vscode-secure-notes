import * as vscode from "vscode";
import * as fs from "fs";
import { decryptData, WrongPasswordError } from "../encryption";
import { validateFormat } from "../utils";
import { Logger } from "../logger";
import MarkdownIt from "markdown-it";
import katex from "@vscode/markdown-it-katex";

const taskLists = require("markdown-it-task-lists");
const table = require("markdown-it-multimd-table");

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})
  .use(taskLists)
  .use(table)
  .use(katex);

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src");

  if (!src) {
    return self.renderToken(tokens, idx, options);
  }

  // external → leave it
  if (/^(https?|data):/.test(src)) {
    return self.renderToken(tokens, idx, options);
  }

  try {
    const base = env.baseUri; // document folder
    const resource = vscode.Uri.joinPath(base, src.replace(/^.\//, ""));

    const webviewUri = env.webview.asWebviewUri(resource);
    token.attrSet("src", webviewUri.toString());
  } catch (e) {
    console.error("Image resolve failed:", src, e);
  }

  return self.renderToken(tokens, idx, options);
};

/**
 * Custom editor view: Secure View
 */
export class SecureNotesEditorProvider
  implements vscode.CustomTextEditorProvider
{
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

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
  ) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const text = document.getText();

    const parsed = validateFormat(text);

    if (!parsed) {
      this.logger.warn(
        "Invalid secure note format, fallback to default editor",
      );

      await vscode.commands.executeCommand(
        "vscode.openWith",
        document.uri,
        "default",
      );
      return;
    }

    this.logger.debug(`Secure Note Opened: ${document.fileName}`);
    const workspaceFolders = vscode.workspace.workspaceFolders || [];

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
        vscode.Uri.file("/"),
      ],
    };

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type !== "unlock") {
        return;
      }

      try {
        const decrypted = await decryptData(
          parsed.aesOptions,
          parsed.data,
          msg.password,
        );

        const rendered = md.render(decrypted, {
          webview: webviewPanel.webview,
          baseUri: vscode.Uri.joinPath(document.uri, ".."),
        });

        webviewPanel.webview.postMessage({
          type: "success",
          content: rendered,
        });

        this.logger.info("Secure View Note Opened");
      } catch (err) {
        const message =
          err instanceof WrongPasswordError
            ? "Wrong password"
            : "Decryption failed";

        this.logger.warn("Decryption failed: " + message);

        webviewPanel.webview.postMessage({
          type: "error",
          message,
        });
      }
    });

    webviewPanel.onDidDispose(() => {
      this.logger.debug("Webview disposed: " + document.uri.toString());
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      "media",
      "secureView.html",
    );

    if (!fs.existsSync(htmlPath.fsPath)) {
      throw new Error("secureView.html not found");
    }

    let html = fs.readFileSync(htmlPath.fsPath, "utf-8");

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "secureView.css"),
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "secureView.js"),
    );

    const katexCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "katex.min.css"),
    );

    const nonce = getNonce();

    return html
      .replace("{{styleUri}}", styleUri.toString())
      .replace("{{scriptUri}}", scriptUri.toString())
      .replace("{{katexCssUri}}", katexCssUri.toString())
      .replace(/{{nonce}}/g, nonce)
      .replace(/{{cspSource}}/g, webview.cspSource);
  }
}

function getNonce() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
