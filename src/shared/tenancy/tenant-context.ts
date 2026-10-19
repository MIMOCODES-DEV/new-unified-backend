import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CURRENT_TENANT, type CurrentTenant } from './current-tenant.js';

/**
 * Answers "which brand am I serving?" anywhere in a request or job, without passing the tenant
 * through every function. HTTP requests get their brand from TenantMiddleware; jobs and CLI
 * commands choose one explicitly with `run()`.
 */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}

  /**
   * The current brand. Throws when code runs outside a brand — that is a bug (a route without the
   * middleware, a job without `run()`), and guessing a default brand could leak another brand's data.
   */
  get current(): CurrentTenant {
    const tenant = this.cls.isActive()
      ? this.cls.get<CurrentTenant | undefined>(CURRENT_TENANT)
      : undefined;
    if (!tenant)
      throw new Error('No tenant in context: tenant data accessed outside a request or run()');
    return tenant;
  }

  /** Runs `fn` as `tenant` (jobs, CLI). Code inside sees this brand; code outside is unaffected. */
  run<T>(tenant: CurrentTenant, fn: () => Promise<T>): Promise<T> {
    return this.cls.run(() => {
      this.cls.set(CURRENT_TENANT, tenant);
      return fn();
    });
  }
}
