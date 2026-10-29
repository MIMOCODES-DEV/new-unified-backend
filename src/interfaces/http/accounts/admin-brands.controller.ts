import { Controller, Get } from '@nestjs/common';
import { ALL_BRANDS, GetStaffUseCase } from '../../../modules/staff/index.js';
import { ListTenantsUseCase } from '../../../modules/tenants/index.js';
import { CentralStaff } from '../../../shared/auth/access.decorators.js';
import { AuthContext } from '../../../shared/auth/auth-context.js';
import { NOT_FOUND, unwrap } from './http-results.js';

/**
 * The brands the caller may manage, for the panel's brand switcher. Brand routes are called on the
 * brand's own host, so each brand carries its hosts; the first is its main domain.
 */
@Controller('admin/brands')
export class AdminBrandsController {
  constructor(
    private readonly listTenants: ListTenantsUseCase,
    private readonly getStaff: GetStaffUseCase,
    private readonly auth: AuthContext,
  ) {}

  @CentralStaff()
  @Get()
  async brands() {
    const staff = unwrap(await this.getStaff.execute(this.auth.staff().staffId), {
      'staff.not_found': NOT_FOUND,
    });
    const all = staff.tenantAccess.includes(ALL_BRANDS);
    const tenants = (await this.listTenants.execute())
      .filter((t) => all || staff.tenantAccess.includes(t.slug))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      brands: tenants.map((t) => ({
        slug: t.slug,
        name: t.name,
        status: t.status,
        hosts: t.hosts.map((h) => h.value),
        mainHost: t.hosts[0]?.value ?? null,
      })),
    };
  }
}
