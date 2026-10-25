import { Controller, Get } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Public } from '../../../shared/auth/access.decorators.js';
import { CURRENT_TENANT, type CurrentTenant } from '../../../shared/tenancy/current-tenant.js';

@Controller()
export class TenantController {
  constructor(private readonly cls: ClsService) {}

  /** Which brand this host serves. Used by the unified frontend to pick its theme, and for debugging. */
  @Public()
  @Get('tenant')
  current(): { slug: string; name: string } {
    const tenant = this.cls.get<CurrentTenant>(CURRENT_TENANT);
    return { slug: tenant.slug, name: tenant.name };
  }
}
