import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiModule } from '../../src/api.module.js';
import { cli, type E2eEnv, http, startE2eEnv } from './support/e2e-env.js';

/**
 * The HTTP API as a client sees it: a real server on a real port, real MongoDB and Redis,
 * brands created with the real CLI. Nothing is mocked.
 */
describe('HTTP API (e2e)', () => {
  let e2e: E2eEnv;
  let app: NestFastifyApplication;
  let port: number;

  beforeAll(async () => {
    e2e = await startE2eEnv();
    expect((await cli(e2e.env, 'migrate:central')).exitCode).toBe(0);
    expect(
      (await cli(e2e.env, 'tenant:create', 'shop', 'Shop Player', 'shop.test', 'www.shop.test'))
        .exitCode,
    ).toBe(0);
    expect(
      (await cli(e2e.env, 'tenant:create', 'closed', 'Closed Player', 'closed.test')).exitCode,
    ).toBe(0);

    // Disable one brand directly in the registry, as an admin would.
    const client = await MongoClient.connect(e2e.infra.mongoUri);
    await client
      .db('unified_central')
      .collection('tenants')
      .updateOne({ slug: 'closed' }, { $set: { status: 'disabled' } });
    await client.close();

    Object.assign(process.env, e2e.env, { LOG_LEVEL: 'warn' });
    app = await NestFactory.create<NestFastifyApplication>(ApiModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app?.close();
    await e2e?.infra.stop();
  });

  it('GET /health answers without a brand host (load balancers)', async () => {
    const res = await http(port, '/health', '127.0.0.1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /ready reports MongoDB and Redis up', async () => {
    const res = await http(port, '/ready', '127.0.0.1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', checks: { mongo: 'up', redis: 'up' } });
  });

  it('GET /tenant picks the brand from the Host header, for every host of the brand', async () => {
    for (const host of ['shop.test', 'www.shop.test', 'SHOP.test:3000']) {
      const res = await http(port, '/tenant', host);

      expect(res.status, host).toBe(200);
      expect(res.body, host).toEqual({ slug: 'shop', name: 'Shop Player' });
    }
  });

  it('refuses an unknown host with 421, never a default brand', async () => {
    const res = await http(port, '/tenant', 'nobody.test');

    expect(res.status).toBe(421);
    expect(res.body).toEqual({
      error: { code: 'tenants.unknown_host', message: expect.any(String) },
    });
  });

  it('refuses an invalid Host header with 400', async () => {
    const res = await http(port, '/tenant', 'bad_host');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'tenants.invalid_host' } });
  });

  it('refuses a disabled brand with 403', async () => {
    const res = await http(port, '/tenant', 'closed.test');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'tenants.disabled' } });
  });
});
