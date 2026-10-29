import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { GetTenantSecretUseCase } from '../../../modules/tenants/index.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';

/** The brand secret holding the key the store sends in its `token` header. */
export const STORE_KEY_SECRET = 'store.key';

/**
 * Checks the store's `token` header against the brand's store key. A brand with no key set refuses
 * every call (the old backends let a call with no `token` in when their key was unset).
 */
@Injectable()
export class StoreKey {
  constructor(
    private readonly secrets: GetTenantSecretUseCase,
    private readonly context: TenantContext,
  ) {}

  async accepts(token: unknown): Promise<boolean> {
    if (typeof token !== 'string' || token === '') return false;
    const key = await this.secrets.execute(this.context.current.id, STORE_KEY_SECRET);
    if (!key) return false;
    const sent = Buffer.from(token);
    const expected = Buffer.from(key);
    return sent.length === expected.length && timingSafeEqual(sent, expected);
  }
}
