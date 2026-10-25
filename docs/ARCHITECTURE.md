# Architecture

> Status: **Draft for review — Thursday 2026-10-15 kickoff**
> Companion docs: `PLAN.md` (why + scope), `docs/FEATURES.md` (what), `docs/TASKS.md` (who/when).

---

## 1. Guiding decision: rebuild, don't copy

Every feature is re-implemented **from its intent**, cleanly, without the old bugs. The old code is a reference for *what* a feature does, never for *how*.

The single exception is the **wire format of old apps** (TVs, Android, iOS, Roku) that can't be updated: they keep calling the same URLs with the same encoded bodies and expect the same response shape. That is not "copying logic" — it's an **interface**. It lives only in thin protocol adapters at the edge (`interfaces/legacy/`); nothing behind them knows old formats exist.

```
 old TV app ──► [legacy adapter: decode envelope → DTO] ──► Use case (clean) ──► [legacy presenter: DTO → old JSON → encode]
 new app    ──► [v5 controller: JSON + JWT]             ──► same use case   ──► [v5 presenter]
 store      ──► [store controller: token header]        ──► same use case   ──► [store presenter]
```

## 2. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js 24 LTS | |
| Language | TypeScript, `strict: true` | no `any` (lint rule) |
| Framework | NestJS 11 on **Fastify** adapter | DI, modules, guards, interceptors |
| Database | MongoDB 7+ | central DB + one DB per tenant |
| DB access | **Proposal: official `mongodb` driver + typed repositories** (alternative: Mongoose) | see §9 decision 1 |
| Validation | zod (env, DTOs, documents) | one schema → TS type |
| Cache / queues | Redis 7 + BullMQ | rate limit, cache, jobs, locks |
| Tenant context | `nestjs-cls` (AsyncLocalStorage) | no request-scoped providers |
| Logging | pino (`nestjs-pino`) | request id, tenant, redaction of secrets |
| Tests | Vitest + Testcontainers (Mongo, Redis) | unit, integration, contract |
| Package manager | pnpm | |
| Quality | ESLint (typescript-eslint, import boundaries), Prettier, Husky + lint-staged, commitlint | |
| CI | GitHub Actions (or the team's CI) | lint · typecheck · test · build image |
| Container | Docker, `docker-compose.yml` for local Mongo + Redis | |
| API docs | OpenAPI (`@nestjs/swagger`) for new APIs only | |

## 3. Layers (Clean Architecture)

```
┌───────────────────────────────────────────────────────────────┐
│ interfaces   HTTP controllers, legacy codecs/presenters,      │  depends on ▼
│              job processors, CLI commands                     │
├───────────────────────────────────────────────────────────────┤
│ application  Use cases (one class per action), ports          │  depends on ▼
│              (interfaces for repos/gateways), app DTOs        │
├───────────────────────────────────────────────────────────────┤
│ domain       Entities, value objects, domain services,        │  depends on nothing
│              domain errors — pure TS, no Nest, no Mongo       │
└───────────────────────────────────────────────────────────────┘
  infrastructure  Mongo repositories, Redis, payment SDKs, HTTP clients
                  implements application ports ▲ (dependency inversion)
```

**Dependency rule:** arrows point inward only. `domain` imports nothing outside itself. `application` imports `domain` only. `infrastructure` and `interfaces` import inward. Enforced by `eslint-plugin-boundaries` in CI.

| Layer | Contains | Must NOT contain |
|---|---|---|
| domain | `Device`, `License`, `MacAddress`, `Money`, `Playlist`… with behaviour (`license.extend()`, `MacAddress.parse()`) | Nest decorators, Mongo types, HTTP, `Date.now()` direct (inject `Clock`) |
| application | `RegisterDeviceUseCase`, `AddPlaylistUseCase`, ports `DeviceRepository`, `PaymentGateway`, `Clock` | wire formats, `req`/`res`, SDK calls |
| infrastructure | `MongoDeviceRepository`, `PaypalGateway`, `RedisRateLimiter` | business rules |
| interfaces | controllers, guards, codecs, presenters, BullMQ processors | business rules, DB calls |

## 4. Repository layout

```
src/
  main.api.ts                 # HTTP process
  main.worker.ts              # BullMQ consumers + schedules
  main.cli.ts                 # migrate / provision / admin CLI

  shared/                     # cross-cutting, no business logic
    kernel/                   # Result, DomainError, Clock, Id, Money, Pagination
    config/                   # zod env schema, ConfigModule (fail fast)
    logger/  errors/          # pino, global exception filter
    database/                 # mongo client, central + tenant connection registry, migrations runner
    redis/  queue/  lock/     # ioredis, BullMQ, distributed locks
    crypto/                   # secrets vault (envelope encryption), hashing
    http/                     # outbound HTTP client (timeouts, SSRF guard)

  tenancy → modules/tenants/  # tenant registry + host resolver (domain, use cases, Mongo repo)
                              # shared/tenancy/ = TenantContext (current brand) + TenantDb (its database)
                              # interfaces/http/tenant/ = the middleware that sets the brand per request

  modules/                    # one folder per bounded context
    devices/
      domain/                 # device.entity.ts, mac-address.vo.ts, license.vo.ts, errors.ts
      application/
        ports/                # device.repository.ts (interface)
        use-cases/            # register-device.use-case.ts, switch-mac.use-case.ts, ...
      infrastructure/         # mongo-device.repository.ts, device.mapper.ts, device.schema.ts
      devices.module.ts
      index.ts                # public API of the module
    playlists/  licensing/  recovery/  domain-migrations/
    staff/  customers/  resellers/  wallet/  codes-coupons/
    payments/   (providers/<name>/ adapters behind PaymentGateway port)
    transfers/  abuse/  content/  i18n/  app-updates/  partners/  media/  audit/

  interfaces/
    legacy/
      codecs/                 # envelope.codec.ts, aes-passphrase.codec.ts, hmac-signature.ts, xor-token.ts
      families/               # tv-legacy/, android-signed/, roku/, ios-android-v2/, v3/, v4/, smart-tv/ ...
                              #   each: controller + request mapper + response presenter
    store/                    # store contract controllers
    v5/                       # new device API
    admin/  reseller/  customer/
    webhooks/                 # payment callbacks at their old paths
  jobs/                       # processors + schedules

test/
  fixtures/legacy/            # recorded request/response pairs per family (contract tests)
docs/
  adr/                        # architecture decision records
```

**Module rules**
- A module exposes only its `index.ts` (Nest module, use cases, public types). Other modules and interfaces never import its `domain/`, `application/` or `infrastructure/` files directly. Enforced by ESLint (`eslint.config.js`).
- One use case = one class = one public `execute()` method. Controllers call use cases, never repositories.
- Cross-module side effects go through **domain events** (in-process event bus; durable ones through BullMQ). E.g. `PaymentConfirmed` → licensing activates the device.

## 5. Request pipeline

```
Cloudflare (origin locked)
 → Fastify
   → requestId + pino logger
   → TenantResolver hook: Host → tenant (registry, Redis-cached). Unknown host ⇒ 421, never a default
   → CLS context set { tenantId, requestId, clientIp (cf-connecting-ip only when from CF) }
   → AbuseGate (Redis sliding windows: IP, /24|/64, ASN, tenant, endpoint class)
   → Route
       legacy/*    → LegacyCodec guard/interceptor (decode body → DTO, encode response)
       store/*     → StoreKeyGuard (per-tenant key from tenantSecrets)
       v5/*        → DeviceJwtGuard (tenant claim)
       admin/*     → StaffJwtGuard + RBAC policy
       reseller/*  → ResellerJwtGuard + policy
       customer/*  → CustomerJwtGuard
   → zod validation pipe
   → Controller → UseCase → Repos (tenant DB from CLS) / central repos
   → Presenter (per interface)
   → Global exception filter: DomainError → interface-specific error shape; unknown → 500, no stack/secrets
```

## 6. Tenancy

- **Central registry** `tenants`: slug, name, status, `hosts[]` (exact), `dbName`/URI ref, feature flags, playlist-shaping profile, legacy protocol options, CORS origins, frontend URL, partner names (StarArcs).
- **Connection registry** (singleton): `getTenantDb(tenantId)` → cached `Db` per tenant, lazily created with an in-flight promise map (no duplicate connections), health-checked.
- Repositories get the DB from CLS — **no code passes `tenant` around**, and no module opens connections.
- Tenant-specific behaviour = **config flags** (`tenant.features.rawPlaylistsForAndroid44`, `tenant.legacy.plainBodyAddRemove`), never `if (slug === 'x')`.
- Every token we issue carries `tid`; guards reject a token whose `tid` ≠ resolved tenant.

## 7. Data

Two kinds of database (details in PLAN §5):
- **Central DB:** `tenants`, `tenantSecrets`, `staffUsers`, `resellers`, `walletAccounts`, `walletLedger`, `activationCodes`, `coupons`, `deviceRegistry`, `licenseTransfers`, `paymentProviders`, i18n, `domainMigrations`, `abuse*`, `auditLog`.
- **Tenant DB:** `trialDevices` (never paid), `devices` (paid at least once), `licenses` (one row per license, kept as history), `playlists`, `captchas`, `customers`, `subscriptions`, `plans`, `packages`, `transactions`, `tenantConfig`, content, `contactMessages`, `appVersions`/`androidApps`.
- **Phase 1** (devices, licensing, playlists, recovery, provider domain moves) builds `trialDevices`, `devices`, `licenses`, `playlists`, `captchas` and the central `domainMigrations`; field lists in [docs/phase-1/README.md](phase-1/README.md).

Conventions:
- camelCase fields, real types (Date UTC, boolean, ObjectId, money as integer minor units + currency).
- Schema = zod schema per document; repository maps document ⇄ domain entity (mapper).
- Indexes are created by **versioned migrations** (`src/shared/database/migrations`), never `autoIndex`.
- `createdAt`/`updatedAt` everywhere; `legacy: { source, id }` on migrated rows.
- **Trial vs paid devices:** a device that never paid is in `trialDevices`; paying moves it to `devices` with the same id, MAC and device key. Each collection has a unique index on `macAddress`; across the two, every create, move and MAC change goes through `DeviceIdentity` (devices module), which holds a Redis lock on the MAC (`RedisLock`, fails closed). Lookups take no lock. The device key is not unique.
- **Playlists:** one collection, a `type` with only that part filled; `url` and the Xtream password are not encrypted, the PIN is (`pinEnc`).
- Cross-DB operations (wallet ↔ tenant activation): ledger reservation + idempotency key + compensation (saga), swept by a worker job.

## 8. Cross-cutting conventions

| Topic | Rule |
|---|---|
| Errors | Use cases return/throw typed `DomainError` (`DeviceNotFound`, `InsufficientCredits`…). Each interface maps them to its own format. |
| Time | Inject `Clock`; store UTC; one timezone policy for "end of day" expiries. |
| Secrets | Env validated at boot; per-tenant secrets encrypted in `tenantSecrets`; never logged (pino redact) or returned. |
| Auth | No route without an explicit decorator: `@Public()`, `@LegacyDevice()`, `@Store()`, `@Staff(role)`, `@Reseller()`, `@Customer()`. CI test fails on undecorated routes. |
| Idempotency | All payment callbacks, store mutations and wallet operations take an idempotency key. |
| Jobs | Only in `worker` process; BullMQ repeatable jobs run once cluster-wide; each has dry-run + metrics. |
| Config per tenant | Typed `tenantConfig` document, cached in Redis, invalidated via pub/sub. |
| Naming | files `kebab-case.type.ts` (`register-device.use-case.ts`), classes `PascalCase`, one export per file. |
| Commits | Conventional Commits; PRs require 1 review (the other dev) + green CI. |
| Decisions | Any architecture change = an ADR in `docs/adr/NNNN-title.md`. |

## 9. Decisions to confirm on Thursday

| # | Question | Proposal |
|---|---|---|
| 1 | Mongoose or native driver? | **Native driver + zod + repositories**: no hidden strict-mode drops, clean domain/persistence split, simple multi-tenant `Db` handles. Mongoose is acceptable if the team prefers familiarity — then models are infrastructure-only and never leak past repositories. |
| 2 | Monorepo with SPAs? | No — backend repo only; SPAs consume OpenAPI. |
| 3 | Test runner | Vitest (fast, native TS) |
| 4 | Hosting/CI target | Needed to finalize Docker/CI (GitHub Actions assumed) |
| 5 | Legacy contract capture | Code-derived contracts + fixtures recorded from the running old backends (local), replayed as contract tests |
| 6 | Node version | 24 LTS |
