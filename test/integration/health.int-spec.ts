import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiModule } from '../../src/api.module.js';
import { CreateTenantUseCase } from '../../src/modules/tenants/index.js';
import { createFastifyAdapter } from '../../src/shared/http/fastify-adapter.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';
import { TEST_SECRETS_KEY } from '../support/tenant-fakes.js';

describe('health endpoints', () => {
  let infra: TestInfrastructure;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    infra = await startInfrastructure();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'warn';
    process.env.MONGO_URI = infra.mongoUri;
    process.env.REDIS_URL = infra.redisUrl;
    process.env.TENANT_SECRETS_KEY = TEST_SECRETS_KEY;

    const moduleRef = await Test.createTestingModule({ imports: [ApiModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await infra?.stop();
  });

  it('GET /health reports the process is alive', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready reports Mongo, Redis and brand databases are reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'ok',
      checks: { mongo: 'up', redis: 'up', tenantDbs: 'up' },
    });
  });

  it('echoes a request id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'abc-123' },
    });

    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('echoes the request id on a reply the brand check ends early (unknown host)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/nope',
      headers: { host: 'nobody.test', 'x-request-id': 'abc-456' },
    });

    expect(res.statusCode).toBe(421);
    expect(res.headers['x-request-id']).toBe('abc-456');
  });

  it('gives a new request id when the caller sends an unsafe one', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'not safe <script>' },
    });

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns a JSON 404 without internals for unknown routes', async () => {
    // Every route except the health checks needs a known brand host first.
    const created = await app
      .get(CreateTenantUseCase, { strict: false })
      .execute({ slug: 'health-check', name: 'Health check', hosts: ['health-check.test'] });
    expect(created.ok).toBe(true);

    const res = await app.inject({
      method: 'GET',
      url: '/nope',
      headers: { host: 'health-check.test' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'http_404', message: expect.any(String) } });
  });
});
