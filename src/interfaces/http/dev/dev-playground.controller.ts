import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ListTenantsUseCase } from '../../../modules/tenants/index.js';
import { Public } from '../../../shared/auth/access.decorators.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { DevOnlyGuard } from './dev-only.guard.js';
import { PLAYGROUND_HTML } from './playground.page.js';

/** The device playground page and the brand list it switches between; 404 in production. */
@Controller('dev')
@UseGuards(DevOnlyGuard)
export class DevPlaygroundController {
  constructor(
    private readonly listTenants: ListTenantsUseCase,
    private readonly context: TenantContext,
  ) {}

  /** Open `http://<brand>.localhost:3000/dev/playground`. */
  @Public()
  @Get('playground')
  @Header('Content-Type', 'text/html; charset=utf-8')
  playground(): string {
    return PLAYGROUND_HTML;
  }

  @Public()
  @Get('brands')
  async brands(): Promise<{ current: string; brands: string[] }> {
    const tenants = await this.listTenants.execute();
    return {
      current: this.context.current.slug,
      brands: tenants.filter((t) => t.isActive).map((t) => t.slug),
    };
  }
}
