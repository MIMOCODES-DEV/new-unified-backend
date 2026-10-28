# Unified Backend

One multi-tenant backend replacing `iboplayer-backend`, `bobplayer-backend` and `cr-unified-backend`.

- Why and scope: [PLAN.md](PLAN.md)
- What it does: [docs/FEATURES.md](docs/FEATURES.md)
- How it is built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **The implementation plan: phases, tasks, expected outputs and status:** [docs/ROADMAP.md](docs/ROADMAP.md); each
  phase has its own page (tasks, schema, APIs, diagrams) in [docs/phases/](docs/phases/) and its own branch `phase/<n>-<name>`
- The device core: its collections [docs/SCHEMA.md](docs/SCHEMA.md), the rules of each module [docs/modules/](docs/modules/)
- Open questions between us: [docs/DISCUSSIONS.md](docs/DISCUSSIONS.md)
- How to check that everything still works: [docs/TESTING.md](docs/TESTING.md)
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
[docs/TESTING.md](docs/TESTING.md#1-local-setup-without-docker). On Windows start MongoDB with
`--ipv6 --bind_ip 127.0.0.1,::1`: `localhost` resolves to `::1` first, and MongoDB Compass cannot connect otherwise.
Open the same `MONGO_URI` in Compass to look at the data.

## Example data

`npm run seed` prepares a local database from nothing, and is safe to run again:

1. `pnpm cli migrate:central`: central collections (tenants, secrets, `domainMigrations`).
2. `pnpm cli tenants:seed --dev`: the brands in `seeds/tenants.seed.json`, each also on `<slug>.localhost`.
3. `pnpm cli migrate:tenants`: the device core collections and indexes in every brand's database.
4. `pnpm cli playlists:pin-keys`: a playlist PIN key in every brand's secrets (a missing one is created, an existing one is never replaced).
5. `pnpm cli seed:examples [slug...]`: an example of everything the device core stores, in every brand (or the brands named).

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
| `pnpm e2e:<area>`                      | End-to-end checks against a running API: devices, playlists, licenses, v4, moves     |

Before merging, run what CI runs: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test &&
pnpm test:int && pnpm build`. The full checklist and the end-to-end checks are in
[docs/TESTING.md](docs/TESTING.md).

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

## Device core operations

```sh
pnpm cli devices:cleanup [--days N] [--limit N] [slug...]   # LIC-4: report stale trial devices (dry run)
pnpm cli devices:cleanup --apply [--days N] [slug...]       # … and delete them, with their playlists
pnpm cli domain-moves:list [awaiting|pending|approved|blocked]   # DOM-2: provider moves (default: awaiting)
pnpm cli domain-moves:approve <id> <who>                    # served in playlist replies within a minute
pnpm cli domain-moves:block <id> <who>                      # never served
```

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
  ROADMAP.md     the implementation plan: phases, tasks, expected outputs, status (the only status page)
  phases/        one page per phase: tasks, schema, APIs, diagrams (Phase 5 is a plan)
  SCHEMA.md      the device core collections; schema.html shows them next to the old models
  modules/       the rules of each module, by task id (devices, licensing, playlists, recovery, domain-moves)
  TESTING.md     local setup, the checks, the end-to-end scenarios, the run log
  DISCUSSIONS.md open questions between Ali and Omar
  ARCHITECTURE.md · FEATURES.md · adr/   how it is built, what the old backends did, decisions
  inventory/ · data-profiles/            evidence from the old backends
```

Every HTTP route must declare who may call it (`@Public()`, `@LegacyDevice()`, `@Store()`, `@Staff()`, `@Reseller()`, `@Customer()`, `@Platform()`). Undeclared routes are refused at runtime and fail `test/unit/route-access.spec.ts`.
