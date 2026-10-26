/**
 * Encrypts playlist PINs with the brand's key. Encrypted, not hashed: Roku and iOS replies send
 * the PIN to the app. A PIN encrypted for one brand does not open in another.
 */
export abstract class PinCipher {
  abstract encrypt(pin: string): Promise<string>;
  abstract decrypt(pinEnc: string): Promise<string>;
}
