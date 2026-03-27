/*****************************************************************************
 * @file        : src/encryption.ts
 * @description : AES encryption module using Node.js crypto with PBKDF2-based
 *                key derivation. Supports key sizes 128-bit and 256-bit, and
 *                AES modes: GCM, CBC, and CTR.
 * @author      : Aravind Potluri <aravindswami135@gmail.com>
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
   * AES Mode. Allowed values: 'AES-CBC', 'AES-CTR', 'AES-GCM'.
   * @default 'AES-GCM'
   */
  AesMode?: "AES-CBC" | "AES-CTR" | "AES-GCM";
}

/**
 * Encrypts plaintext using AES with a password-derived key.
 * Supports AES-GCM, AES-CBC, and AES-CTR.
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
  const aesMode = options.AesMode || "AES-GCM";

  const salt = crypto.randomBytes(16);
  const ivLength = aesMode === "AES-GCM" ? 12 : 16;
  const iv = crypto.randomBytes(ivLength);
  const key = await pbdkf2(passwd, salt, keySize);

  let encryptedData: Buffer;
  let tag: Buffer;

  if (aesMode === "AES-GCM") {
    const cipher = crypto.createCipheriv(`aes-${keySize}-gcm`, key, iv);
    encryptedData = Buffer.concat([
      cipher.update(body, "utf8"),
      cipher.final(),
    ]);
    tag = cipher.getAuthTag();
  } else if (aesMode === "AES-CTR") {
    const cipher = crypto.createCipheriv(`aes-${keySize}-ctr`, key, iv);
    encryptedData = Buffer.concat([
      cipher.update(body, "utf8"),
      cipher.final(),
    ]);
    tag = deriveHmacTag(passwd, salt, iv, encryptedData);
  } else {
    const cipher = crypto.createCipheriv(`aes-${keySize}-cbc`, key, iv);
    encryptedData = Buffer.concat([
      cipher.update(body, "utf8"),
      cipher.final(),
    ]);
    tag = deriveHmacTag(passwd, salt, iv, encryptedData);
  }

  return arrayBufferToBase64(Buffer.concat([salt, iv, tag, encryptedData]));
}

/**
 * Decrypts Base64 string produced by encryptData.
 * Supports AES-GCM, AES-CBC, and AES-CTR.
 *
 * @param options - AES options including KeySize and AesMode.
 * @param encryptedBase64 - Base64 string containing salt + IV + tag + ciphertext.
 * @param passwd - Password used to derive the encryption key.
 * @returns Decrypted plaintext string.
 * @throws WrongPasswordError if password is incorrect or HMAC verification fails.
 */
export async function decryptData(
  options: AesOptions = {},
  encryptedBase64: string,
  passwd: string,
): Promise<string> {
  const keySize = options.KeySize || 256;
  const aesMode = options.AesMode || "AES-GCM";

  const data = base64ToArrayBuffer(encryptedBase64);

  const salt = data.subarray(0, 16);
  const ivLength = aesMode === "AES-GCM" ? 12 : 16;
  const iv = data.subarray(16, 16 + ivLength);
  const tagLength = aesMode === "AES-GCM" ? 16 : 32;
  const tag = data.subarray(16 + ivLength, 16 + ivLength + tagLength);
  const ciphertext = data.subarray(16 + ivLength + tagLength);

  const key = await pbdkf2(passwd, salt, keySize);

  if (aesMode === "AES-GCM") {
    try {
      const decipher = crypto.createDecipheriv(`aes-${keySize}-gcm`, key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new WrongPasswordError();
    }
  } else {
    const expectedTag = deriveHmacTag(passwd, salt, iv, ciphertext);
    if (!crypto.timingSafeEqual(tag, expectedTag)) {
      throw new WrongPasswordError();
    }

    const algorithm =
      aesMode === "AES-CTR" ? `aes-${keySize}-ctr` : `aes-${keySize}-cbc`;
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }
}

/**
 * ****************************************************************************
 *                                Helper Funcs
 * ****************************************************************************
 */

/**
 * Custom error class to indicate a wrong password during decryption.
 * Thrown by decryptData when AES-GCM auth tag verification fails or
 * HMAC verification fails for AES-CBC/CTR modes.
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
 * Converts a Buffer to a Base64 string.
 *
 * @param buffer - Input Buffer.
 * @returns Base64-encoded string.
 */
function arrayBufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

/**
 * Converts a Base64 string to a Buffer.
 *
 * @param base64 - Base64-encoded string.
 * @returns Decoded Buffer.
 */
function base64ToArrayBuffer(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

/**
 * Derives a key from a password using PBKDF2.
 *
 * @param password - The user-provided password.
 * @param salt - A unique salt used in key derivation.
 * @param keySize - AES key size in bits (128 or 256).
 * @returns A Promise that resolves to a Buffer key.
 */
export async function pbdkf2(
  password: string,
  salt: Buffer,
  keySize: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      100_000,
      keySize / 8,
      "sha256",
      (err, derivedKey) => {
        if (err) {
          reject(err);
        } else {
          resolve(derivedKey);
        }
      },
    );
  });
}

/**
 * Derives an HMAC-SHA256 tag for message authentication.
 * Used for CBC and CTR modes as a direct port of deriveHmacKey + sign.
 *
 * @param password - The user-provided password.
 * @param salt - Salt used in key derivation.
 * @param iv - IV used during encryption.
 * @param ciphertext - The encrypted data to authenticate.
 * @returns HMAC-SHA256 tag as a Buffer (32 bytes).
 */
function deriveHmacTag(
  password: string,
  salt: Buffer,
  iv: Buffer,
  ciphertext: Buffer,
): Buffer {
  const hmacKey = crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  const dataToAuth = Buffer.concat([salt, iv, ciphertext]);
  return crypto.createHmac("sha256", hmacKey).update(dataToAuth).digest();
}
