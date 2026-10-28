import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import type { Db } from 'mongodb';
import { Logger } from 'nestjs-pino';
import { CliModule } from './cli.module.js';
import { parseValue, patchFromPath, readStdin } from './cli-args.js';
import { centralMigrations, tenantMigrations } from './migrations.js';
import { SeedDeviceExamples } from './modules/devices/index.js';
import {
  DecideHostMoveUseCase,
  type HostMoveFilter,
  ListHostMovesUseCase,
  MOVE_STATUSES,
  SeedDomainMigrationExamples,
} from './modules/domain-migrations/index.js';
import { CleanUpTrialDevicesUseCase, SeedLicenseExamples } from './modules/licensing/index.js';
import { PLAYLIST_PIN_KEY_SECRET, SeedPlaylistExamples } from './modules/playlists/index.js';
import {
  AddTenantHostsUseCase,
  CreateTenantUseCase,
  DeleteTenantSecretUseCase,
  GetTenantConfigUseCase,
  GetTenantSecretUseCase,
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
import { LockUnavailableError, RedisLock } from './shared/redis/redis-lock.js';
import { TenantContext } from './shared/tenancy/tenant-context.js';

type Command = (app: INestApplicationContext, logger: Logger, args: string[]) => Promise<void>;

/** One cleanup per brand at a time, whichever server it is started on. */
const CLEANUP_LOCK = { ttlMs: 30 * 60 * 1000 };
/** The cleanup's default rule: not seen for this many days (and the trial ended). To agree (LIC-4). */
const CLEANUP_DEFAULT_DAYS = 180;
const CLEANUP_DEFAULT_LIMIT = 10_000;

/** `--name value` options and the other arguments, from a command's arguments. */
function options(args: string[], names: string[]): { values: Map<string, string>; rest: string[] } {
  const values = new Map<string, string>();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const name = args[i]!.replace(/^--/, '');
    if (args[i]!.startsWith('--') && names.includes(name) && i + 1 < args.length) {
      values.set(name, args[++i]!);
    } else rest.push(args[i]!);
  }
  return { values, rest };
}

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
  // pnpm cli seed:examples [slug...]   (example rows of every device core collection; never in production)
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
  // pnpm cli playlists:pin-keys [slug...]   (creates missing keys; never replaces one)
  'playlists:pin-keys': async (app, logger, slugs) => {
    for (const t of await selectTenants(app, logger, slugs)) {
      // A new key would make every stored playlist PIN of the brand unreadable.
      if (await app.get(GetTenantSecretUseCase).execute(t.id, PLAYLIST_PIN_KEY_SECRET)) {
        logger.log(`${t.slug}: already has ${PLAYLIST_PIN_KEY_SECRET}`);
        continue;
      }
      const result = await app.get(SetTenantSecretUseCase).execute({
        slug: t.slug,
        name: PLAYLIST_PIN_KEY_SECRET,
        value: randomBytes(32).toString('base64'),
      });
      if (!result.ok) return fail(logger, result.error);
      logger.log(`${t.slug}: created ${PLAYLIST_PIN_KEY_SECRET}`);
    }
  },
  // pnpm cli devices:cleanup [--apply] [--days N] [--limit N] [slug...]   (LIC-4; a dry run unless --apply)
  'devices:cleanup': async (app, logger, args) => {
    const apply = args.includes('--apply');
    const { values, rest } = options(
      args.filter((a) => a !== '--apply'),
      ['days', 'limit'],
    );
    const days = Number(values.get('days') ?? CLEANUP_DEFAULT_DAYS);
    const limit = Number(values.get('limit') ?? CLEANUP_DEFAULT_LIMIT);
    if (!Number.isInteger(days) || days < 1 || !Number.isInteger(limit) || limit < 1) {
      return usage(logger, 'devices:cleanup [--apply] [--days N] [--limit N] [slug...]');
    }
    const context = app.get(TenantContext);
    const lock = app.get(RedisLock);
    for (const t of await selectTenants(app, logger, rest)) {
      const brand = {
        id: t.id,
        slug: t.slug,
        name: t.name,
        dbName: t.dbName,
        settings: t.settings,
      };
      try {
        const report = await lock.withLock(`licensing:cleanup:${t.id}`, CLEANUP_LOCK, () =>
          context.run(brand, () =>
            app
              .get(CleanUpTrialDevicesUseCase)
              .execute({ dryRun: !apply, notSeenDays: days, limit }),
          ),
        );
        logger.log(`${t.slug}: ${JSON.stringify(report)}`);
      } catch (error) {
        if (!(error instanceof LockUnavailableError)) throw error;
        logger.error(`${t.slug}: another cleanup of this brand is running`);
        process.exitCode = 1;
      }
    }
    if (!apply) logger.log('Dry run: nothing was deleted. Run again with --apply to delete.');
  },
  // pnpm cli domain-moves:list [awaiting|pending|approved|blocked]   (default: awaiting approval)
  'domain-moves:list': async (app, logger, [filter = 'awaiting']) => {
    if (filter !== 'awaiting' && !(MOVE_STATUSES as readonly string[]).includes(filter)) {
      return usage(logger, `domain-moves:list [awaiting|${MOVE_STATUSES.join('|')}]`);
    }
    const moves = await app.get(ListHostMovesUseCase).execute(filter as HostMoveFilter);
    for (const m of moves) logger.log(JSON.stringify(m));
    logger.log(`${moves.length} ${filter} provider move(s)`);
  },
  // pnpm cli domain-moves:approve <id> <by>   (DOM-2: served in playlist replies within a minute)
  'domain-moves:approve': async (app, logger, [id = '', by = '']) => {
    if (!id || !by) return usage(logger, 'domain-moves:approve <id> <by>');
    const result = await app.get(DecideHostMoveUseCase).execute({ id, decision: 'approve', by });
    if (!result.ok) return fail(logger, result.error);
    logger.log(`Approved: ${JSON.stringify(result.value)}`);
  },
  // pnpm cli domain-moves:block <id> <by>   (never served, however many confirmations it gets)
  'domain-moves:block': async (app, logger, [id = '', by = '']) => {
    if (!id || !by) return usage(logger, 'domain-moves:block <id> <by>');
    const result = await app.get(DecideHostMoveUseCase).execute({ id, decision: 'block', by });
    if (!result.ok) return fail(logger, result.error);
    logger.log(`Blocked: ${JSON.stringify(result.value)}`);
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
// A command ends here. In development the pretty logger runs in a worker thread that can keep the
// process alive after a command that logged a lot; pino flushes it on exit.
process.exit(process.exitCode ?? 0);
