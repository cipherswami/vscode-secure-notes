import * as assert from "assert";
import {
  encryptData,
  decryptData,
  AesOptions,
  WrongPasswordError,
} from "../encryption";

suite("Encrypt / Decrypt Core", () => {
  const text = "Hello Secure Notes";
  const password = "strong-pass";

  const modes: AesOptions["AesMode"][] = ["AES-GCM", "AES-CBC", "AES-CTR"];

  const keySizes: AesOptions["KeySize"][] = [128, 256];

  for (const mode of modes) {
    for (const keySize of keySizes) {
      const options = { AesMode: mode, KeySize: keySize };

      suite(`${mode} - ${keySize}`, () => {
        test("Correct Password", async () => {
          const encrypted = await encryptData(options as any, text, password);

          const decrypted = await decryptData(
            options as any,
            encrypted,
            password,
          );

          assert.strictEqual(decrypted, text);
        });

        test("Wrong Password", async () => {
          const encrypted = await encryptData(options as any, text, password);

          await assert.rejects(
            async () => {
              await decryptData(options as any, encrypted, "wrong-password");
            },
            (err) => err instanceof WrongPasswordError,
          );
        });

        test("Tampered Ciphertext", async () => {
          const encrypted = await encryptData(options as any, text, password);

          const tampered = encrypted.slice(0, -4) + "abcd";

          await assert.rejects(() =>
            decryptData(options as any, tampered, password),
          );
        });
      });
    }
  }
});
