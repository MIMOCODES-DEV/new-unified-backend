import type { EncryptedSecret } from './secret-cipher.js';

export interface TenantSecretSummary {
  name: string;
  updatedAt: Date;
}

/** Encrypted brand secrets in the central database. Only ciphertext passes through here. */
export abstract class TenantSecretRepository {
  abstract find(tenantId: string, name: string): Promise<EncryptedSecret | null>;
  /** Names and change dates of a brand's secrets, ordered by name. Never the values. */
  abstract list(tenantId: string): Promise<TenantSecretSummary[]>;
  abstract save(tenantId: string, name: string, secret: EncryptedSecret, now: Date): Promise<void>;
  /** Returns whether a secret was deleted. */
  abstract delete(tenantId: string, name: string): Promise<boolean>;
}
