const vscode = acquireVsCodeApi();

const lockView = document.getElementById("sn-lock");
const unlockView = document.getElementById("sn-unlock");

const passwordInput = document.getElementById("password");
const unlockBtn = document.getElementById("unlockBtn");
const editor = document.getElementById("editor");

/* focus on load */
passwordInput.focus();

/* Unlock */
function unlock() {
  const password = passwordInput.value;

  if (!password) {
    showError("Password can't be empty");
    return;
  }

  vscode.postMessage({
    type: "unlock",
    password,
  });
}

unlockBtn.addEventListener("click", unlock);

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlock();
});

/* Error handling */
function showError(msg) {
  passwordInput.value = "";
  passwordInput.placeholder = msg;

  passwordInput.classList.add("error", "jiggle");

  setTimeout(() => {
    passwordInput.classList.remove("jiggle");
  }, 300);
}

/* Reset on focus */
passwordInput.addEventListener("focus", () => {
  passwordInput.placeholder = "Enter password to view note";
  passwordInput.classList.remove("error");
});

/* Message handler */
window.addEventListener("message", (event) => {
  const msg = event.data;

  if (msg.type === "success") {
    lockView.style.display = "none";
    unlockView.style.display = "flex";

    editor.innerHTML = msg.content;

    passwordInput.value = "";
    passwordInput.placeholder = "Enter password to view note";
    passwordInput.classList.remove("error");
  }

  if (msg.type === "error") {
    showError(msg.message);
  }
});
