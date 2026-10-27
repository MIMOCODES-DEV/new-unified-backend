import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ListTenantsUseCase } from '../../../modules/tenants/index.js';
import { Public } from '../../../shared/auth/access.decorators.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { DevOnlyGuard } from './dev-only.guard.js';
import { PLAYGROUND_HTML } from './playground.page.js';
import { PLAYGROUND_RUNNER_JS } from './playground-runner.js';
import { PLAYGROUND_SCENARIOS_JS } from './playground-scenarios.js';
import { PLAYGROUND_TESTS_JS } from './playground-tests.js';

const JS = 'text/javascript; charset=utf-8';

/** The device playground page, its scripts and the brand list it switches between; 404 in production. */
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
