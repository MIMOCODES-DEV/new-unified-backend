import { Injectable } from '@nestjs/common';
import { SecretCipher } from '../ports/secret-cipher.js';
import { TenantSecretRepository } from '../ports/tenant-secret.repository.js';
import { TenantSecretCache } from '../tenant-memory-cache.js';

/** What a ciphertext is bound to: it only decrypts for this brand and this name. */
export const secretContext = (tenantId: string, name: string): string => `${tenantId}/${name}`;

/**
 * A brand secret in clear, for server-side use only (checking a store key, calling a payment
 * provider). Pass the id of the brand being served (`TenantContext.current.id`). Returns null when
 * the secret is not set. Never put the value in a response, a log or an error.
 */
@Injectable()
export class GetTenantSecretUseCase {
  constructor(
    private readonly secrets: TenantSecretRepository,
    private readonly cipher: SecretCipher,
    private readonly cache: TenantSecretCache,
  ) {}

  async execute(tenantId: string, name: string): Promise<string | null> {
    const cached = this.cache.get(tenantId, name);
    if (cached !== undefined) return cached;

    const generation = this.cache.generation(tenantId);
    const encrypted = await this.secrets.find(tenantId, name);
    const value = encrypted ? this.cipher.decrypt(encrypted, secretContext(tenantId, name)) : null;
    this.cache.set(tenantId, name, value, generation);
    return value;
  }
}
