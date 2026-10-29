import { randomBytes } from 'node:crypto';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SetTenantSecretUseCase } from '../../../modules/tenants/index.js';
import { Public } from '../../../shared/auth/access.decorators.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { STORE_KEY_SECRET } from '../store/store-key.js';
import { DevOnlyGuard } from './dev-only.guard.js';

/**
 * Dev-only: sets the brand's store key, so the playground can call the store's routes (Phase 7) as
 * the store would. 404 in production, where the key is set with `pnpm cli tenant:set-secret`.
 */
@Controller('dev/store')
@UseGuards(DevOnlyGuard)
export class DevStoreController {
  constructor(
    private readonly setSecret: SetTenantSecretUseCase,
    private readonly context: TenantContext,
  ) {}

  /** `{ key? }`: the key to set, or a new random one. Answers the key, to send in `token`. */
  @Public()
  @Post('key')
  async key(@Body() body: { key?: unknown } | undefined) {
    const key =
      typeof body?.key === 'string' && body.key.trim()
        ? body.key.trim()
        : 'dev-' + randomBytes(12).toString('hex');
    const saved = await this.setSecret.execute({
      slug: this.context.current.slug,
      name: STORE_KEY_SECRET,
      value: key,
    });
    if (!saved.ok) throw saved.error;
    return { key };
  }
}
