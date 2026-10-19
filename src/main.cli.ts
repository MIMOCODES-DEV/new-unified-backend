import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import type { Db } from 'mongodb';
import { Logger } from 'nestjs-pino';
import { CliModule } from './cli.module.js';
import { centralMigrations, tenantMigrations } from './migrations.js';
import {
  ActivateDeviceUseCase,
  DeviceSettings,
  parseLegacyProfile,
  RegisterOrGetDeviceUseCase,
  SetTrialDaysUseCase,
} from './modules/devices/index.js';
import {
  CreateTenantUseCase,
  ListTenantsUseCase,
  SeedTenantsUseCase,
} from './modules/tenants/index.js';
import { loadTenantSeed } from './tenant-seed.js';
import { CENTRAL_DB } from './shared/database/database.tokens.js';
import { runMigrations } from './shared/database/migrations/migration-runner.js';
import { TenantDbRegistry } from './shared/database/tenant-db.registry.js';
import type { DomainError } from './shared/kernel/domain-error.js';
import { TenantContext } from './shared/tenancy/tenant-context.js';

type Command = (app: INestApplicationContext, logger: Logger, args: string[]) => Promise<void>;

/** Runs `fn` as the brand `slug`, the way TenantMiddleware does for an HTTP request. */
async function asTenant(
  app: INestApplicationContext,
  logger: Logger,
  slug: string,
  fn: () => Promise<void>,
): Promise<void> {
  const tenant = (await app.get(ListTenantsUseCase).execute()).find((t) => t.slug === slug);
  if (!tenant) {
    logger.error(`Unknown tenant: ${slug}`);
    process.exitCode = 1;
    return;
  }
  const { id, name, dbName } = tenant;
  await app.get(TenantContext).run({ id, slug, name, dbName }, fn);
}

function fail(logger: Logger, error: DomainError): void {
  logger.error(`${error.code}: ${error.message}`);
  process.exitCode = 1;
}

const commands: Record<string, Command> = {
  'migrate:central': async (app, logger) => {
    const applied = await runMigrations(app.get<Db>(CENTRAL_DB), centralMigrations);
    logger.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Central DB is up to date');
  },
  // pnpm cli migrate:tenants [slug...]   (default: every brand, enabled or not)
  'migrate:tenants': async (app, logger, slugs) => {
    const registry = app.get(TenantDbRegistry);
    const tenants = (await app.get(ListTenantsUseCase).execute()).filter(
      (t) => slugs.length === 0 || slugs.includes(t.slug),
    );
    for (const missing of slugs.filter((s) => !tenants.some((t) => t.slug === s))) {
      logger.error(`Unknown tenant: ${missing}`);
      process.exitCode = 1;
    }
    for (const t of tenants) {
      const applied = await runMigrations(
        await registry.getDb({ dbName: t.dbName }),
        tenantMigrations,
      );
      logger.log(`${t.slug} (${t.dbName}): ${applied.length ? applied.join(', ') : 'up to date'}`);
    }
  },
  // pnpm cli tenant:create <slug> "<name>" <host> [host...]
  'tenant:create': async (app, logger, [slug = '', name = '', ...hosts]) => {
    const result = await app.get(CreateTenantUseCase).execute({ slug, name, hosts });
    if (!result.ok) {
      logger.error(
        `${result.error.code}: ${result.error.message} ${JSON.stringify(result.error.details ?? {})}`,
      );
      process.exitCode = 1;
      return;
    }
    const t = result.value;
    logger.log(
      `Created ${t.slug} (${t.name}) on ${t.hosts.map((h) => h.value).join(', ')} · db ${t.dbName}`,
    );
  },
  // pnpm cli tenants:seed [file] [--dev]   (default seeds/tenants.seed.json; --dev adds <slug>.localhost)
  'tenants:seed': async (app, logger, args) => {
    const dev = args.includes('--dev');
    const file = args.find((a) => !a.startsWith('--')) ?? 'seeds/tenants.seed.json';
    const report = await app.get(SeedTenantsUseCase).execute(await loadTenantSeed(file, dev));
    logger.log(
      `Seeded ${file}${dev ? ' with dev hosts' : ''}: ${report.created.length} created, ` +
        `${report.updated.length} updated, ${report.unchanged.length} unchanged`,
    );
    for (const c of report.conflicts) {
      logger.warn(`Host ${c.host} wanted by ${c.slug} already belongs to ${c.ownedBy}`);
    }
    for (const e of report.errors) logger.error(`${e.slug}: ${e.code} ${e.message}`);
    if (report.errors.length > 0) process.exitCode = 1;
  },
  // pnpm cli device:register <slug> <mac|-> <app-type> [app-device-id]   (what an app does on every start;
  //   "-" = the device reports no MAC, then the app-device-id identifies it)
  'device:register': async (
    app,
    logger,
    [slug = '', macAddress = '', appType = '', appDeviceId],
  ) => {
    await asTenant(app, logger, slug, async () => {
      const result = await app.get(RegisterOrGetDeviceUseCase).execute({
        macAddress: macAddress === '-' ? '' : macAddress,
        appType,
        appDeviceId,
      });
      if (!result.ok) return fail(logger, result.error);
      const { device, outcome } = result.value;
      const expired = device.isTrialExpired(new Date()) ? ' (expired)' : '';
      logger.log(
        `${outcome} ${slug} ${device.macAddress.value} · key ${device.deviceKey} · ${device.state} · ` +
          `trial until ${device.trialExpiresAt.toISOString()}${expired}`,
      );
    });
  },
  // pnpm cli device:trial-days <slug> [days]   (show, or set, how long new devices of a brand stay on trial)
  'device:trial-days': async (app, logger, [slug = '', days]) => {
    await asTenant(app, logger, slug, async () => {
      if (days === undefined) {
        logger.log(`${slug} trial: ${(await app.get(DeviceSettings).trialDays()).days} days`);
        return;
      }
      const result = await app.get(SetTrialDaysUseCase).execute({ days });
      if (!result.ok) return fail(logger, result.error);
      logger.log(`${slug} trial set to ${result.value.days} days (new devices only)`);
    });
  },
  // pnpm cli device:legacy-profile <slug> [ibo|bob|cr]   (which old backend the brand's installed apps expect)
  'device:legacy-profile': async (app, logger, [slug = '', profile]) => {
    await asTenant(app, logger, slug, async () => {
      const settings = app.get(DeviceSettings);
      if (profile === undefined) {
        logger.log(`${slug} legacy profile: ${await settings.legacyProfile()}`);
        return;
      }
      const parsed = parseLegacyProfile(profile);
      if (!parsed.ok) return fail(logger, parsed.error);
      await settings.setLegacyProfile(parsed.value);
      logger.log(`${slug} legacy profile set to ${parsed.value}`);
    });
  },
  // pnpm cli device:activate <slug> <mac>   (stands in for a payment until payments exist)
  'device:activate': async (app, logger, [slug = '', macAddress = '']) => {
    await asTenant(app, logger, slug, async () => {
      const result = await app.get(ActivateDeviceUseCase).execute({ macAddress });
      if (!result.ok) return fail(logger, result.error);
      const { device, outcome } = result.value;
      logger.log(
        `${outcome} ${slug} ${device.macAddress.value} · key ${device.deviceKey} · ` +
          `paid since ${device.activatedAt?.toISOString() ?? '?'}`,
      );
    });
  },
};

const name = process.argv[2] ?? '';
const command = commands[name];
if (!command) {
  console.error(`Usage: pnpm cli <command>\nCommands: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(CliModule, { bufferLogs: true });
const logger = app.get(Logger);
app.useLogger(logger);
try {
  await command(app, logger, process.argv.slice(3));
} finally {
  await app.close();
}
