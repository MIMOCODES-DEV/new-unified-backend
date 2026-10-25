import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiModule } from '../../src/api.module.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

describe('health endpoints', () => {
  let infra: TestInfrastructure;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    infra = await startInfrastructure();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'warn';
    process.env.MONGO_URI = infra.mongoUri;
    process.env.REDIS_URL = infra.redisUrl;

    const moduleRef = await Test.createTestingModule({ imports: [ApiModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
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

  it('returns a JSON 404 without internals for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'http_404', message: expect.any(String) } });
  });
});
