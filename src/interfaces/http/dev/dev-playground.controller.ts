import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  GetTenantConfigUseCase,
  ListTenantSecretsUseCase,
  ListTenantsUseCase,
  ResolveTenantUseCase,
} from '../../../modules/tenants/index.js';
import { Public } from '../../../shared/auth/access.decorators.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { DevOnlyGuard } from './dev-only.guard.js';
import { PLAYGROUND_HTML } from './playground.page.js';
import { PLAYGROUND_RUNNER_JS } from './playground-runner.js';
import { PLAYGROUND_SCENARIOS_JS } from './playground-scenarios.js';
import { PLAYGROUND_SCHEMA_DOCS } from './playground-schema-docs.js';
import { PLAYGROUND_TESTS_JS } from './playground-tests.js';

const JS = 'text/javascript; charset=utf-8';

/** The device playground page, its scripts and the brand list it switches between; 404 in production. */
@Controller('dev')
@UseGuards(DevOnlyGuard)
export class DevPlaygroundController {
  constructor(
    private readonly listTenants: ListTenantsUseCase,
    private readonly resolveTenant: ResolveTenantUseCase,
    private readonly tenantConfig: GetTenantConfigUseCase,
    private readonly tenantSecrets: ListTenantSecretsUseCase,
    private readonly context: TenantContext,
  ) {}

  /** Open `http://<brand>.localhost:3000/dev/playground`. */
  @Public()
  @Get('playground')
  @Header('Content-Type', 'text/html; charset=utf-8')
  playground(): string {
    return PLAYGROUND_HTML;
  }

  /** The scenario and test runner. */
  @Public()
  @Get('playground/runner.js')
  @Header('Content-Type', JS)
  runner(): string {
    return PLAYGROUND_RUNNER_JS;
  }

  /** The e2e checks, run from the browser. */
  @Public()
  @Get('playground/tests.js')
  @Header('Content-Type', JS)
  tests(): string {
    return PLAYGROUND_TESTS_JS;
  }

  /** The guided E2E-* scenarios. */
  @Public()
  @Get('playground/scenarios.js')
  @Header('Content-Type', JS)
  scenarios(): string {
    return PLAYGROUND_SCENARIOS_JS;
  }

  /** What the docs say about each field: its rule and the old field it comes from. */
  @Public()
  @Get('playground/schema-docs.js')
  @Header('Content-Type', JS)
  schemaDocs(): string {
    return 'window.PG_SCHEMA_DOCS = ' + JSON.stringify(PLAYGROUND_SCHEMA_DOCS) + ';';
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

  /** F-4: which brand a host is served as, and what a request on it would get (421, 403). */
  @Public()
  @Get('brands/resolve')
  async resolve(@Query('host') host = '') {
    const found = await this.resolveTenant.execute(host);
    if (!found.ok) {
      const status = found.error.code === 'tenants.disabled' ? 403 : 421;
      return { host, found: false, status, code: found.error.code, message: found.error.message };
    }
    return { host, found: true, status: 200, slug: found.value.slug, name: found.value.name };
  }

  /** The brand of this host as stored: hosts, database, settings, config with defaults, secret names. */
  @Public()
  @Get('brand')
  async brand() {
    const current = this.context.current;
    const tenant = (await this.listTenants.execute()).find((t) => t.slug === current.slug);
    const secrets = await this.tenantSecrets.execute(current.slug);
    return {
      slug: current.slug,
      name: current.name,
      status: tenant?.status ?? 'active',
      hosts: tenant ? tenant.hosts.map((h) => h.value) : [],
      dbName: current.dbName,
      settings: current.settings,
      config: await this.tenantConfig.execute(current),
      secrets: secrets.ok ? secrets.value.map((s) => s.name) : [],
    };
  }
}
