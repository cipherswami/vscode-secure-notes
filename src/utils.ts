/*********************************************************************************
 * @file        : src/utils.ts
 * @description : All util functions for Secure Notes extension.
 *********************************************************************************/

import * as vscode from "vscode";
import { AesOptions } from "./encryption";
import { EXTENSION_ID } from "./extension";

/**
 * Function to generate encrypted note format.
 * @param body - The body to parse
 * @param blockName - Block Name to verify
 * @returns True if block name is present in body
 */
export async function generateEncryptedNote(
  aesOptions: AesOptions,
  encryptedData: string,
) {
  const secureNotesBlock = `\`\`\`${EXTENSION_ID}
## Info
This is an encrypted note, use VSC Secure Notes extension to decrypt the note.

## Encryption
mode: ${aesOptions.AesMode}
size: ${aesOptions.KeySize}

## Data
${encryptedData}
\`\`\`
`;
  return secureNotesBlock;
}

/**
 * Validate and parse the new encryption format.
 * @param body - The note body to validate
 * @returns Parsed encryption data or null if invalid
 */
export function validateFormat(
  body: string,
): { aesOptions: AesOptions; data: string } | null {
  const blockMatch = body.match(
    new RegExp(
      `^\\\`\\\`\\\`${EXTENSION_ID}\\n([\\s\\S]+?)\\n\\\`\\\`\\\`$`,
      "m",
    ),
  );
  if (!blockMatch) {
    return null;
  }

  const inner = blockMatch[1];

  const encryptionMatch = inner.match(/##\s*Encryption\s*\n([\s\S]+?)(?=##|$)/);
  if (!encryptionMatch) {
    return null;
  }

  const encryptionSection = encryptionMatch[1];

  const modeMatch = encryptionSection.match(/mode:\s*([^\n]+)/);
  const sizeMatch = encryptionSection.match(/size:\s*(\d+)/);
  const dataMatch = inner.match(/##\s*Data\s*\n([\s\S]+)$/);

  if (!modeMatch || !sizeMatch || !dataMatch) {
    return null;
  }

  return {
    aesOptions: {
      AesMode: modeMatch[1].trim() as AesOptions["AesMode"],
      KeySize: parseInt(sizeMatch[1].trim()) as AesOptions["KeySize"],
    },
    data: dataMatch[1].trim(),
  };
}

/**
 * Function to fetch AES options from VS Code settings.
 * @returns AesOptions
 */
export function getAesOptions(): AesOptions {
  const config = vscode.workspace.getConfiguration("vsc-secure-notes");

  return {
    AesMode: config.get<AesOptions["AesMode"]>("aesMode", "AES-GCM"),
    KeySize: config.get<AesOptions["KeySize"]>("keySize", 256),
  };
}
