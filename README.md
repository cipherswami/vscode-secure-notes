# Secure Notes

Secure Notes is a VS Code port of the Joplin plugin [Secure Notes](https://github.com/cipherswami/joplin-plugin-secure-notes), bringing password-based note encryption to your Markdown notes straight into your editor.

Protect your sensitive thoughts, credentials, and private notes — all within VS Code, without leaving your workflow.

## Features

- 🔐 Encrypt `.md` files → `.enc.md`
- 🔓 Decrypt `.enc.md` → `.md`
- 🧠 Secure view (Decrypted in RAM, never touches the disk)
- 🛡️ AES encryption: (GCM, CTR, CBC) with (128 / 256)
- ⚡ Fully offline

## Disclaimer

**NO RECOVERY** — If you forget your password, your encrypted notes are permanently lost. There is no way to recover or reset it. Please keep backups of anything important.

**NO WARRANTIES** — This extension is provided "as is" without any guarantees. While it uses industry-standard AES encryption, no system is 100% secure. The author is not liable for any data loss or security issues.

**_Use at your own risk. By using this extension, you accept these terms._**

## Usage

### 🔐 Encrypt (Lock icon)

- Open a `.md` file
- Click the **🔒 Lock icon** in the editor title _or_ run:
  `Secure Notes: Encrypt`
- Enter password

### 🔓 Decrypt (Unlock icon)

- Open a `.enc.md` file
- Click the **🔓 Unlock icon** _or_ run:
  `Secure Notes: Decrypt`
- Enter password

## Release Notes

Check [CHANGELOG.md](./CHANGELOG.md) for the full details.

## Related

- 🔗 [Joplin Secure Notes Plugin](https://joplinapp.org/plugins/plugin/com.cipherswami.secure.notes) — the original plugin this is based on

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for more details.

Contributions are welcome! Visit the [GitHub repository](https://github.com/cipherswami/vscode-secure-notes) to submit pull requests or suggest new features.
