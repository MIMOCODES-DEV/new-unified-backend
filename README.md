# Unified Backend

One multi-tenant backend replacing `iboplayer-backend`, `bobplayer-backend` and `cr-unified-backend`.

- Why and scope: [PLAN.md](PLAN.md)
- What it does: [docs/FEATURES.md](docs/FEATURES.md)
- How it is built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Who does what: [docs/TASKS.md](docs/TASKS.md)
- How we work: [CONTRIBUTING.md](CONTRIBUTING.md)

## Stack

Node.js 24 · TypeScript (strict) · NestJS 12 on Fastify · MongoDB (native driver) · Redis + BullMQ · zod · pino · Vitest

## Getting started

Requirements: Node.js 24 (`.nvmrc`), pnpm 9 (`corepack enable`), Docker.

```sh
pnpm install
cp .env.example .env
docker compose up -d          # MongoDB (replica set) + Redis
pnpm cli migrate:central      # apply central DB migrations
pnpm dev:api                  # HTTP API on http://localhost:3000 (GET /health, /ready)
pnpm dev:worker               # background jobs (separate terminal)
```

## Scripts

| Command                                | What it does                                                           |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev:api` / `pnpm dev:worker`     | Run the API / worker from source with reload                           |
| `pnpm cli <command>`                   | One-shot commands; run `pnpm cli` alone to list them (see below)       |
| `pnpm build`                           | Compile `src/` to `dist/` with SWC                                     |
| `pnpm start:api` / `pnpm start:worker` | Run the compiled build                                                 |
| `pnpm lint`                            | ESLint, including the architecture boundary rules                      |
| `pnpm typecheck`                       | `tsc --noEmit`                                                         |
| `pnpm test`                            | Unit tests                                                             |
| `pnpm test:int`                        | Integration tests against real Mongo + Redis containers (needs Docker) |
| `pnpm format`                          | Prettier                                                               |

## Brands (tenants)

```sh
pnpm cli tenants:seed --dev                        # load seeds/tenants.seed.json (+ <slug>.localhost hosts)
pnpm cli migrate:tenants                           # create indexes in every brand's database
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

Without Docker, `pnpm test:int` can use servers you are happy to wipe:
`TEST_MONGO_URI="mongodb://localhost:27019/?replicaSet=rs0&directConnection=true" TEST_REDIS_URL=redis://localhost:6380 pnpm test:int`.

## Layout

```
src/
  main.api.ts · main.worker.ts · main.cli.ts   entry points (one image, three commands)
  api.module.ts · worker.module.ts · cli.module.ts
  shared/        kernel, config, logger, errors, auth, database, redis, queue — no business logic
  tenancy/       host → tenant, tenant context (added in TEN-01)
  modules/       feature modules (copy modules/_template to start one)
  interfaces/    the doors: http, legacy, store, webhooks, v5, admin, reseller, customer
  jobs/          scheduled and queued work (worker process only)
test/
  unit/  integration/  support/
```

Every HTTP route must declare who may call it (`@Public()`, `@LegacyDevice()`, `@Store()`, `@Staff()`, `@Reseller()`, `@Customer()`, `@Platform()`). Undeclared routes are refused at runtime and fail `test/unit/route-access.spec.ts`.
