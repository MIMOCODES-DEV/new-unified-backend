import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantHttpModule } from '../../src/interfaces/http/tenant/tenant-http.module.js';
import {
  CreateTenantUseCase,
  UpdateTenantSettingsUseCase,
} from '../../src/modules/tenants/index.js';
import { Public } from '../../src/shared/auth/access.decorators.js';
import { CURRENT_TENANT, type CurrentTenant } from '../../src/shared/tenancy/current-tenant.js';
import { overrideTenantPorts, tenantFakes } from '../support/tenant-fakes.js';
import { createFastifyAdapter } from '../../src/shared/http/fastify-adapter.js';

@Controller()
class FakeHealthController {
  constructor(private readonly cls: ClsService) {}

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Public()
  @Get('settings')
  settings(): CurrentTenant['settings'] {
    return this.cls.get<CurrentTenant>(CURRENT_TENANT).settings;
  }
}

describe('TenantMiddleware (HTTP)', () => {
  let app: NestFastifyApplication;
  const fakes = tenantFakes();
  const repository = fakes.tenants;

  beforeAll(async () => {
    const moduleRef = await overrideTenantPorts(
      Test.createTestingModule({
        imports: [
          ClsModule.forRoot({ global: true, middleware: { mount: true } }),
          TenantHttpModule,
        ],
        controllers: [FakeHealthController],
      }),
      fakes,
    ).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const create = app.get(CreateTenantUseCase);
    await create.execute({
      slug: 'cr7',
      name: 'CR7 Player',
      hosts: ['crtvplayer.com', 'cr7player.com'],
    });
    const off = await create.execute({ slug: 'old', name: 'Old Brand', hosts: ['old-brand.com'] });
    if (off.ok) {
      off.value.disable();
      await repository.save(off.value);
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves the brand that owns the host', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tenant',
      headers: { host: 'CR7Player.com:443' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ slug: 'cr7', name: 'CR7 Player' });
  });

  it('refuses an unknown host with 421', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tenant',
      headers: { host: 'attacker.example' },
    });

    expect(res.statusCode).toBe(421);
    expect(res.json()).toEqual({
      error: { code: 'tenants.unknown_host', message: expect.any(String) },
    });
  });

  it('refuses a subdomain of a known host (no substring matching)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tenant',
      headers: { host: 'api.crtvplayer.com' },
    });

    expect(res.statusCode).toBe(421);
  });

  it('refuses a disabled brand with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tenant',
      headers: { host: 'old-brand.com' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('puts the brand settings in the request context', async () => {
    await app
      .get(UpdateTenantSettingsUseCase)
      .execute({ slug: 'cr7', patch: { features: { maintenance: true } } });

    const res = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { host: 'cr7player.com' },
    });

    expect(res.json()).toMatchObject({
      features: { maintenance: true, rawPlaylistsForAndroid44: false },
      playlistProfile: 'xc',
    });
  });

  it('lets health checks through without a brand host', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: '10.0.0.5:3000' },
    });

    expect(res.statusCode).toBe(200);
  });
});
