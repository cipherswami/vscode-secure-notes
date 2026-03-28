# Change Log

All notable changes to the **Secure Notes** extension will be documented in this file.

## [2.0.0] - 2026-03-28

### Added

- Custom secure editor for `.enc.md` files (content hidden until unlocked)
- Rendered Markdown preview after decryption (tables, task lists, KaTeX, etc.)
- Lock / Unlock icons in editor title for quick actions
- Automatic file renaming:
  - `.md` → `.enc.md` on encrypt
  - `.enc.md` → `.md` on decrypt

### Changed

- Encryption/Decryption now changes the file extension (.enc.md <-> .md)
- Better error handling for wrong passwords and invalid files
- Improved validation for encrypted file format

### Fixed

- Edge cases with file detection and invalid extensions
- Stability improvements in encryption/decryption workflow

## [1.1.0] - 2026-03-28

### Added

- Settings to set the AES Options (mode and keysize)
- Encryption module now adapted to support CBC and CTR as well

## [1.0.0] - 2026-03-28

### Added

- Initial release — VS Code port of the Joplin Secure Notes plugin.
- `Secure Notes: Encrypt` command to encrypt open file or selected text with a password
- `Secure Notes: Decrypt` command to decrypt previously encrypted notes
