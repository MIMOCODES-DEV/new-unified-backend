/** A secret as stored: encrypted, with the key material needed to decrypt it under the master key. */
export interface EncryptedSecret {
  readonly keyId: string;
  readonly dataKey: string;
  readonly data: string;
}

/**
 * Encrypts brand secrets before they reach the database. `context` binds a ciphertext to one
 * brand and name: decrypting it under any other context fails.
 */
export abstract class SecretCipher {
  abstract encrypt(plaintext: string, context: string): EncryptedSecret;
  abstract decrypt(secret: EncryptedSecret, context: string): string;
}
