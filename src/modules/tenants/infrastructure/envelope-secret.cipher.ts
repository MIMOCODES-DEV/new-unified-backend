import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../shared/config/app-config.js';
import { EnvelopeEncryption } from '../../../shared/crypto/envelope-encryption.js';
import { type EncryptedSecret, SecretCipher } from '../application/ports/secret-cipher.js';

/** Brand secrets sealed with the master key from `TENANT_SECRETS_KEY`. */
@Injectable()
export class EnvelopeSecretCipher extends SecretCipher {
  private readonly envelope: EnvelopeEncryption;

  constructor(config: AppConfig) {
    super();
    const key = config.env.TENANT_SECRETS_KEY;
    // Fail at boot, not on the first request that needs a secret.
    if (!key) throw new Error('TENANT_SECRETS_KEY is not set (see .env.example)');
    this.envelope = EnvelopeEncryption.fromBase64(key);
  }

  encrypt(plaintext: string, context: string): EncryptedSecret {
    return this.envelope.seal(plaintext, context);
  }

  decrypt(secret: EncryptedSecret, context: string): string {
    return this.envelope.open(secret, context);
  }
}
