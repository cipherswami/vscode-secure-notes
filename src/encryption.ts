/*****************************************************************************
 * @file        : src/encryption.ts
 * @description : AES encryption module using Node.js crypto with PBKDF2-based
 *                key derivation. Supports AES-256-GCM.
 *****************************************************************************/

import * as crypto from "crypto";

/**
 * Cipher options for the encryption
 * @interface
 */
export interface AesOptions {
  /**
   * AES key size in bits. Allowed values: 128, 256.
   * @default 256
   */
  KeySize?: 128 | 256;

  /**
   * AES Mode. Only 'AES-GCM' is supported in Node version.
   * @default 'AES-GCM'
   */
  AesMode?: "AES-GCM";
}

/**
 * Encrypts plaintext using AES with a password-derived key.
 *
 * @param options - AES options including KeySize and AesMode.
 * @param body - The plaintext string to encrypt.
 * @param passwd - Password used to derive the encryption key.
 * @returns Base64 string containing salt + IV + tag + ciphertext.
 */
export async function encryptData(
  options: AesOptions = {},
  body: string,
  passwd: string,
): Promise<string> {
  const keySize = options.KeySize || 256;

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  const key = await pbdkf2(passwd, salt, keySize);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(body, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  const result = Buffer.concat([salt, iv, tag, encrypted]);

  return arrayBufferToBase64(result);
}

/**
 * Decrypts Base64 string produced by encryptData.
 *
 * @param options - AES options including KeySize and AesMode.
 * @param encryptedBase64 - Base64 string containing salt + IV + tag + ciphertext.
 * @param passwd - Password used to derive the encryption key.
 * @returns Decrypted plaintext string.
 * @throws Error if password is incorrect.
 */
export async function decryptData(
  options: AesOptions = {},
  encryptedBase64: string,
  passwd: string,
): Promise<string> {
  const keySize = options.KeySize || 256;

  const data = base64ToArrayBuffer(encryptedBase64);

  const salt = data.subarray(0, 16);
  const iv = data.subarray(16, 28);
  const tag = data.subarray(28, 44);
  const ciphertext = data.subarray(44);

  const key = await pbdkf2(passwd, salt, keySize);

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    throw new WrongPasswordError();
  }
}

/**
 * ****************************************************************************
 *                                Helper Funcs
 * ****************************************************************************
 */

/**
 * Custom error class to indicate a wrong password during decryption.
 *
 * @extends Error
 */
export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong password");
    this.name = "WrongPasswordError";
  }
}

/**
 * Converts a Uint8Array to a Base64 string.
 *
 * @param buffer - Input Uint8Array.
 * @returns Base64-encoded string.
 */
function arrayBufferToBase64(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString("base64");
}

/**
 * Converts a Base64 string to a Uint8Array.
 *
 * @param base64 - Base64-encoded string.
 * @returns Decoded Uint8Array.
 */
function base64ToArrayBuffer(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Derives a key from a password using PBKDF2.
 *
 * @param password - The user-provided password.
 * @param salt - A unique salt (Uint8Array) used in key derivation.
 * @param keySize - AES key size in bits (128 or 256).
 * @returns A Promise that resolves to a Buffer key.
 */
export async function pbdkf2(
  password: string,
  salt: Uint8Array,
  keySize: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      Buffer.from(salt),
      100_000,
      keySize / 8,
      "sha256",
      (err, derivedKey) => {
        if (err) {reject(err);}
        else {resolve(derivedKey);}
      },
    );
  });
}
