import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import type { Db } from 'mongodb';
import { Logger } from 'nestjs-pino';
import { CliModule } from './cli.module.js';
import { centralMigrations, tenantMigrations } from './migrations.js';
import {
  CreateTenantUseCase,
  ListTenantsUseCase,
  SeedTenantsUseCase,
} from './modules/tenants/index.js';
import { loadTenantSeed } from './tenant-seed.js';
import { CENTRAL_DB } from './shared/database/database.tokens.js';
import { runMigrations } from './shared/database/migrations/migration-runner.js';
import { TenantDbRegistry } from './shared/database/tenant-db.registry.js';

type Command = (app: INestApplicationContext, logger: Logger, args: string[]) => Promise<void>;

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
