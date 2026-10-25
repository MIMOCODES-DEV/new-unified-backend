# Task Backlog

> Team: 2 developers — **Dev A** ("device side") and **Dev B** ("money & people side"). Assign names on Thursday.
> Kickoff: **Thursday 2026-10-15**. Sprints: 2 weeks.
> Size: **S** ≤ 1 day · **M** 2–3 days · **L** 4–5 days (split before starting).
> Rule: a task is done when code + tests + docs are merged with green CI and reviewed by the other dev.
> Features referenced below are listed in `docs/FEATURES.md`; layering rules in `docs/ARCHITECTURE.md`.

## Ownership split

| Dev A — device side | Dev B — money & people side |
|---|---|
| Tenancy, devices, licensing, playlists, recovery, MAC switch, domain migrations | Staff/admin identity, resellers, wallet, codes, coupons, customers/plans |
| Legacy protocol codecs & route families | Payments (all providers), webhooks |
| Store API, transfers, partners (StarArcs, SportsDB) | Content, i18n, app updates |
| Abuse protection | Admin / reseller / customer APIs |
| Migration ETL for device-side entities | Migration ETL for money/people entities |

Shared: SETUP, contract capture, hardening, runbook. Both review each other's PRs.

**Frontends:** all UIs (admin, reseller, customer website) are built by **another team** against our APIs. The backend serves no pages. That team depends on us, so API contracts are agreed and published **before** implementation (see `FE-*` tasks). No tenant can be switched to the new backend until its frontends are ready.

---

## Sprint 0 — Kickoff (Thu 15 Oct → end of next week)

### SETUP — project foundation
| ID | Task | Size | Owner |
|---|---|---|---|
| SET-01 | Review & approve ARCHITECTURE.md; settle the decisions in its §9; write ADR-0001..000N | S | A+B |
| SET-02 | Init repo: NestJS 11 + Fastify, pnpm, TS strict, folder layout from ARCHITECTURE §4, 3 entrypoints (api/worker/cli) | M | A |
| SET-03 | Tooling: ESLint (+ boundaries rules for layers), Prettier, Husky, lint-staged, commitlint, editorconfig | S | B |
| SET-04 | `docker-compose.yml` (Mongo replica set, Redis), `.env.example`, zod env config (fail fast) | S | B |
| SET-05 | Logger (pino, request id, redaction), global exception filter, `DomainError` base, health/readiness endpoints | M | A |
| SET-06 | Mongo module: central client + tenant connection registry skeleton, migrations runner for indexes | M | A |
| SET-07 | Redis module, BullMQ queue + worker entrypoint with one sample repeatable job, distributed lock helper | M | B |
| SET-08 | Test setup: Vitest, Testcontainers (Mongo/Redis), example unit + integration test, coverage | S | B |
| SET-09 | CI pipeline: install, lint, typecheck, test, build Docker image | S | B |
| SET-10 | Shared kernel: `Result`, `Clock`, `Money`, `MacAddress` VO, pagination, auth decorators (`@Public` etc.) + "no undecorated route" test | M | A |
| SET-11 | CONTRIBUTING.md: branching, PR rules, module template (copyable `modules/_template`) | S | A |

**Exit:** `pnpm dev:api` and `pnpm dev:worker` run against Docker Mongo + Redis; CI green; a sample module shows every layer.

### CAP — legacy contract capture (runs in parallel, feeds all legacy work)
| ID | Task | Size | Owner |
|---|---|---|---|
| CAP-01 | Run the 3 old backends locally with sample DBs | S | A |
| CAP-02 | Endpoint catalogue generator: script that parses old `routes/*.js` → `docs/inventory/endpoints.md` (method, path, backend, handler, auth) + verdict column (rebuild / drop) | M | A |
| CAP-03 | Codec reference vectors: extract envelope, AES passphrase (4 key variants), HMAC, XOR token, TV v3 `u_id` into a standalone script; generate input→output vectors with fake keys → `test/fixtures/legacy/codecs/` | M | A |
| CAP-04 | Record request/response fixtures for every device-API family against the running old backends (recording proxy) → `test/fixtures/legacy/<family>/` | L | A |
| CAP-05 | Store API + payment callback contracts (payloads, headers, responses) → `docs/inventory/store.md`, `payments.md` | M | B |
| CAP-06 | Data profiler (read-only, masked) over the sample DBs → `docs/data-profiles/` | M | B |

### FE — frontend team coordination (contract-first)
| ID | Task | Size | Owner |
|---|---|---|---|
| FE-01 | Kickoff with the frontend team: share FEATURES.md, agree API style (REST, error format, pagination, auth flow, i18n), point of contact | S | B |
| FE-02 | Draft OpenAPI for the **unified customer API** (one API for every brand's site): device session, user accounts + plans, playlists (incl. QR / MAC-only add), device verify, recovery, payments per tenant config — union of ibo/bob/cr website features (FEATURES §6, inventory/client-usage.md) | M | B |
| FE-03 | Draft OpenAPI for admin + reseller APIs | M | B |
| FE-04 | Mock server from OpenAPI (e.g. Prism) so the frontend team can start before endpoints exist | S | B |
| FE-05 | Staging environment the frontend team can call (seeded sample tenant) — by end of Sprint 4 | S | A |

---

## Sprint 1–2 — Platform & core domain

### TEN — tenancy
| ID | Task | Size | Owner |
|---|---|---|---|
| TEN-01 | `tenants` collection + repository + zod schema (hosts, flags, profiles) | M | A |
| TEN-02 | Host resolver (exact match, Redis cache, 421 on unknown) + CLS context | M | A |
| TEN-03 | Tenant connection registry (lazy, in-flight cache, eviction, health) | M | A |
| TEN-04 | `tenantSecrets` with envelope encryption (master key from env/KMS) + cache | M | B |
| TEN-05 | Typed `tenantConfig` document + cache + pub/sub invalidation | M | B |
| TEN-06 | CLI: provision tenant, add host, set secret | S | B |
| TEN-07 | Isolation test suite: host A can't read/write tenant B; token with wrong `tid` rejected | S | A |

### DEV — devices & licensing
| ID | Task | Size | Owner |
|---|---|---|---|
| DEV-01 | Device entity + License VO (trial/yearly/lifetime/plan × trial/active/expired/revoked) with rules: extend, revoke, stack, multi-activate; spec written as tests | L | A |
| DEV-02 | Device repository (unique normalized MAC, `state` pending/active/quarantined, partial TTL) + index migration | M | A |
| DEV-03 | Use case: register-or-get device (trial days from config, device key, `app_device_id` random MAC, wrong-app_type adoption) | M | A |
| DEV-04 | Pending → active promotion rules + `trialHistory` | M | A |
| DEV-10 | Fallback MACs (`52:54:00:12:34:57` BobPlayer, `…:59` CRPlayer, Windows/no-MAC TVs): treat as "no MAC", identify by `app_device_id`/u_id — never one shared record | M | A |
| DEV-05 | Activation history (every license change with actor) | S | A |
| DEV-06 | `u_id` identity + captcha service (registration + uid-recovery captchas, TTL) | M | A |
| DEV-07 | Device key regenerate, parent PIN (hashed) set/change | S | A |
| DEV-08 | MAC switch use case | M | A |
| DEV-09 | Recovery code: generate (activated only, 30 min) + apply (old MAC pending deletion) | M | A |

### PL — playlists
| ID | Task | Size | Owner |
|---|---|---|---|
| PL-01 | Playlist entity (general / xtream / stalker / code), PIN protection, provider branding; repository with indexed `deviceId` | M | A |
| PL-02 | Use cases: add / update / delete / bulk upsert / list (with PIN) | M | A |
| PL-03 | Shaping profiles: xtream-parsed, general, raw — one URL parser module with tests | M | A |
| PL-04 | Backup DNS → `backupUrls[]` | S | A |
| PL-05 | Domain-migration learning (distinct activated devices, admin approval) + resolver | L | A |
| PL-06 | Bulk provider domain rewrite + count (escaped, scoped) | S | A |

### CNT — content, i18n, app updates (Dev B while identity is designed)
| ID | Task | Size | Owner |
|---|---|---|---|
| CNT-01 | i18n: languages, translation keys, translations (global + tenant override), cached bundle for apps | M | B |
| CNT-02 | Content pages (terms, privacy, activation, reseller), news, FAQ, SEO meta, contact/social | M | B |
| CNT-03 | Notifications (global / per reseller), themes, demo URL, `app_info` branding → tenant config | S | B |
| CNT-04 | App updates: AndroidApp per `package_id`, AppVersion, update settings | S | B |
| CNT-05 | Contact messages (submit + inbox) | S | B |

---

## Sprint 3–4 — Identity, money foundation, legacy protocols

### IDN — identity, resellers, wallet
| ID | Task | Size | Owner |
|---|---|---|---|
| IDN-01 | Staff users: platform/tenant admins, roles, JWT + refresh, 2FA (TOTP), lockout, audit log | L | B |
| IDN-02 | Central resellers: identity, hierarchy (sub-resellers), tenant permissions, branding (logo/notification) | M | B |
| IDN-03 | Wallet: accounts + append-only ledger, balance projection, reserve/commit/release with idempotency + lock | L | B |
| IDN-04 | Saga: reseller activates a device (central wallet ↔ tenant DB) + sweeper job | M | B |
| IDN-05 | Activation codes (merged ActivationCode/ResellerCode): create, list, delete-with-refund (atomic), redeem | M | B |
| IDN-06 | Coupons: packs (count/used), redeem atomically, activity | M | B |
| IDN-07 | Packages (reseller / credit / credit-price) + pricing rule (1 credit = 1 year, 2 = lifetime) in config | S | B |
| IDN-08 | Customers (cr accounts): signup, verify email, login, reset/change password; email sender port | M | B |
| IDN-09 | Plans & subscriptions: buy plan, assign/remove/select device, rename device | M | B |

### LEG — legacy protocol adapters (thin; call the use cases above)
| ID | Task | Size | Owner |
|---|---|---|---|
| LEG-01 | Codecs: envelope, AES passphrase (4 key variants, 512 limit), HMAC signature, XOR token, TV v3 `u_id` — pass CAP-03 vectors | M | A |
| LEG-02 | Family: legacy TV (`playlist_info`, `playlist_list`, `update_playlist`, `check-activation-code`, `changeParentPin`, `check_active_status`, plain GET `playlist_information`) | L | A |
| LEG-03 | Family: signed Android V2/V3, TV V3, TV alias, `manage/*` | M | A |
| LEG-04 | Family: Roku | M | A |
| LEG-05 | Family: iOS/Android v2 + v3 | M | A |
| LEG-06 | Family: V4 any-device (recaptcha, device_login, device_info, manage, check_update, apply_recovery) | L | A |
| LEG-07 | Family: Smart TV `device_info`, TV v4, recovery v3, misc (`status_check`, `app/version`, `get_app_setting`, `device/check-activate`) | M | A |
| LEG-08 | Per-tenant legacy options (plain body, V4 lock, raw playlists for Android 44*, store-review build override) as config | S | A |
| LEG-09 | Contract test runner replaying CAP-04 fixtures against new backend; all green | M | A |
| LEG-10 | Routes apps call but no backend serves today: `POST /api/change-code` (CRPlayer activation code), `PUT /api/edit_playlist` on bob (BobPlayer) — implement from intent | S | A |
| LEG-11 | Accept both legacy body styles: form `data=<IBO>` and JSON `{"data": "<IBO>"}` | S | A |

---

## Sprint 5–6 — Integrations & payments

### STO — store & partners (Dev A)
| ID | Task | Size | Owner |
|---|---|---|---|
| STO-01 | Store key guard (per tenant) + store routes: validate-mac, save-device-activation, playlists, reset, switch-mac, update-domain, count-domain-updates | L | A |
| STO-02 | License transfer protocol via `save-device-activation` → single `licenseTransfers` record | M | A |
| STO-03 | `deviceRegistry` (central MAC index) + cross-app import (replaces HTTP donor polling) + `transfer-device-app` | M | A |
| STO-04 | PLATFORM_KEY APIs: reseller notifications CRUD | S | A |
| STO-05 | Old partner API (external status / coupon activate) and admin-token external links — rebuild or drop per CAP-02 verdict | S | A |
| STO-06 | StarArcs proxy, SportsDB mirror (Redis cache) | M | A |

### PAY — payments (Dev B)
| ID | Task | Size | Owner |
|---|---|---|---|
| PAY-01 | `PaymentGateway` port, transaction model (typed refs, minor units), provider registry with usage metrics, idempotency | M | B |
| PAY-02 | Payment purposes → fulfilment via events: device activation, plan, coupon pack, reseller package | M | B |
| PAY-03 | Currency conversion service (one job) | S | B |
| PAY-04 | PayPal (device + reseller) — verified capture (status + amount) | M | B |
| PAY-05 | Paysky, Opay/Opay1, Paymob — verified callbacks | L | B |
| PAY-06 | MDLS/Mimo store order + callback (HMAC compared) | S | B |
| PAY-07 | Telr, PayEG, Geidea, Cowpay, Cashcall | L | B |
| PAY-08 | Stripe, CoinPayments, Paymentwall | M | B |
| PAY-09 | Apple IAP (+ x5c chain), Google Play verification replacing `app_purchase` | M | B |
| PAY-10 | Webhooks at old callback paths; reconciliation job | M | B |

---

## Sprint 7–8 — Abuse, APIs for SPAs, jobs

### ABU — abuse protection (Dev A)
| ID | Task | Size | Owner |
|---|---|---|---|
| ABU-01 | Trusted client IP / ASN (only from Cloudflare), origin-lock runbook | S | A |
| ABU-02 | Redis rate-limit policies (IP, subnet, ASN, tenant, endpoint class), fail-open fallback | M | A |
| ABU-03 | Cheap rejection: MAC format, burst/sequential MAC heuristics, ASN blocklist | M | A |
| ABU-04 | Quarantine + Cloudflare IP Lists client (scoped token, expiring entries) | M | A |
| ABU-05 | Metrics + flood test harness (100k fake registrations/h) | M | A |

### API — new APIs for SPAs (Dev B, Dev A helps on device endpoints)
| ID | Task | Size | Owner |
|---|---|---|---|
| API-01 | Customer API: device login (captcha → JWT), playlists, key/UID/PIN, MAC switch, recovery, pay; account + plans; QR add playlist | L | B |
| API-02 | Reseller API: activate, codes, sub-resellers, wallet, activity, branding, notifications | M | B |
| API-03 | Admin API: devices, playlists, licensing actions, transactions, resellers/wallet, codes/coupons, packages/plans | L | B |
| API-04 | Admin API: payment settings, content, i18n, app updates, abuse review, domain-migration approval, audit, exports | L | A |
| API-05 | OpenAPI published + RBAC matrix tests | S | B |
| API-06 | v5 device API (JWT, attestation hooks) — scope agreed with app teams | M | A |

### JOB — background jobs
| ID | Task | Size | Owner |
|---|---|---|---|
| JOB-01 | Cleanup jobs (expired devices policy, pending-deletion purge, pending transactions) — correct FKs, dry-run | M | A |
| JOB-02 | Cache warmups, domain-migration evaluation, reports | S | A |
| JOB-03 | Wallet saga sweeper, payment reconciliation schedule | S | B |

---

## Sprint 9–10 — Migration, hardening, runbook

### MIG — data migration ETL
| ID | Task | Size | Owner |
|---|---|---|---|
| MIG-01 | Framework: extract → transform → load, id maps, re-runnable, report writer | M | A |
| MIG-02 | Devices + playlists (MAC normalize, duplicate merge rules, `is_trial` mapping, date parsing, orphans) | L | A |
| MIG-03 | Settings → tenantConfig/tenantSecrets, content, i18n, app updates | M | B |
| MIG-04 | Resellers merge (legacyRefs, manual review queue), opening wallet balances, codes, coupons | L | B |
| MIG-05 | Transactions (typed refs, pay_time formats, currency backfill), customers, plans | M | B |
| MIG-06 | `deviceRegistry` build, verification reports, delta sync | M | A |
| MIG-07 | Full dry-run on all sample DBs, reports reviewed | M | A+B |

### REL — release readiness
| ID | Task | Size | Owner |
|---|---|---|---|
| REL-01 | Load test (peak × 3), chaos (Redis/Mongo/tenant DB down) | M | A |
| REL-02 | Security review / pentest fixes, dependency audit | M | B |
| REL-03 | Dashboards, alerts, SLOs, backup/restore drill | M | A+B |
| REL-04 | Cutover runbook (tenant by tenant, shadow traffic diff, rollback) | M | A+B |

---

## Rough timeline

~10 sprints (~5 months) for 2 devs, if scope stays as in FEATURES.md (frontends excluded — built by another team). Biggest schedule risks: legacy contract capture (CAP-04), payments (13+ providers), and frontend readiness gating cutover. Re-estimate at the end of Sprint 1 with real velocity.

## Thursday agenda (2 h)

1. Walk through FEATURES.md — anything missing? anything we drop? (20 min)
2. ARCHITECTURE.md — confirm decisions in §9 (40 min)
3. TASKS.md — assign Dev A / Dev B, confirm Sprint 0, plan FE-01 meeting with the frontend team (30 min)
4. Pair on SET-02 so both know the skeleton (30 min)
