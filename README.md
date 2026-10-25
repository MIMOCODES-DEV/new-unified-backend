# Unified Backend

One multi-tenant backend replacing `iboplayer-backend`, `bobplayer-backend` and `cr-unified-backend`.

- Why and scope: [PLAN.md](PLAN.md)
- What it does: [docs/FEATURES.md](docs/FEATURES.md)
- How it is built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Who does what: [docs/TASKS.md](docs/TASKS.md)
- **Current work, Phase 1 (device core):** [docs/phase-1/README.md](docs/phase-1/README.md): schema, tasks, guide
- How to check that everything still works: [docs/phase-1/TESTS.md](docs/phase-1/TESTS.md)
- How we work: [CONTRIBUTING.md](CONTRIBUTING.md)

## Stack

Node.js 24 · TypeScript (strict) · NestJS 12 on Fastify · MongoDB (native driver) · Redis + BullMQ · zod · pino · Vitest

## Getting started

Requirements: Node.js 24 (`.nvmrc`), pnpm 9 (`corepack enable`), and two servers: **MongoDB as a replica set** and
**Redis**. Both are required; the CLI waits for Redis.

```sh
pnpm install
cp .env.example .env          # keep TENANT_SECRETS_KEY: secrets stored with one key cannot be read with another
docker compose up -d          # MongoDB (replica set) + Redis; or start them yourself, see below
npm run seed                  # databases, brands and example data (see "Example data")
pnpm dev:api                  # HTTP API on http://localhost:3000 (GET /health, /ready)
pnpm dev:worker               # background jobs (separate terminal)
```

**Without Docker**, run MongoDB as a one-member replica set on 27018 and Redis on 6379 yourself, and point `.env` at
them:

```ini
MONGO_URI=mongodb://localhost:27018/?replicaSet=rs0&directConnection=true
REDIS_URL=redis://localhost:6379
```

Step by step, with the commands for this machine, in
[docs/phase-1/TESTS.md](docs/phase-1/TESTS.md#1-local-setup-without-docker). On Windows start MongoDB with
`--ipv6 --bind_ip 127.0.0.1,::1`: `localhost` resolves to `::1` first, and MongoDB Compass cannot connect otherwise.
Open the same `MONGO_URI` in Compass to look at the data.

## Example data

`npm run seed` prepares a local database from nothing, and is safe to run again:

1. `pnpm cli migrate:central`: central collections (tenants, secrets, `domainMigrations`).
2. `pnpm cli tenants:seed --dev`: the brands in `seeds/tenants.seed.json`, each also on `<slug>.localhost`.
3. `pnpm cli migrate:tenants`: the Phase 1 collections and indexes in every brand's database.
4. `pnpm cli seed:examples [slug...]`: an example of everything Phase 1 stores, in every brand (or the brands named).

`seed:examples` refuses to run with `NODE_ENV=production`. Every example id starts with `example-` and every example
MAC with `02:00:` (never a real device), so a second run refreshes the same rows. Each brand gets:

| Collection         | Examples                                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trialDevices` (5) | a running trial with two playlists · a V4 device with a u_id · a trial that ended weeks ago with no playlist (what the cleanup job looks for) · a TV without a usable MAC (`appDeviceId`) · a device moved from an old backend (`legacy`) |
| `devices` (4)      | yearly, extended early · lifetime from a multi-device store order, Stalker on · switched MAC with a recovery code waiting · revoked                                                                                                       |
| `licenses` (5)     | two stacked yearly licenses (the second starts where the first ends) · lifetime (2 credits, multiActivate) · paid online · revoked by staff                                                                                               |
| `playlists` (5)    | m3u with EPG · xtream with 2 backup hosts and provider branding · Stalker portal · provider code · m3u added by an admin                                                                                                                  |
| `captchas` (4)     | open V4 · solved V4 (kept, no expiry) · open u_id recovery · open website. Open captchas expire 10 minutes after the seed.                                                                                                                |

The central database gets 3 provider moves in `domainMigrations`: pending (2 reports), approved (3), blocked (4).

Paid examples are created as trials and moved to `devices` through `DeviceIdentity`, the same path real devices take,
so a MAC is never in both collections.

## Scripts

| Command                                | What it does                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run seed`                         | Migrations, dev brands and example data (above)                                      |
| `pnpm dev:api` / `pnpm dev:worker`     | Run the API / worker from source with reload                                         |
| `pnpm cli <command>`                   | One-shot commands; run `pnpm cli` alone to list them (see below)                     |
| `pnpm build`                           | Compile `src/` to `dist/` with SWC                                                   |
| `pnpm start:api` / `pnpm start:worker` | Run the compiled build                                                               |
| `pnpm lint`                            | ESLint, including the architecture boundary rules                                    |
| `pnpm typecheck`                       | `tsc --noEmit`                                                                       |
| `pnpm knip`                            | Unused files and exports                                                             |
| `pnpm test`                            | Unit tests                                                                           |
| `pnpm test:int`                        | Integration tests against real MongoDB + Redis (containers, or servers you can wipe) |
| `pnpm format`                          | Prettier                                                                             |

Before merging, run what CI runs: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test &&
pnpm test:int && pnpm build`. The full checklist and the end-to-end checks are in
[docs/phase-1/TESTS.md](docs/phase-1/TESTS.md).

Without Docker, `pnpm test:int` uses servers you are happy to wipe, **never your dev database** (the tests leave data
behind, so empty them before each run):
`TEST_MONGO_URI="mongodb://localhost:27019/?replicaSet=rs0&directConnection=true" TEST_REDIS_URL=redis://localhost:6380 pnpm test:int`.

## Brands (tenants)

```sh
pnpm cli tenants:seed --dev                        # load seeds/tenants.seed.json (+ <slug>.localhost hosts)
pnpm cli migrate:tenants [slug...]                 # create collections and indexes in every brand's database
pnpm cli seed:examples [slug...]                   # example devices, licenses, playlists, captchas (not in production)
pnpm cli tenant:create <slug> "<name>" <host>...   # new brand, database prepared
pnpm cli tenant:show <slug>                        # hosts, settings, secret names
pnpm cli tenant:add-host <slug> <host>...
pnpm cli tenant:set <slug> features.maintenance true            # flags, profiles, CORS origins…
echo '<value>' | pnpm cli tenant:set-secret <slug> store.key    # stored encrypted (TENANT_SECRETS_KEY)
pnpm cli tenant:secrets <slug>                     # names only, never values
pnpm cli tenant:delete-secret <slug> <name>
pnpm cli tenant:config <slug>                      # business config (tenantConfig) with defaults
pnpm cli tenant:config:set <slug> trial.days 3
```

Changes reach running API processes immediately (Redis host cache and pub/sub notices).

## Layout

```
src/
  main.api.ts · main.worker.ts · main.cli.ts   entry points (one image, three commands)
  api.module.ts · worker.module.ts · cli.module.ts
  migrations.ts  every central and brand migration, in order
  shared/        kernel, config, logger, errors, auth, database, redis (RedisLock), http, tenancy, queue
  modules/       one folder per module (copy modules/_template to start one):
    tenants/            brands, hosts, settings, secrets, config
    devices/            trialDevices, devices, captchas; DeviceIdentity (one MAC, one device)
    licensing/          licenses
    playlists/          playlists
    domain-migrations/  provider host moves (central)
  interfaces/    the doors: http, legacy, store, webhooks, v5, admin, reseller, customer
  jobs/          scheduled and queued work (worker process only)
test/
  unit/  integration/  support/
docs/
  phase-1/       the current work: README (schema, tasks, guide), TESTS, database-schema.html, implementation-plan.html
```

Every HTTP route must declare who may call it (`@Public()`, `@LegacyDevice()`, `@Store()`, `@Staff()`, `@Reseller()`, `@Customer()`, `@Platform()`). Undeclared routes are refused at runtime and fail `test/unit/route-access.spec.ts`.
