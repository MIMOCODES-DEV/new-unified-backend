import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import { Public } from '../../../shared/auth/access.decorators.js';
import { CENTRAL_DB } from '../../../shared/database/database.tokens.js';
import { TenantDbRegistry } from '../../../shared/database/tenant-db.registry.js';
import { REDIS } from '../../../shared/redis/redis.connection.js';

type CheckStatus = 'up' | 'down';

@Controller()
export class HealthController {
  constructor(
    @Inject(CENTRAL_DB) private readonly centralDb: Db,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly tenantDbs: TenantDbRegistry,
  ) {}

  /** Liveness: the process is running. */
  @Public()
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: the process can reach its dependencies. */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok'; checks: Record<string, CheckStatus> }> {
    const [mongo, redis, tenantDbs] = await Promise.all([
      this.check(() => this.centralDb.command({ ping: 1 })),
      this.check(() => this.redis.ping()),
      this.check(async () => {
        if (!(await this.tenantDbs.isHealthy())) throw new Error('A brand cluster is down');
      }),
    ]);
    const checks = { mongo, redis, tenantDbs };
    if (Object.values(checks).includes('down')) {
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: 'ok', checks };
  }

  private async check(probe: () => Promise<unknown>): Promise<CheckStatus> {
    try {
      await probe();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
