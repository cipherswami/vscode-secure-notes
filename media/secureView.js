/*********************************************************************************
 * @file        : media/secureView.js
 * @description : Secure Notes Webview controller — handles unlock flow, UI state,
 *                and communication with VS Code extension host.
 **********************************************************************************/

/**
 * VS Code API bridge for webview communication.
 */
const vscode = acquireVsCodeApi();

/**
 * DOM references for UI elements.
 */
const lockView = document.getElementById("sn-lock");
const unlockView = document.getElementById("sn-unlock");

const passwordInput = document.getElementById("password");
const unlockBtn = document.getElementById("unlockBtn");
const editor = document.getElementById("editor");

/**
 * Automatically focus password input on load
 * to improve UX for immediate interaction.
 */
passwordInput.focus();

/**
 * Main unlock handler.
 *
 * Sends the entered password to the extension host
 * for decryption via postMessage API.
 */
function unlock() {
  const password = passwordInput.value;

  vscode.postMessage({
    type: "unlock",
    password,
  });
}

/**
 * Displays error state in the password input.
 *
 * Behavior:
 * - Clears current input
 * - Updates placeholder with error message
 * - Applies visual error styles (including animation)
 *
 * @param {string} msg Error message to display
 */
function showError(msg) {
  passwordInput.value = "";
  passwordInput.placeholder = msg;

  passwordInput.classList.add("error", "jiggle");

  // Remove animation class after short duration
  setTimeout(() => {
    passwordInput.classList.remove("jiggle");
  }, 300);
}

/**
 * Event listeners
 */

// Handle unlock button click
unlockBtn.addEventListener("click", unlock);

// Handle Enter key submission
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {unlock();}
});

// Reset error state on input focus
passwordInput.addEventListener("focus", () => {
  passwordInput.placeholder = "Enter password to view note";
  passwordInput.classList.remove("error");
});

/**
 * Message handler for communication from extension host.
 *
 * Supported message types:
 * - success: Displays decrypted content
 * - error: Displays error feedback to user
 */
window.addEventListener("message", (event) => {
  const msg = event.data;

  // Successful decryption response
  if (msg.type === "success") {
    // Switch UI from locked to unlocked view
    lockView.style.display = "none";
    unlockView.style.display = "flex";

    // Inject rendered HTML content into editor
    editor.innerHTML = msg.content;

    // Reset input state
    passwordInput.value = "";
    passwordInput.placeholder = "Enter password to view note";
    passwordInput.classList.remove("error");
  }

  // Error response (e.g., wrong password, decryption failure)
  if (msg.type === "error") {
    showError(msg.message);
  }
});
