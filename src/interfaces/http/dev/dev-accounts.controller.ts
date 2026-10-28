import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import {
  ALL_BRANDS,
  CreateStaffUseCase,
  SUPER_ADMIN_ROLE_ID,
} from '../../../modules/staff/index.js';
import { devOutbox } from '../accounts/smtp-customer.mailer.js';
import { Public } from '../../../shared/auth/access.decorators.js';
import { REDIS } from '../../../shared/redis/redis.connection.js';
import { DevOnlyGuard } from './dev-only.guard.js';

/** The rate-limit counters (logins, sign-ups, links, playlists by MAC); never sessions or locks. */
const RATE_LIMIT_KEYS = [
  'customers:*',
  'staff:login-ip:*',
  'staff:login-email:*',
  'staff:2fa-ip:*',
  'staff:2fa:*',
  'playlists:mac-only:*',
];

/**
 * Dev-only helpers for trying accounts in the playground: the latest unsent customer email (no SMTP
 * set up), a super admin without the CLI, and a reset of the rate limits so the playground's test
 * cases can run again at once. 404 in production, where `pnpm cli staff:create` makes the first
 * super admin.
 */
@Controller('dev')
@UseGuards(DevOnlyGuard)
export class DevAccountsController {
  constructor(
    private readonly createStaff: CreateStaffUseCase,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Clears every rate-limit counter, so a second run of the test cases is not refused. */
  @Public()
  @Post('rate-limits/reset')
  async resetRateLimits(): Promise<{ cleared: number }> {
    let cleared = 0;
    for (const match of RATE_LIMIT_KEYS) {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', match, 'COUNT', 500);
        if (keys.length) cleared += await this.redis.del(...keys);
        cursor = next;
      } while (cursor !== '0');
    }
    return { cleared };
  }

  @Public()
  @Get('outbox')
  latest(@Query('to') to = '') {
    const email = [...devOutbox].reverse().find((m) => m.to === to.trim().toLowerCase());
    if (!email) throw new NotFoundException();
    return email;
  }

  @Public()
  @Post('staff/super-admin')
  async superAdmin(@Body() body: unknown) {
    const parsed = z
      .object({ email: z.string(), name: z.string(), password: z.string() })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    const created = await this.createStaff.execute({
      ...parsed.data,
      roleId: SUPER_ADMIN_ROLE_ID,
      tenantAccess: [ALL_BRANDS],
    });
    if (!created.ok) throw created.error;
    const { id, email, roleId, tenantAccess } = created.value;
    return { staff: { id, email, roleId, tenantAccess } };
  }
}
