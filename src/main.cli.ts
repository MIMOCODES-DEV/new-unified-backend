import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import type { Db } from 'mongodb';
import { Logger } from 'nestjs-pino';
import { CliModule } from './cli.module.js';
import { parseValue, patchFromPath, readStdin } from './cli-args.js';
import { centralMigrations, tenantMigrations } from './migrations.js';
import { SeedDeviceExamples } from './modules/devices/index.js';
import { SeedDomainMigrationExamples } from './modules/domain-migrations/index.js';
import { SeedLicenseExamples } from './modules/licensing/index.js';
import { SeedPlaylistExamples } from './modules/playlists/index.js';
import {
  AddTenantHostsUseCase,
  CreateTenantUseCase,
  DeleteTenantSecretUseCase,
  GetTenantConfigUseCase,
  GetTenantUseCase,
  ListTenantSecretsUseCase,
  ListTenantsUseCase,
  SeedTenantsUseCase,
  SetTenantSecretUseCase,
  UpdateTenantConfigUseCase,
  UpdateTenantSettingsUseCase,
} from './modules/tenants/index.js';
import { AppConfig } from './shared/config/app-config.js';
import { loadTenantSeed } from './tenant-seed.js';
import { CENTRAL_DB } from './shared/database/database.tokens.js';
import { runMigrations } from './shared/database/migrations/migration-runner.js';
import { TenantDbRegistry } from './shared/database/tenant-db.registry.js';
import type { DomainError } from './shared/kernel/domain-error.js';
import { TenantContext } from './shared/tenancy/tenant-context.js';

type Command = (app: INestApplicationContext, logger: Logger, args: string[]) => Promise<void>;

function fail(logger: Logger, error: DomainError): void {
  logger.error(`${error.code}: ${error.message} ${JSON.stringify(error.details ?? {})}`);
  process.exitCode = 1;
}

function usage(logger: Logger, line: string): void {
  logger.error(`Usage: pnpm cli ${line}`);
  process.exitCode = 1;
}

/** The brands named on the command line, or every brand (enabled or not) when none is named. */
async function selectTenants(app: INestApplicationContext, logger: Logger, slugs: string[]) {
  const tenants = (await app.get(ListTenantsUseCase).execute()).filter(
    (t) => slugs.length === 0 || slugs.includes(t.slug),
  );
  for (const missing of slugs.filter((s) => !tenants.some((t) => t.slug === s))) {
    logger.error(`Unknown tenant: ${missing}`);
    process.exitCode = 1;
  }
  return tenants;
}

const commands: Record<string, Command> = {
  'migrate:central': async (app, logger) => {
    const applied = await runMigrations(app.get<Db>(CENTRAL_DB), centralMigrations);
    logger.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Central DB is up to date');
  },
  // pnpm cli migrate:tenants [slug...]   (default: every brand, enabled or not)
  'migrate:tenants': async (app, logger, slugs) => {
    const registry = app.get(TenantDbRegistry);
    for (const t of await selectTenants(app, logger, slugs)) {
      const applied = await runMigrations(
        await registry.getDb({ dbName: t.dbName }),
        tenantMigrations,
      );
      logger.log(`${t.slug} (${t.dbName}): ${applied.length ? applied.join(', ') : 'up to date'}`);
    }
  },
  // pnpm cli seed:examples [slug...]   (example rows of every Phase 1 collection; never in production)
  'seed:examples': async (app, logger, slugs) => {
    if (app.get(AppConfig).env.NODE_ENV === 'production') {
      logger.error('seed:examples writes example data and never runs in production');
      process.exitCode = 1;
      return;
    }
    const context = app.get(TenantContext);
    for (const t of await selectTenants(app, logger, slugs)) {
      const brand = {
        id: t.id,
        slug: t.slug,
        name: t.name,
        dbName: t.dbName,
        settings: t.settings,
      };
      const counts = await context.run(brand, async () => ({
        ...(await app.get(SeedDeviceExamples).execute()),
        ...(await app.get(SeedLicenseExamples).execute()),
        ...(await app.get(SeedPlaylistExamples).execute()),
      }));
      logger.log(`${t.slug}: ${JSON.stringify(counts)}`);
    }
    const central = await app.get(SeedDomainMigrationExamples).execute();
    logger.log(`central: ${JSON.stringify(central)}`);
  },
  // pnpm cli tenant:create <slug> "<name>" <host> [host...]   (also prepares the brand's database)
  'tenant:create': async (app, logger, [slug = '', name = '', ...hosts]) => {
    const result = await app.get(CreateTenantUseCase).execute({ slug, name, hosts });
    if (!result.ok) return fail(logger, result.error);
    const t = result.value;
    const applied = await runMigrations(
      await app.get(TenantDbRegistry).getDb({ dbName: t.dbName }),
      tenantMigrations,
    );
    logger.log(
      `Created ${t.slug} (${t.name}) on ${t.hosts.map((h) => h.value).join(', ')} · db ${t.dbName}` +
        ` · ${applied.length} migrations applied`,
    );
  },
  // pnpm cli tenant:show <slug>
  'tenant:show': async (app, logger, [slug = '']) => {
    const result = await app.get(GetTenantUseCase).execute(slug);
    if (!result.ok) return fail(logger, result.error);
    const t = result.value;
    const secrets = await app.get(ListTenantSecretsUseCase).execute(t.slug);
    logger.log(
      JSON.stringify(
        {
          slug: t.slug,
          name: t.name,
          status: t.status,
          dbName: t.dbName,
          hosts: t.hosts.map((h) => h.value),
          settings: t.settings,
          secrets: secrets.ok ? secrets.value.map((s) => s.name) : [],
        },
        null,
        2,
      ),
    );
  },
  // pnpm cli tenant:add-host <slug> <host> [host...]
  'tenant:add-host': async (app, logger, [slug = '', ...hosts]) => {
    if (hosts.length === 0) return usage(logger, 'tenant:add-host <slug> <host> [host...]');
    const result = await app.get(AddTenantHostsUseCase).execute({ slug, hosts });
    if (!result.ok) return fail(logger, result.error);
    logger.log(
      `${result.value.slug} answers on ${result.value.hosts.map((h) => h.value).join(', ')}`,
    );
  },
  // pnpm cli tenant:set <slug> <setting> <value>   e.g. features.maintenance true
  'tenant:set': async (app, logger, [slug = '', path = '', raw]) => {
    if (!path || raw === undefined) return usage(logger, 'tenant:set <slug> <setting> <value>');
    const result = await app
      .get(UpdateTenantSettingsUseCase)
      .execute({ slug, patch: patchFromPath(path, parseValue(raw)) });
    if (!result.ok) return fail(logger, result.error);
    logger.log(`${result.value.slug} settings: ${JSON.stringify(result.value.settings)}`);
  },
  // pnpm cli tenant:set-secret <slug> <name> [value]   (without value: read from stdin)
  'tenant:set-secret': async (app, logger, [slug = '', name = '', inline]) => {
    const value = inline ?? (await readStdin());
    if (!name || !value) {
      return usage(logger, 'tenant:set-secret <slug> <name> <value>  (or pipe the value in)');
    }
    const result = await app.get(SetTenantSecretUseCase).execute({ slug, name, value });
    if (!result.ok) return fail(logger, result.error);
    logger.log(`Secret ${name} of ${slug} saved`);
  },
  // pnpm cli tenant:delete-secret <slug> <name>
  'tenant:delete-secret': async (app, logger, [slug = '', name = '']) => {
    const result = await app.get(DeleteTenantSecretUseCase).execute({ slug, name });
    if (!result.ok) return fail(logger, result.error);
    logger.log(`Secret ${name} of ${slug} deleted`);
  },
  // pnpm cli tenant:secrets <slug>   (names only, never values)
  'tenant:secrets': async (app, logger, [slug = '']) => {
    const result = await app.get(ListTenantSecretsUseCase).execute(slug);
    if (!result.ok) return fail(logger, result.error);
    if (result.value.length === 0) logger.log(`${slug} has no secrets`);
    for (const s of result.value) logger.log(`${s.name}  (updated ${s.updatedAt.toISOString()})`);
  },
  // pnpm cli tenant:config <slug>
  'tenant:config': async (app, logger, [slug = '']) => {
    const tenant = await app.get(GetTenantUseCase).execute(slug);
    if (!tenant.ok) return fail(logger, tenant.error);
    logger.log(
      JSON.stringify(await app.get(GetTenantConfigUseCase).execute(tenant.value), null, 2),
    );
  },
  // pnpm cli tenant:config:set <slug> <key> <value>   e.g. trial.days 3
  'tenant:config:set': async (app, logger, [slug = '', path = '', raw]) => {
    if (!path || raw === undefined) return usage(logger, 'tenant:config:set <slug> <key> <value>');
    const result = await app
      .get(UpdateTenantConfigUseCase)
      .execute({ slug, patch: patchFromPath(path, parseValue(raw)) });
    if (!result.ok) return fail(logger, result.error);
    logger.log(`${slug} config: ${JSON.stringify(result.value)}`);
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
