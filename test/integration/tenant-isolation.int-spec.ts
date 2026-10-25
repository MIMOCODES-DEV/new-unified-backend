import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  Body,
  Controller,
  Get,
  type INestApplicationContext,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { type Db, MongoClient, ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiModule } from '../../src/api.module.js';
import { CliModule } from '../../src/cli.module.js';
import { centralMigrations } from '../../src/migrations.js';
import {
  CreateTenantUseCase,
  GetTenantConfigUseCase,
  GetTenantSecretUseCase,
  SetTenantSecretUseCase,
  TenantsModule,
  UpdateTenantConfigUseCase,
  UpdateTenantSettingsUseCase,
} from '../../src/modules/tenants/index.js';
import { Public } from '../../src/shared/auth/access.decorators.js';
import { CENTRAL_DB } from '../../src/shared/database/database.tokens.js';
import { runMigrations } from '../../src/shared/database/migrations/migration-runner.js';
import { TenantContext } from '../../src/shared/tenancy/tenant-context.js';
import { TenantDb } from '../../src/shared/tenancy/tenant-db.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';
import { TEST_SECRETS_KEY } from '../support/tenant-fakes.js';

/** Test-only routes that touch brand data the way real modules will: through the brand context. */
@Controller('probe')
class ProbeController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly context: TenantContext,
    private readonly secrets: GetTenantSecretUseCase,
    private readonly configs: GetTenantConfigUseCase,
  ) {}

  @Public()
  @Post('notes')
  async add(@Body() body: { text: string }): Promise<{ id: string }> {
    const { insertedId } = await (
      await this.tenantDb.collection('notes')
    ).insertOne({
      text: body.text,
    });
    return { id: insertedId.toHexString() };
  }

  @Public()
  @Get('notes')
  async list(): Promise<string[]> {
    const notes = await (
      await this.tenantDb.collection<{ text: string }>('notes')
    )
      .find({})
      .toArray();
    return notes.map((n) => n.text);
  }

  @Public()
  @Get('notes/:id')
  async one(@Param('id') id: string): Promise<{ text: string }> {
    const note = await (
      await this.tenantDb.collection<{ text: string }>('notes')
    ).findOne({ _id: new ObjectId(id) });
    if (!note) throw new NotFoundException();
    return { text: note.text };
  }

  @Public()
  @Get('secret')
  async secret(): Promise<{ value: string | null }> {
    return { value: await this.secrets.execute(this.context.current.id, 'store.key') };
  }

  @Public()
  @Get('config')
  async config(): Promise<{ trialDays: number }> {
    return { trialDays: (await this.configs.execute(this.context.current)).trial.days };
  }

  @Public()
  @Get('settings')
  settings(): unknown {
    return this.context.current.settings;
  }

  @Public()
  @Get('claim')
  claim(@Query('tid') tid: string): { accepted: boolean } {
    return { accepted: this.context.isCurrent(tid) };
  }
}

@Module({ imports: [TenantsModule], controllers: [ProbeController] })
class ProbeModule {}

describe('tenant isolation (real MongoDB + Redis)', () => {
  const run = randomBytes(3).toString('hex');
  const brands = {
    a: { slug: `a${run}`, host: `a-${run}.test` },
    b: { slug: `b${run}`, host: `b-${run}.test` },
  };
  let infra: TestInfrastructure;
  let app: NestFastifyApplication;
  let cli: INestApplicationContext;
  const ids = { a: '', b: '' };

  const get = (brand: 'a' | 'b', url: string) =>
    app.inject({ method: 'GET', url, headers: { host: brands[brand].host } });
  const post = (brand: 'a' | 'b', url: string, payload: object) =>
    app.inject({ method: 'POST', url, payload, headers: { host: brands[brand].host } });

  beforeAll(async () => {
    infra = await startInfrastructure();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'warn';
    process.env.MONGO_URI = infra.mongoUri;
    process.env.MONGO_CENTRAL_DB = `central_${run}`;
    process.env.REDIS_URL = infra.redisUrl;
    process.env.TENANT_SECRETS_KEY = TEST_SECRETS_KEY;

    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule, ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // A second process, like `pnpm cli`, sharing the same Mongo and Redis.
    cli = await NestFactory.createApplicationContext(CliModule, { logger: false });
    await runMigrations(cli.get<Db>(CENTRAL_DB), centralMigrations);
    for (const key of ['a', 'b'] as const) {
      const created = await cli
        .get(CreateTenantUseCase)
        .execute({ slug: brands[key].slug, name: `Brand ${key}`, hosts: [brands[key].host] });
      if (!created.ok) throw created.error;
      ids[key] = created.value.id;
    }
  });

  afterAll(async () => {
    await cli?.close();
    await app?.close();
    if (infra) {
      const client = await MongoClient.connect(infra.mongoUri);
      for (const db of [`central_${run}`, brands.a.slug, brands.b.slug])
        await client.db(db).dropDatabase();
      await client.close();
      await infra.stop();
    }
  });

  it("writes through brand A's host land in A's database only", async () => {
    await post('a', '/probe/notes', { text: 'from a' });

    expect((await get('a', '/probe/notes')).json()).toEqual(['from a']);
    expect((await get('b', '/probe/notes')).json()).toEqual([]);
  });

  it("brand B cannot read A's record even with its exact id", async () => {
    const { id } = (await post('a', '/probe/notes', { text: 'private' })).json<{ id: string }>();

    expect((await get('a', `/probe/notes/${id}`)).statusCode).toBe(200);
    expect((await get('b', `/probe/notes/${id}`)).statusCode).toBe(404);
  });

  it('concurrent requests for different brands never cross', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        post(i % 2 ? 'a' : 'b', '/probe/notes', { text: `n${i}` }),
      ),
    );

    const a = (await get('a', '/probe/notes')).json<string[]>();
    const b = (await get('b', '/probe/notes')).json<string[]>();
    expect(b).toHaveLength(10);
    expect(b.every((t) => Number(t.slice(1)) % 2 === 0)).toBe(true);
    expect(a.filter((t) => /^n\d+$/.test(t)).every((t) => Number(t.slice(1)) % 2 === 1)).toBe(true);
  });

  it('an unknown host is refused before any brand data is touched', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/probe/notes',
      payload: { text: 'nope' },
      headers: { host: `c-${run}.test` },
    });

    expect(res.statusCode).toBe(421);
    expect((await get('a', '/probe/notes')).json()).not.toContain('nope');
    expect((await get('b', '/probe/notes')).json()).not.toContain('nope');
  });

  it("brand B never gets A's secrets", async () => {
    await cli
      .get(SetTenantSecretUseCase)
      .execute({ slug: brands.a.slug, name: 'store.key', value: 'a-key' });

    expect((await get('a', '/probe/secret')).json()).toEqual({ value: 'a-key' });
    expect((await get('b', '/probe/secret')).json()).toEqual({ value: null });
  });

  it("brand B never gets A's config", async () => {
    await cli
      .get(UpdateTenantConfigUseCase)
      .execute({ slug: brands.a.slug, patch: { trial: { days: 3 } } });

    expect((await get('a', '/probe/config')).json()).toEqual({ trialDays: 3 });
    expect((await get('b', '/probe/config')).json()).toEqual({ trialDays: 7 });
  });

  it('a credential carrying another brand is refused', async () => {
    expect((await get('a', `/probe/claim?tid=${ids.a}`)).json()).toEqual({ accepted: true });
    expect((await get('a', `/probe/claim?tid=${ids.b}`)).json()).toEqual({ accepted: false });
    expect((await get('b', `/probe/claim?tid=${ids.a}`)).json()).toEqual({ accepted: false });
  });

  it('changes made by another process reach the API at once', async () => {
    // Warm the API caches first.
    expect((await get('b', '/probe/settings')).json()).toMatchObject({
      features: { maintenance: false },
    });
    expect((await get('b', '/probe/config')).json()).toEqual({ trialDays: 7 });

    await cli
      .get(UpdateTenantSettingsUseCase)
      .execute({ slug: brands.b.slug, patch: { features: { maintenance: true } } });
    await cli
      .get(UpdateTenantConfigUseCase)
      .execute({ slug: brands.b.slug, patch: { trial: { days: 1 } } });

    // Host cache: dropped in Redis by the save itself.
    expect((await get('b', '/probe/settings')).json()).toMatchObject({
      features: { maintenance: true },
    });
    // Config cache: dropped by a pub/sub notice, delivered asynchronously.
    let trialDays = 0;
    for (let i = 0; i < 40 && trialDays !== 1; i++) {
      trialDays = (await get('b', '/probe/config')).json<{ trialDays: number }>().trialDays;
      if (trialDays !== 1) await sleep(50);
    }
    expect(trialDays).toBe(1);
  });
});
