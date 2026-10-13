# Unified Backend — Master Plan

> Status: **Plan — not started**
> Scope: merge `iboplayer-backend`, `bobplayer-backend` and `cr-unified-backend` into one multi-tenant backend with a central database.
> Each milestone below is intentionally high-level; it gets its own detailed plan when we reach it.

---

## Table of contents

1. [Context: what exists today](#1-context-what-exists-today)
2. [Hard constraints](#2-hard-constraints)
3. [Decisions](#3-decisions)
4. [Target architecture](#4-target-architecture)
5. [Target data model](#5-target-data-model)
6. [Abuse, DDoS and fake-device flooding](#6-abuse-ddos-and-fake-device-flooding)
7. [Findings register (what we are fixing)](#7-findings-register-what-we-are-fixing)
8. [Milestones](#8-milestones)
9. [Risks](#9-risks)
10. [Appendices](#10-appendices)

---

## 1. Context: what exists today

### 1.1 The three backends

| | iboplayer-backend | bobplayer-backend | cr-unified-backend |
|---|---|---|---|
| Brand(s) | IBO Player — **one tenant, 7 domains** (iboplayer.com, iboiptv.com, ibobtv.com, tvplayeribo.com, iboplayerpro.com, iboplayers.pro, ibotvplayer.com) gated per host by settings | BOB Player (single brand) | ~13 tenants, one Mongo DB each |
| Tenancy | Single DB | Single DB | Host → tenant (`TENANTS` env + hardcoded `LEGACY_HOST_RULES`), `APP_<T>_DB_URI` per tenant |
| Code size | ~35k lines (ApiController 7.9k, Frontend 5.3k, Admin 4k) | ~29k lines | ~38k lines (ApiController 9k, Frontend 6.9k, Admin 3.8k) |
| Stack | Express 4, Mongoose 7, cookie-session, passport, EJS, cluster (≤24 workers) | Same (Mongoose 7) | Same (Mongoose **6.0.8**), cluster (≤4 workers) |
| Surfaces | Device API, customer site (EJS + JSON for React SPA), admin panel at an obscured path | Device API, customer site, admin, `/reseller` panel, hosted LG/webOS TV bundle (`public/app_src_min`, ~26 MB) | Device API, customer site + user accounts/plans, admin, reseller panel |
| Unique features | User + ActivationCode credits system (with IP binding), CreditPricePackage, SuspectDevice, AppVersion, Android V3 signed route, cowpay | Reseller collection + ResellerCode/Logo/Notification, cashcall, auto-import from iboplayer.com, `/Mxcvfghytrhjsjj/` alias | User/Plans/VerificationToken accounts, DomainMigration + backup URLs, cross-app transfer, donor migration (polls ibo & bob), Apple IAP, SportsDB mirror, TV v4, iOS/Android v3, PLATFORM_KEY store APIs, ibostb/macplayer quirks |

All three share one lineage: the same obfuscated envelope, AES helpers, XOR device token, `/MBBPj5UwlCmTstXGb/` routes, Roku/iOS APIs, V4 per-app-type routes, store APIs, payment set, settings key/value store. `utils/licenseTransfer.js` is vendored byte-identical in ibo and bob.

### 1.2 Tenant inventory (known from local dev config — **not a fixed list**)

> Tenants are runtime data, not code. The list below is only what the local dev environment shows; production has more. Nothing in the new code may hardcode a tenant slug.

| Source | Tenant slugs |
|---|---|
| iboplayer-backend | `ibo` (multi-domain) |
| bobplayer-backend | `bob` |
| cr-unified `TENANTS` | cr7, ibox, smart, iboxvpn, ibosol, king4k, ibott, ibostb (`bob` is local-test only — **not migrated**) |
| cr-unified legacy-only (`LEGACY_HOST_RULES`) | messi, iboapp, iptvibo, bobprem |
| Referenced in code, never configured | `mac`, `macplayer`, `duplex`, `0player`, `king` (≠ `king4k`, so those branches never fire) |

### 1.3 How the systems talk to each other today

- **External store** (cr7-store / IBOSOL-BACK / "mimo store", Laravel) calls every backend with header `token: STORE_API_KEY`: `save-play-list`, `validate-mac-address`, `save-device-activation` (also carries the license-transfer protocol), `delete-playlist`, `reset-playlist`, `update-domain`, `count-domain-updates`, `switch-mac-address`, `status_check`, … and cr-unified's PLATFORM_KEY APIs (`transfer-device-app`, reseller notifications).
- **License transfer**: store orchestrates by domain — export+deactivate at source, import at target.
- **Donor migration** (cr-unified → ibo/bob over HTTP) and **bob → ibo auto-import**: on login of a non-active device, ask the sibling backend if the MAC is a paying customer there and copy activation + playlists.
- **Cross-app transfer** (cr-unified internal): DB-to-DB copy between tenants.

In the unified backend, ibo/bob/cr-tenant-to-tenant traffic becomes **internal queries** against the central registry; only the store remains external.

### 1.4 Data shape observed in the BOB sample dump

> **Important:** the backend *code* in the three repos is production code, but every local database (including this dump) is **test/sample data**. The **formats and quirks** below are produced by the code and therefore also exist in production; the **counts and percentages** describe the sample only.

- 237,397 devices, 715,954 playlists (**~61% orphaned** — point at deleted devices because `removeOldDevices` deletes playlists by the wrong key in all three backends), 24,786 transactions, 66,996 blocked-IP log rows, 11,990 contact messages.
- Only index present: `devices.app_device_id`. Schema-declared indexes were never built; **`playlists.device_id` has no index anywhere** (every request scans 716k docs).
- `is_trial` only 2 (lifetime, 95k) and 3 (yearly, 142k) in data; ~23k "lifetime" devices have **past** expiry dates.
- `reseller_id`: mixed number / numeric string (8,785 distinct external store reseller ids) / ObjectId string.
- `app_type` mixed case (`iOS`, `tvOS`, `macOS`), 683 missing.
- Settings: duplicate keys (`trial_days` ×6 with different values, `phone_number` ×2); payment secrets in plaintext.

---

## 2. Hard constraints

1. **Old client apps cannot be updated.** Every endpoint they call must keep the same path, method, request format, response shape and wire encoding — byte-for-byte where clients parse it. This includes bugs that clients depend on (e.g. the `'ascii'` base64 decode, response locator chars appended at the end, `{data, languages}` envelopes, `parseM3uUrl` vs `IboParseGeneralUrl` shaping per tenant/app). See Appendix A.
2. **The external store keeps its contract.** Same endpoints, same payloads, same `token` header semantics (per-tenant keys allowed only if the store can be configured per domain — otherwise a compatibility key mapping).
3. **Each brand keeps its domains.** Host-based tenant resolution must keep serving every legacy hostname.
4. **Data must be migratable** from all old DBs into the new schema with a deterministic, re-runnable, verifiable process.
5. **Cutover is not part of this project's execution.** We deliver the backend + migration tooling + a written cutover runbook; another team executes it after review.

---

## 3. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | One backend, multi-tenant | Confirmed |
| D2 | **Central DB + one DB per tenant** | Confirmed |
| D3 | TypeScript + Node + MongoDB (Mongoose or the native driver with typed repositories) | Confirmed |
| D4 | Framework: **NestJS on the Fastify adapter** (see §3.1) | Confirmed |
| D5 | **Redis is a required dependency**, with **BullMQ** for jobs and schedules (see §3.2) | Confirmed |
| D6 | Anti-abuse: layered, non-destructive design — pending devices, quarantine instead of deletion (see §6) | Confirmed |
| D7 | Full legacy compat layer; new clean API (`/v5`) for new app builds | Confirmed |
| D8 | Backend is **API-only**; admin / reseller / customer UIs become separate SPAs, **built by another team** (contract-first: OpenAPI published before implementation) | Confirmed |
| D9 | Store stays external; contract preserved | Confirmed |
| D10 | Admins & resellers are **central identities**; resellers have **one wallet usable across all apps** | Confirmed |
| D11 | **Port all payment providers** but track them in a provider registry with usage metrics so unused ones can be removed later | Confirmed |
| D12 | Cutover tenant-by-tenant, documented as a runbook only | Confirmed |
| D13 | `NewUnifiedBackend/` (earlier attempt) is ignored | Confirmed |
| D14 | **Rebuild, don't copy** (2026-10-13): every feature is re-implemented cleanly from its intent, without old bugs. Only the wire format of non-updatable apps and the store contract are matched, inside thin adapters. Supersedes the phase-1 "copy quirks + `LEGACY-QUIRK` markers" approach in §8.0. See `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/TASKS.md`. | Confirmed |

### 3.1 Framework rationale (D4)

| | Express 5 | Fastify | NestJS (Fastify adapter) |
|---|---|---|---|
| Structure | none — we would reinvent it | plugin encapsulation | modules, DI, guards, interceptors, pipes |
| Throughput | lowest | ~2–3× Express | ≈ Fastify |
| Raw body / custom parsers (needed: HMAC is computed over the exact ciphertext string; obfuscated bodies) | manual | first-class | via Fastify |
| Testability | manual | good | excellent (DI, testing module) |
| Cost | — | architecture discipline is on us | boilerplate, learning curve |

Why NestJS+Fastify: the problem is "many interchangeable pieces behind stable contracts" — 4+ legacy wire schemes (→ one guard + one interceptor each, reused by every legacy route), 16 payment providers (→ one interface, 16 adapters), separate API and worker processes sharing the same modules, strict module boundaries to stop the "9k-line controller" pattern from returning.
**Trap to avoid:** NestJS request-scoped providers for tenancy (slow, cascades). Use `nestjs-cls` (AsyncLocalStorage) for the tenant context + a singleton connection registry.
Runner-up if NestJS is rejected: plain Fastify with enforced module conventions.

### 3.2 Redis rationale (D5)

- **What it fixes:** every per-worker in-memory state in the old code is broken under clustering — brute-force counters split across up to 24 workers, `captchaStore`, settings caches never invalidated on other workers, and every cron running once *per worker* (e.g. `removeOldDevices` ×24, currency delete-then-insert ×24 every 3 min).
- **What we use it for:** distributed rate limiting, short-lived caches (tenant config, settings, translations, hot device lookups), BullMQ job queues and repeatable jobs (single execution), distributed locks (wallet operations, migrations), pub/sub cache invalidation.
- **Cost:** one managed Redis (≈1 GB is enough), HA via the provider or Sentinel. Confined to `core/redis` + `jobs` + `abuse` modules.
- **Rules:** Redis is **never** the source of truth. Rate limiting fails *open* with a coarse in-process fallback if Redis is down; locks fail *closed*.
- **Why not Mongo-only:** under DDoS every request would write a counter document to Mongo — the database is exactly what the attack floods.

---

## 4. Target architecture

### 4.1 Processes

| Process | Role |
|---|---|
| `api` | Stateless HTTP (all interfaces), horizontally scalable, no cron |
| `worker` | BullMQ consumers + repeatable jobs (cleanup, currency, cache warmups, domain-migration evaluation, pending-device expiry reports, payment reconciliation) |
| `migrate` (CLI) | ETL from legacy DBs, verification reports, delta sync |

### 4.2 Request pipeline

```
Cloudflare (origin locked to CF) 
  → Fastify
    → request id + logger
    → tenant resolution (Host → central tenant registry, cached)  ── unknown host ⇒ 421/404, NEVER a default tenant
    → abuse gate (Redis rate limits per IP / subnet / ASN / tenant / endpoint class)
    → interface router
        ├─ /legacy compat routes (exact old paths)   → codec guard/interceptor → application service
        ├─ /store/* (old store paths kept)           → store key guard          → application service
        ├─ /v5/*   (new device API)                  → signed JWT               → application service
        ├─ /admin-api/*                              → admin JWT + RBAC         → application service
        ├─ /reseller-api/*                           → reseller JWT + RBAC      → application service
        └─ /customer-api/*                           → customer JWT             → application service
    → error filter (no stack/axios-config leaks)
```

Rules:
- Controllers are thin; **all business logic lives in application services** that know nothing about wire formats. A legacy route and a v5 route for the same action call the same service.
- Every DB access goes through the tenant-scoped repository obtained from the CLS context. No module may open a tenant connection directly.
- Every credential (session, JWT, device token v5, store key) carries a **tenant claim** checked against the resolved tenant.

### 4.3 Tenancy

- **Central registry** (`tenants` collection): slug, display name, status, hosts (exact match list — no substring matching), DB URI ref, per-tenant secrets (encrypted, see §4.6), feature flags, playlist-shaping profile, legacy quirk flags (e.g. `plainBodyAddRemove` for ibostb/macplayer), CORS origins, frontend URL, StarArcs app name.
- **Connection registry:** one pooled connection per tenant per process, created lazily with an in-flight promise cache (fixes cr-unified's duplicate-connection race), evicted on failure, health-checked.
- **Hardcoded `req.tenant === 'x'` branches** in the old code become **tenant config flags/profiles**, never slug checks.
- `ALLOW_TENANT_OVERRIDE` does not exist in production builds.

### 4.4 Proposed repository layout

```
src/
  main.api.ts / main.worker.ts / main.migrate.ts
  core/            config (zod-validated env), logger (pino), errors, cls context, mongo, redis, crypto (secrets vault), http client
  tenancy/         tenant registry, host resolver, connection registry
  modules/
    devices/         registration, pending devices, identity, recovery, MAC switch, parental pin
    licensing/       plans/status engine (trial/yearly/lifetime), activation commands, history
    playlists/       CRUD, shaping profiles (xc ↔ general), backup URLs
    domain-migrations/
    accounts/        customer accounts (cr User), subscriptions/plans
    resellers/       central reseller identities, hierarchy
    wallet/          central credit ledger (single wallet), codes, coupons
    payments/        provider interface + providers/*, webhooks, reconciliation, registry
    transfers/       license transfer, cross-app transfer, donor-equivalent lookups
    abuse/           rate limits, pending-device promotion rules, quarantine, Cloudflare client
    content/         CMS pages, news, FAQ, notifications, SEO
    i18n/            languages, words, translations
    app-updates/     AndroidApp, AppVersion, APK storage
    partners/        StarArcs, SportsDB mirror, Apple IAP verification
    media/           uploads (S3-compatible or local), validation
  interfaces/
    legacy/          codecs/ (envelope, aes-passphrase, hmac, xor-token, plain) + route families (tv, android-signed, roku, ios-v2/v3, android-v2/v3, v4-any-device, smart-tv, …)
    store/           store contract routes
    v5/              new device API
    admin/ reseller/ customer/
  jobs/
  migration/        extractors per source, transformers, loaders, verifiers
test/
  golden/           legacy test vectors and request/response fixtures generated from the old code
```

### 4.5 Cross-DB consistency (central wallet ↔ tenant devices)

Activation by a reseller touches the central wallet and a tenant DB. Use a **ledger + saga**:
1. Reserve credits in the central ledger (atomic conditional update, idempotency key).
2. Apply the activation in the tenant DB (idempotent by the same key).
3. Commit the reservation; on failure, compensate (release). A worker job sweeps stuck reservations.

The same pattern covers payments (provider event → transaction → activation) and cross-app transfers.

### 4.6 Secrets

- Platform secrets in env / secret manager, validated at boot (fail fast — the old apps silently ran with `undefined` keys, which even disabled the store-token check in bob).
- **Per-tenant secrets** (legacy AES passphrases, signing secrets, TOKEN_KEY, store key, payment provider credentials) stored **encrypted** in the central DB (envelope encryption with a KMS/master key), cached in memory, never returned by any API (old code leaked `paysky_secret_key` to every logged-in device).
- Legacy secrets keep their current values per tenant (clients ship them); new v5 secrets are fresh.

---

## 5. Target data model

Conventions: camelCase, real types (Date, Boolean, ObjectId, Decimal128 or integer minor units), explicit collection names, explicit indexes created by migrations (not `autoIndex`), `createdAt/updatedAt` everywhere, a `legacy` sub-document on migrated records (`{source, id, raw?}`) for traceability.

### 5.1 Central DB

| Collection | Purpose |
|---|---|
| `tenants` | Registry (see §4.3) |
| `tenantSecrets` | Encrypted per-tenant secrets |
| `staffUsers` | Platform admins and tenant admins (role + tenant grants), 2FA |
| `resellers` | Central reseller identities: email, password hash, parent (hierarchy), status, tenant permissions, branding (logo), `legacyRefs[]` (all old ids: ibo Admin `_id`, bob/cr Reseller `_id`, Admin.id numbers, store numeric ids) |
| `walletAccounts` / `walletLedger` | **Single wallet** per reseller (and per credit-buying customer); append-only ledger entries (purchase, reserve, commit, release, refund, adjustment, transfer-to-sub-reseller); balance = projection |
| `activationCodes` | Merged ibo ActivationCode + bob/cr ResellerCode (owner, durationMonths, credits, status, usedBy {tenant, deviceId, mac, ip, platform}, usedAt) |
| `coupons` / `couponRedemptions` | Coupon packs (owner email/reseller, maxUses, used) |
| `deviceRegistry` | Thin cross-tenant index: `{macAddress, tenantId, deviceId, status, expiresAt}` — replaces donor HTTP polling, powers cross-app transfer and store lookups |
| `licenseTransfers` | One row per transfer (source+target), replaces two per-side rows |
| `paymentProviders` | Provider registry: code, enabled tenants, usage counters, last success, health |
| `languages` / `translationKeys` / `translations` | Global i18n with optional per-tenant overrides |
| `countryCodes`, `coinList` | Global lookups |
| `domainMigrations` | Provider host moves (global evidence is more useful than per-tenant); admin approval state |
| `abuseIpReputation`, `abuseEvents` | Shared abuse intelligence across tenants |
| `auditLog` | Every admin/reseller/store mutation |

### 5.2 Tenant DB

| Collection | Purpose |
|---|---|
| `devices` | Activated / real devices (see 5.3) |
| `pendingDevices` | Unpromoted registrations, TTL (see §6) |
| `playlists` | `deviceId: ObjectId` **indexed** |
| `customers` | cr-style user accounts (+ ibo credit-buyer accounts) |
| `subscriptions` | Customer ↔ plan slots (replaces `User.plans[]` + `Device.plan_id` double bookkeeping) |
| `plans`, `packages` | Sellable items (merges ResellerPackage, CreditPackage, CreditPricePackage — `kind` enum) |
| `transactions` | Typed: `{provider, type, status, amountMinor, currency, deviceId?, customerId?, resellerId?, couponOrder?, providerRef, idempotencyKey, rawEvent}` — no more polymorphic `device_id` |
| `activationHistory` | Every licensing change with actor (admin/reseller/code/coupon/payment/store/transfer/recovery) |
| `tenantConfig` | One typed document (replaces key/value `settings`) |
| `contentPages`, `news`, `notifications` | CMS (one `contentPages` collection keyed by slug) |
| `contactMessages`, `captchas` (TTL), `authTokens` (TTL) | |
| `androidApps`, `appVersions` | App update metadata, per tenant as today |

### 5.3 Device model (key decisions)

```
{
  _id, macAddress (normalized: lowercase, colon-separated), appType (enum, lowercase), platform, appDeviceId,
  deviceKey, uid, parentPinHash,                      // pins hashed; legacy routes that must return a pin read a separate encrypted field
  license: { plan: 'trial'|'yearly'|'lifetime'|'plan', status: 'trial'|'active'|'expired'|'revoked',
             expiresAt: Date|null (null = lifetime), creditCount, multiActivate: Boolean,
             activatedBy: {type, id}, subscriptionId? },
  apiGeneration: 'legacy'|'v4'|'v5', versions: {...}, hostname, ip, lastSeenAt,
  recovery: {...}, switch: {...}, migration: {...}, flags: { quarantined, pendingDeletionAt },
  legacy: { source, id, isTrial, expireDate, resellerId, raw? }, createdAt, updatedAt
}
Indexes: unique {macAddress}*, unique sparse {appDeviceId}, {license.status, license.expiresAt}, {deviceKey}
```
\* **Decided:** a MAC address is unique within a tenant's database, regardless of app type. It is normalized before storage (lowercase, colon-separated) so `AA-BB-…`, `aa:bb:…` and `aabb…` cannot become three records. Uniqueness spans `devices` **and** `pendingDevices` (promotion moves a record, never duplicates it). The same MAC *may* exist in different tenants — that is how one customer uses two apps and how cross-app transfers work; the central `deviceRegistry` is keyed by `(macAddress, tenantId)`.

**Duplicate MACs found during migration** (caused by past race conditions and the MAC-only vs MAC+app_type lookup mismatch) are merged deterministically:
1. Group all records of a tenant by normalized MAC.
2. Survivor = the record with the best license (active lifetime > active yearly with latest expiry > active plan > trial > expired/revoked); tie → most recent activity, then oldest `_id`.
3. Playlists of all records are moved to the survivor and de-duplicated on a natural key (url+username+password / portal+stalker MAC / code).
4. Losers' ids are kept in `legacy.mergedFrom[]`; references to them (transactions, history, codes) are re-pointed to the survivor.
5. Every merge is listed in the migration report; groups where two records both hold a *paid* license with different expiries go to a **manual review queue** instead of being auto-merged.

**`is_trial` → license mapping** (derived from code across all three backends):

| Old `is_trial` | Meaning in code | New |
|---|---|---|
| 0 | new trial, or deactivated loser of a MAC switch | `plan=trial`, status by expiry (or `revoked` if `switched_to` set) |
| 1 | Roku/iOS trial, **or** deactivated (expiry = yesterday), **or** cr reseller-code activation < 500 months | needs context: `activatedBy`/history → `yearly`/`revoked`/`trial` (migration rule set per source) |
| 2 | lifetime (expiry = now + 5000 or 500 months, or `2438-07-06`) | `plan=lifetime`, `expiresAt=null` (keep original in `legacy.expireDate`); past-dated lifetime records follow each old backend's own interpretation — no logic change in phase 1 |
| 3 | one year | `plan=yearly`, `expiresAt` = date 23:59:59 in the agreed timezone |

Date strings exist in `Y-MM-DD`, `Y-M-D` (unpadded — Roku/iOS), ISO slices and free text; all parsed with explicit format lists, unparseable values flagged in the migration report.

### 5.4 Other mapping highlights

- **Resellers:** ibo `Admin(is_admin=0)` + bob/cr `Admin(is_admin=0)` + bob/cr `Reseller` + store numeric `reseller_id` → central `resellers` with `legacyRefs`. Merge across backends by verified email. Credits: ibo/bob/cr Admin credits are *computed* (`max_connections − Σ device.credit_count − Σ sub-reseller max`) → materialize an opening ledger balance per reseller at migration time.
- **Transactions:** split the polymorphic `device_id` (Device id / `{"email","count"}` JSON / `reseller/<email>/<n>` / `<adminId>_reseller` / User id) into typed refs; normalize the three `pay_time` formats; backfill currency per provider (PayPal/Stripe/Paymentwall EUR, Telr USD, EGP providers stored *unconverted* EUR amount → record original + flag).
- **Playlists:** coalesce `portal_fallback_address`/`fallback_portal_address`; `is_protected` mixed int/string → Boolean; drop orphans (report counts); encrypt IPTV passwords at rest (legacy responses decrypt).
- **Settings:** key/value rows → typed `tenantConfig`; duplicates resolved deterministically (most frequent value, tie → latest `_id`), every dropped duplicate reported; payment credentials → `tenantSecrets`.
- **Translations:** cast string ids, drop orphans (158 in bob), dedupe words across tenants.
- **Silently-dropped fields** in old code (`last_seen`, `version`, `status`, `email`, `previous_url`, `apiVersion` vs `api_version`, `transaction_type`/`credit_count` never written, …) become real fields only where the feature is actually wanted.

Full per-entity field matrices are produced in M1 and kept in `docs/migration/`.

---

## 6. Abuse, DDoS and fake-device flooding

Problem: massive DDoS plus DB flooding with fake devices. Today every unknown MAC writes a permanent `devices` row, then destructive jobs (IP-wide deletes of devices + playlists, permanent account-wide Cloudflare bans) clean up — hurting CGNAT users, deletable by a spoofed header, and racing across 24 workers.

Layers:

1. **Edge.** Origin accepts only Cloudflare (firewall allowlist or Cloudflare Tunnel + Authenticated Origin Pulls) → `cf-connecting-ip` / ASN headers become trustworthy (today they are spoofable). WAF rate-limit rules on registration/login paths per hostname. Scoped API token (not the global key), Cloudflare **IP Lists with expiry** instead of permanent user-level access rules.
2. **App rate limiting (Redis).** Sliding windows per IP, per /24 (IPv4) and /64 (IPv6), per ASN, per tenant, per endpoint class (registration ≪ playlist fetch). Tunable per tenant in `tenantConfig`.
3. **Cheap rejection.** Decode/validate envelope and MAC format before any DB access; reject impossible MACs, burst patterns (≥N MACs sharing a 9-char prefix from one subnet, sequential MACs), stale/unknown app versions.
4. **Pending devices (the main fix).** Unknown MAC → `pendingDevices` (tenant DB) — the response to the client is *identical* (device key, trial, demo playlist). Lookups (site login, store `validate-mac-address`, every app route) check both collections. Rules:
   - **Promotion** to `devices` (same `_id`, same device key) on **any** sign of a real user: playlist added (app/site/store); any activation (payment, reseller, code, coupon, admin, store); website login with the device key; recovery or MAC switch; solved v4 captcha; **a return visit on a different calendar day**.
   - **Expiry:** a pending device with none of these signals expires after **30 days** (per-tenant setting) via a TTL index — no deletion jobs.
   - **Trial history:** on expiry, a tiny record `{macAddress, appType, trialUsedAt}` is kept in `trialHistory` (TTL **1 year**, per-tenant setting). A returning MAC found there is re-created with an **already-expired trial**, never a fresh one — closing the "wait it out for a new trial" loophole. Note: such a user receives a new device key (acceptable: they never added a playlist or logged in).
   - Effect: fake devices clean themselves up, the main collection holds only real users, and no real user can tell pending devices exist.
5. **Quarantine, never delete.** Suspicious devices get `flags.quarantined` (not served, not counted), reviewed in admin; activated/paid devices are never auto-removed.
6. **Uniqueness.** Unique index on the device identity key ends duplicate-device races and the "remove duplicated MAC" tools.
7. **Attestation for new builds only (v5):** Play Integrity / App Attest, per-install keys, short-lived signed tokens. Legacy secrets are already extracted from APKs — legacy signatures are treated as noise, not authentication.
8. **Observability:** registrations/min per tenant & app type, promotion rate, top IPs/ASNs, alerting; admin dashboard for IP/ASN/device review and manual Cloudflare list management.

---

## 7. Findings register (what we are fixing)

Summary of a code audit of the three backends and a sample database. Below: the classes of problems the new backend must eliminate by design.

### 7.1 Urgent — exploitable in production **today** (fixing them in the old backends is out of scope; the new backend must not reproduce any of them)

| # | Issue | Where |
|---|---|---|
| U1 | Cloudflare **global API key + account email hardcoded** in source | ibo & bob `server.js` |
| U2 | Real secrets committed: cr `.env.sample` (session/JWT/AES/signing/store/token/platform/SMTP), Gmail password (bob `utils/email.js`), live payment keys as defaults (ibo/bob `server.js`), Paymob/Paymentwall/reCAPTCHA keys in controllers | all |
| U3 | **Unauthenticated destructive admin GETs** (`getPlaylistsFromPhp` wipes Devices/Playlists/Admins/Transactions; `clearLanguageWord`; `getResellersFromPHP`; `removeDuplicatedMacAddress` memory dump) | all three `routes/admin.js` (before auth middleware) |
| U4 | **Free activations**: unsigned webhooks (Paymob, Opay, Telr callback, Cashcall, Cowpay), crypto redirect trusts `?transaction_id=`, Paysky verification commented out (replayable for credits), MDLS HMAC computed but never compared (cr), Paymentwall validates its own signature, `/api/app_purchase` trusts the client, PayPal capture doesn't check status/amount | all |
| U5 | **NoSQL operator injection** (`device_key[$ne]=x` logs into any MAC; coupon/code lookups) | all |
| U6 | Unauthenticated data dumps: `GET /api/get-samsung-active-users` (cr, all paid Samsung devices + IPTV credentials), `/get_ip_request_count`, `/get_non_mac_addresses`, `/reseller/activation-codes` (all resellers' codes) | cr, ibo, bob |
| U7 | `GET /test-block-ip/:ip` — anyone can make the server block any IP in Cloudflare | ibo |
| U8 | Reseller privilege escalation: `is_admin=0` accounts reach activate/update-any-device; ibo resellers can edit/delete **any** admin incl. the main one | all |
| U9 | ibo `deleteCode` refunds then crashes before deleting (Mongoose 7 `.remove()`): unlimited credit refunds | ibo |
| U10 | Unhandled rejections crash workers (~24 bad requests take bob down; cr primary exits after 12 crashes/min) | all |

### 7.2 Security classes eliminated by design

- No unauthenticated maintenance/test routes (no route ships without an explicit auth decorator; CI check).
- Input validation on every route (zod/TypeBox) + `sanitizeFilter` + typed repositories → no operator injection, no `$regex` from input (escape or prefix index).
- Ownership checks centralized (policy layer) → no playlist/device/code IDORs, no `code_id` body overrides.
- Signed, expiring, tenant-bound tokens for everything new; legacy XOR token accepted **only** on legacy routes and only for that tenant (it's forgeable — repeating-key XOR of known plaintext).
- Payment webhooks: signature verification + server-to-server confirmation + amount/currency check + idempotency, per provider.
- Atomic wallet/coupon/code operations (conditional updates + ledger) → no double-spend races, no negative-credit minting.
- CSRF irrelevant for JWT SPAs; cookies (if any) `secure/httpOnly/sameSite`; admin 2FA, lockout, uniform login errors.
- Uploads: allowlisted types, size limits, random names, object storage, no path built from input.
- No secrets in responses or logs (old code logs plaintext admin passwords, returns axios errors with Basic auth headers, returns `paysky_secret_key`).
- SSRF guard for any server-side fetch (`/frontend/check-playlist` today fetches arbitrary URLs).
- Domain-migration learning only counts activated, distinct-IP devices; activation requires admin approval (today 3 cheap fake device ids can redirect other users' players — with their IPTV credentials — to an attacker host).
- Exact host → tenant mapping; unknown hosts rejected; tenant claim in all credentials.

### 7.3 Bug classes eliminated by design

- String dates compared lexically (and written unpadded `Y-M-D`), server-local time mixed with UTC → real `Date` in UTC, one timezone policy.
- `removeOldDevices` orphaning playlists (wrong key) in all three → FK-correct cleanup jobs + orphan report.
- Per-worker crons/caches/counters → BullMQ + Redis.
- Settings delete-then-insert races and duplicate keys → typed single document with versioned updates.
- Mongoose 6/7 API breakage (`findByIdAndRemove(cb)`, `doc.update()`, `ObjectID`) → current driver, typed repos, tests.
- Silently-dropped writes (strict mode) → schema-first types shared by services and repositories; tests on persisted shape.
- Hung requests (missing `return`/`res.json`, empty catch) → async handlers with a global error filter.
- Duplicated logic (3 playlist parsers, 8 playlist-CRUD variants, ~7 copies of payment success logic) → single services.

### 7.4 Dead code not to port (non-exhaustive)

**Porting policy: when in doubt, keep it working as-is.** Any endpoint whose usage we are unsure about is ported with its current behaviour; cleanup happens later, against the real frontends/apps, after the new backend is done. Only routes that are certainly not client-facing are dropped: test/debug routes, one-off maintenance/migration routes, unreachable or commented-out routes, and admin EJS pages (replaced by the admin API).

Examples of what is not ported: PHP import tools; `activateOpayDevices` (~770 lines of hardcoded transaction ids, in all three); test routes and pages (`/email-test`, `/test`, `*_test` pages, QEMU/Vidaa test-MAC wipes); 8 hardcoded "store review" override blocks in cr; superseded Android v4 handlers; `SuspectDevice` flow (replaced by pending/quarantine); `PasswordResetToken`, `ActivationCodePageContent`, `CountryCode` writers; `iboplayer/` cPanel leftovers; unused deps (`install`, `npm`, `path`, `pug`, `mollie`, …). Every legacy route is classified in M1 as **port / port-with-fix / drop** — nothing is dropped without traffic evidence.

---

## 8. Milestones

### 8.0 Two phases

> **Superseded by D14.** There is no quirk-copying phase: features are rebuilt clean from the start; only wire formats are matched. The execution plan is `docs/TASKS.md`. The text below is kept for history.

**Phase 1 — Faithful clean rebuild (M1–M13).** Rebuild the backend with the new architecture and clean code while keeping **every client-visible contract exactly as it is today**:
- *Kept exactly:* paths, methods, request formats, response formats and outputs — including odd ones clients may depend on (literal `"undefined"` in error envelopes, HTTP 302 on store errors, `'ascii'` decoding, …). Endpoints we're unsure about are kept.
- *Not reproduced:* hangs, worker crashes, race conditions and corrupted writes (where old code hung or crashed, the new code returns the old error format).
- *Architecture is phase 1:* central DB, typed schema, unique MAC, Redis/BullMQ, pending devices — internal changes clients cannot see.
- *Known bugs and security gaps copied on purpose* are marked in code with `// LEGACY-QUIRK(<inventory id>): <what and why>` so phase 2 can find every one of them.
- *Never rebuilt:* the unauthenticated one-off maintenance tools (PHP import/wipe routes, `clearLanguageWord`, `removeDuplicatedMacAddress`, `saveCountryCode`) and developer test routes (`/email-test`, `/test`, `*-test` pages, test-MAC wipes).

**Phase 2 — Fixes & cleanup (mandatory before go-live).** Work through every `LEGACY-QUIRK` marker and every `port-with-fix` verdict in `docs/inventory/`: payment verification, ownership checks, input validation, idempotency, atomic updates; then remove dead endpoints, validated against the real apps/frontends. Cutover (M14) may only start after phase 2 is complete.

> Where milestone texts below mention fixes (e.g. "Fixes:" lines, M8 webhook verification), those fixes belong to **phase 2** unless they are architectural.

Format per milestone: **Goal · Scope · Deliverables · Exit criteria · Blockers/dependencies · Gains · Fixes.**

### M1 — Discovery completion & contract capture

- **Goal:** turn this plan's assumptions into evidence.
- **Scope:**
  - **Legacy endpoint catalog** (one row per route × backend), derived from the code: method, path, wire scheme, request/response schema (incl. exact error literals), auth, verdict *port / port-with-fix / drop*.
  - **Legacy encoding spec + test vectors:** extract the encoding functions (Appendix A) from the old code into a standalone reference implementation and generate deterministic input→output vectors (fake keys only) — the byte-compatibility test oracle.
  - **Data profiler:** a read-only, privacy-masking tool that reports the shape of an old database (types, formats, orphans, duplicates), run on the local sample databases.
  - **Field mappings:** old field → new field + transformation rule, per entity.
  - **Payment callback contracts:** the exact payload each provider sends, from the code.
- **Deliverables:** `docs/inventory/endpoints-*.md`, `docs/contracts/wire-protocols.md` + test vectors, profiler tool + `docs/data-profiles/`, `docs/migration/field-mappings/*.md`, `docs/inventory/payments.md`.
- **Exit:** every legacy route has a verdict and a written contract; every entity has a reviewed field mapping.
- **Blockers:** none — everything comes from the three codebases and local sample data.
- **Gains:** no guesswork on what old clients need.

### M2 — Foundation

- **Goal:** a production-grade empty service.
- **Scope:** NestJS+Fastify skeleton, TS strict, ESLint/Prettier, zod env config (fail fast), pino logging with request ids, global error filter, health/readiness, OpenAPI generation for new APIs, Docker images, CI (lint, typecheck, unit, integration with Mongo + Redis containers), Mongo + Redis core modules, BullMQ worker entrypoint, secrets vault abstraction, migration-framework for indexes/schema changes.
- **Exit:** CI green; `api` and `worker` run locally against Dockerized MongoDB + Redis.
- **Gains:** guardrails that prevent regressions into the old patterns.

### M3 — Tenancy & central platform

- **Goal:** host → tenant → connection, with central registry and secrets.
- **Scope:** `tenants`, `tenantSecrets` (envelope-encrypted), exact host resolver (all legacy hostnames incl. ibo's 7 domains and cr's `LEGACY_HOST_RULES`), connection registry, CLS tenant context, per-tenant config document, cache with Redis invalidation, tenant provisioning CLI.
- **Exit:** integration tests prove a request on host A can never read/write tenant B, unknown hosts are rejected, credentials with a wrong tenant claim are rejected.
- **Note:** iboplayer stays one tenant with its 7 domains, exactly as today. Tenant lists and hostnames are data, not blockers.
- **Fixes:** cr substring host matching, default-to-cr7 fallback, `ALLOW_TENANT_OVERRIDE`, duplicate-connection race, cross-tenant sessions.

### M4 — Core domain: devices, licensing, playlists, content, i18n

- **Goal:** the business core, transport-agnostic.
- **Scope:** device registration (incl. pending devices), license engine (trial/yearly/lifetime/plan, extend/revoke/stack rules reproduced from the old code and written down as specs), activation history, MAC switch, recovery codes, parental pin, playlists CRUD + shaping profiles (xc ↔ general, raw, backup URLs), domain-migration learning (hardened), content pages/news/notifications, i18n with tenant overrides, app updates (AndroidApp/AppVersion), typed tenant config.
- **Exit:** service-level test suite covering every licensing rule found in the audits; playlist shaping reproduces the old parsers' test vectors exactly, quirks included.
- **Gains:** one implementation instead of ~8 playlist CRUD variants and 4 URL parsers.
- **Fixes:** is_trial overloading, string dates, double bookkeeping, orphan playlists, duplicate MACs.

### M5 — Identity, resellers & central wallet

- **Goal:** central identities with RBAC and a single reseller wallet.
- **Scope:** staff users (platform/tenant admins, roles, 2FA), central resellers with hierarchy (sub-resellers), wallet ledger + saga for cross-DB activation, activation codes (merged ibo ActivationCode + ResellerCode), coupons, packages, customer accounts & subscriptions (cr User/Plans, password reset/verification), audit log.
- **Exit:** concurrency tests prove no double-spend; every credit movement is a ledger entry; ownership policies tested.
- **Gains:** one reseller system instead of 3–4 per backend.
- **Fixes:** unbounded/negative credits, IDOR on codes and sub-resellers, non-atomic redemption, codes never marked used.

### M6 — Legacy compatibility layer

- **Goal:** every legacy client keeps working unchanged.
- **Scope:** codecs (obfuscated envelope incl. `'ascii'` decode and suffix locator, CryptoJS passphrase AES ×4 key variants with the 512-char limit, HMAC-SHA256 request signatures, XOR device token, TV v3 `u_id` HMAC-SHA1, static `TV_KEY_V4`/`Android_KEY_V4`, plain-body quirk for ibostb/macplayer); route families: legacy TV `playlist_info`/`playlist_information` (+ signed Android/TV v3/Android v3, `/Mxcvfghytrhjsjj/` alias), manage add/update/delete, `update_playlist`, `check-activation-code`, `changeParentPin`, Roku, iOS v2/v3, Android v2/v3, Smart TV `device_info`, TV v4, V4 any-device (13 app types incl. recaptcha/device_login/check_update/device_info/manage/apply_recovery/device/add/sportsdb/apple_purchase), recovery v3, `/app/version`, translations/languages, `app_info`. Per-tenant response shaping profiles.
- **Exit:** 100% of the M1 test vectors and endpoint contracts pass; response-time p95 ≤ old system.
- **Gains:** old apps decoupled from old code; legacy surface frozen and isolated (can be retired route by route later).
- **Fixes:** playlist hijack via `update_playlist`, `reset_uid` takeover, `changeParentPin` by MAC only, `playlist_info` bypassing the v4 lock — *where fixing does not change the wire contract* (decision per route in M1).

### M7 — Store & partner integrations

- **Goal:** the store and partners see no change; internal flows replace HTTP polling.
- **Scope:** store contract routes (all `STORE_API_KEY` and `PLATFORM_KEY` endpoints), license transfer (single central record, same payload protocol), cross-app transfer as an internal operation, donor migration replaced by `deviceRegistry` lookups (behaviour flag per tenant), bulk domain update (escaped, scoped), StarArcs relay, SportsDB mirror, Apple IAP verification (add x5c chain verification), MDLS/MimoStore orders.
- **Exit:** contract tests derived from the M1 inventory pass for every store and partner route.
- **Fixes:** store-token bypass when the env var is unset, unescaped `$regex` in domain updates, full-device-doc leaks in `validate-mac-address` (only if the store doesn't need those fields).

### M8 — Payments

- **Goal:** all providers ported behind one interface, all confirmations verified.
- **Scope:** `PaymentProvider` interface (create, verifyWebhook, confirmServerSide, refund?), adapters: PayPal (device + reseller), Stripe, Paymob, Paysky, Opay, Opay1, Telr, PayEG, Geidea, Cowpay, Cashcall, CoinPayments, Paymentwall, MDLS/MimoStore, Apple IAP, Google Play (replace unverified `app_purchase`/`google_pay` — legacy route keeps its shape but requires verification or is disabled per tenant), Mollie (dependency only today — confirm). Webhook endpoints at the old paths where providers are configured with them. Idempotency, amount/currency checks, reconciliation job, provider registry with usage metrics, currency conversion service (one job, not 24).
- **Exit:** every provider ported behind the interface with its current behaviour, covered by contract tests. (Verification of every confirmation is phase 2.)
- **Gains:** revenue integrity; one place to add/remove providers.
- **Fixes:** all of U4, Paymob `amount_cents ×1e6`, Telr USD/AED mislabel, PayEG forced live, Stripe never activating, inconsistent lifetime durations (500 vs 5000 months).

### M9 — Abuse protection & edge

- **Goal:** survive DDoS and fake-device floods without hurting real users.
- **Scope:** everything in §6: origin lock runbook, Cloudflare scoped token + IP Lists client, Redis rate-limit policies, MAC/burst heuristics, pending-device promotion rules, quarantine, admin review APIs, metrics/alerts, load and flood test harness.
- **Exit:** flood simulation (e.g. 100k fake registrations/hour from a botnet-like IP distribution) leaves `devices` untouched and p95 latency for real clients within SLO.
- **Blockers:** Cloudflare plan features (WAF rate limiting, Lists).
- **Fixes:** destructive IP-wide deletions, permanent bans, spoofable IP/ASN headers, per-worker counters.

### M10 — Admin, reseller & customer APIs

- **Goal:** REST APIs for the new SPAs (UIs are separate projects).
- **Scope:** admin (tenants, devices, playlists, licensing actions, resellers/wallet, codes/coupons, packages/plans, transactions, payment settings, content, i18n, app updates, abuse review, domain-migration approvals, audit log, exports), reseller (activate, codes, sub-resellers, wallet, activity, branding, notifications), customer (device login, playlists, payments, account, plans, recovery, MAC switch).
- **Exit:** OpenAPI published; RBAC matrix tested; SPA teams unblocked.
- **Gains:** one multi-tenant admin instead of N copies of EJS panels with stored XSS and no CSRF.

### M11 — Jobs & operations

- **Goal:** all background work single-run, observable, idempotent.
- **Scope:** expiry/cleanup (correct FKs), pending-device expiry metrics, currency rates, cache warmups, domain-migration evaluation, payment reconciliation, wallet saga sweeper, recovery `pendingDeletion` purge (missing today), scheduled reports.
- **Exit:** every job has metrics, alerts, a dry-run mode and runs exactly once per schedule.

### M12 — Data migration tooling

- **Goal:** deterministic, re-runnable ETL from every old DB into central + tenant DBs.
- **Scope:** extractors (ibo, bob, each cr tenant), transformers implementing §5 mappings, loaders with id maps (old `_id` → new `_id`, kept in `legacy`), index builders, **verification reports** (counts in/out, rejected rows with reasons, orphan counts, duplicate-MAC merges, unparseable dates, settings conflicts), reseller identity merge with manual-review queue, opening wallet balances, `deviceRegistry` build, delta/incremental sync for cutover windows.
- **Exit:** full dry-run on the local sample databases; reports reviewed; re-running is a no-op. (Dry-runs on production copies are part of cutover preparation.)
- **Depends on:** M1 field mappings.
- **Note:** can start early (after M4 entities stabilize) — running it against real data is the best validator of the schema.

### M13 — Hardening, performance & security review

- **Goal:** release readiness.
- **Scope:** load tests at peak × 3, chaos (Redis/Mongo/tenant DB outage behaviour), external security review / pentest on staging, dependency audit, backup/restore drills, runbooks, SLOs and dashboards.
- **Exit:** sign-off from security review; SLOs met.

### M14 — Cutover runbook *(written only; executed by another team)*

- **Goal:** a tested plan to switch tenant by tenant with rollback.
- **Scope:** order (proposal: smallest cr tenant → remaining cr tenants → bob → ibo), pre-checks, delta sync, DNS/Cloudflare switch per hostname, store reconfiguration, verification queries, rollback procedure (old backend kept warm read-only until sign-off), comms.
- **Exit:** runbook rehearsed end-to-end on staging with a production copy.

### Milestone dependency overview

```
M1 ─┬─> M2 ─> M3 ─> M4 ─┬─> M5 ─┬─> M7 ─> M8
    │                   ├─> M6 ─┘          │
    │                   └─> M12 (dry runs, iterative)
    │                   M9 (after M3, before M13)
    │                   M10 (after M5)
    │                   M11 (alongside M4–M8)
    └────────────────────────────────────────> M13 ─> M14
```

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Undocumented client behaviour (old apps parse quirks we don't know) | Broken apps in the field, unfixable | Contracts and test vectors taken directly from the old code (M1), byte-compat tests, per-route canary during cutover |
| Legacy secrets are extracted from APKs | Attackers can always speak legacy protocols | Treat legacy routes as low-trust; rely on rate limits, pending devices, ownership rules; v5 for new builds |
| Local data is only a sample of production | Wrong mappings, data loss | Migration verification reports; production dry-run as part of cutover preparation |
| Cross-DB consistency (central wallet ↔ tenant DB) | Credit loss/duplication | Ledger + saga + idempotency + sweeper job |
| Reseller identity merge across backends | Account takeover or credit mix-ups | Merge only on verified email, manual review queue, audit log |
| Scope creep (16 providers, ~200 legacy routes) | Delay | Traffic-based verdicts in M1; registry to retire unused providers |
| Old backends keep changing during the rebuild | Drift | Freeze legacy features; any change also lands as a test vector in `test/golden` |
| DDoS during cutover | Outage | M9 complete before any tenant cutover |

---

## 10. Appendices

### Appendix A — Legacy wire protocols (must be reproduced exactly)

1. **Obfuscated envelope** (no secret). Alphabet `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890` (`'1'`=52 … `'0'`=61; ibo's decode map omits `'1'` and `'0'`).
   - Request `{data}`: `A[p] + A[n] + b64[0:p] + key(n chars) + b64[p:]`, `b64 = base64(JSON)`; server decodes base64 with **`'ascii'`** (high bit stripped).
   - Response `{data}`: `b64utf8[0:q] + requestKey + b64utf8[q:] + A[q] + requestLenChar` with `q` random in `[0, min(50, len(JSON)-1)]` — locator chars **appended**. Failed decodes echo the literal `"undefined"`.
2. **CryptoJS passphrase AES**: OpenSSL `Salted__` format, EVP_BytesToKey (MD5), AES-256-CBC, base64; inputs > 512 chars rejected. Key variants: old (`ANDROID_AES_SECRET`), V2/new (`ANDROID_AES_NEW_SECRET`), V3 TV (`TV_AES_NEW_SECRET`), V3 Android (`ANDROID_V3_AES_NEW_SECRET`); which key encrypts which response differs per route (e.g. iOS branch and `check_active_status` always use the old key).
3. **Request signatures**: `base64(HMAC-SHA256(secret, dataCiphertextString)).trim()` compared to `signature` — secrets `ANDROID_SIGNING_SECRET`, `ANDROID_V3_SIGNING_SECRET`, `TV_SIGNING_SECRET`. TV v3 identity: `u_id == base64(HMAC-SHA1(TV_SIGNING_SECRET, lower(mac) + TV_AES_NEW_SECRET))`.
4. **XOR device token** (Roku, iOS v2/v3, Android v2/v3, V4): `base64(utf8(xor(base64("<deviceId>,<mac>"), TOKEN_KEY)))`; raw in `Authorization` (Roku/iOS) or `Bearer` (V4). V4 also checks route app type and body MAC.
5. **Static keys**: `TV_KEY_V4`, `Android_KEY_V4` (exact casing), `PLATFORM_KEY`, store `token` header.
6. **Response shaping**: `parseM3uUrl` (get.php → xc `{url base + "/", username, password, origin_type, origin_url}`), `IboParseGeneralUrl` (reverse), `rokuParseM3uUrl`, raw for Android `44*`/mac/ibostb, `force_xc`, `backup_urls[]` (≤8), Roku/iOS envelope `{error, message, message2:{token, device{…}, playlists}, status}`, legacy `{data, languages}`.
7. **Captchas**: svg-captcha settings per route (4-char V4, 2-char web), hand-built SVG for UID recovery.

### Appendix B — Payment provider registry (initial)

| Provider | Present in | Confirmation today | BOB volume (sample) |
|---|---|---|---|
| PayPal (device / reseller) | all | capture without status/amount check | 3,187 |
| Paysky | all | **unverified** | 7,667 |
| Opay / Opay1 | all | **unsigned callback** | 6,942 / 62 |
| App purchase (legacy) | all | **trusts client** | 6,924 |
| Paymob | all | **unsigned webhook** | — |
| Stripe | all | broken (never activates) | — |
| CoinPayments | all | IPN HMAC (ibo/bob), redirect unverified | — |
| Paymentwall | all | self-validated (broken) | — |
| MDLS / MimoStore | all | HMAC (ibo/bob), **not compared** (cr) | — |
| Telr | ibo, bob | auth re-query OK, callback unsigned, not idempotent | — |
| PayEG | ibo, bob | HMAC (hardcoded key in bob) | — |
| Geidea | ibo, bob | HMAC | 1 |
| Cowpay | ibo, bob | unsigned | — |
| Cashcall | bob | trusts `?success=true` | 3 |
| Apple IAP | cr | server API, bundle/product/revocation checks, idempotent | — |
| Google Pay | ibo, bob | stub | — |
| Mollie | deps only | none | — |


### Appendix C — Settings keys (to map into `tenantConfig` / `tenantSecrets`)

Groups found across the three backends (full key-by-key mapping produced in M1): pricing (`price`, `main_currency`, `eur_to_egp`, `currency`, `egp_currency_converter_api_key`), trial (`trial_days`), payment visibility (`show_*`), provider credentials (`paypal_*`, `stripe_*`, `paymob_*`, `paysky_*`, `opay_*`, `opay1_*`, `telr_*`, `payeg_mode`, `geidea_*`, `cowpay_*`, `cashcall_*`, `crypto_*`, `mdls_*`, `paymentwall_*`), app (`demo_url`, `themes`, `apk_url`, `android_version_code`, `android_update_*`, `current_android_version`, `update_android_version`), TV test flags (`samsung_test`, `lg_test`, `*_prev_version`), ibo per-domain toggles (`*_android_enabled`, `enable_old_only_samsung`), notifications (`real_time_notification`, `notification_interval`), contact/social, SEO (`{page}_meta_{title,keyword,content}`), security (`rasp_enforce`), plus seeder-only keys nobody reads.
