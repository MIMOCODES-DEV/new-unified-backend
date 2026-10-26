# Phase 1: Device core

This is the work we are doing now. Everything in this folder wins over older documents (`PLAN.md`,
`docs/TASKS.md`, `docs/ARCHITECTURE.md`) where they disagree; those are brought in line by task SCH-1.

**Phase 1 = the device core: devices, licensing, playlists, recovery and provider domain moves**
(the "Device core" modules of the Unified Backend Tour), built on the database schema we agreed on 21
and 25 Oct 2026 for the Devices models: Device, SuspectDevice, PlayList, RecaptchaToken, plus
DomainMigration. Nothing else is in Phase 1.

| In Phase 1 | Not in Phase 1 (later phases) |
|---|---|
| Devices: register, trial, identity, captcha, device key, parent PIN, MAC switch | Old-app routes (legacy, V4, signed, Roku, iOS) |
| Licensing: yearly / lifetime, activate, revoke, history, cleanup | Store, partners, transfers between apps |
| Playlists: the four kinds, add / edit / delete / sync, PIN, reply format | Staff, resellers, wallet, codes, coupons, payments |
| Recovery: a code that moves a paid device to a new TV | Content, translations, app updates, abuse |
| Provider domain moves: learn them from devices, approve, serve | Website / admin APIs, data move |

Files in this folder:

| File | What |
|---|---|
| `README.md` | this document: scope, schema, tasks, guide |
| [`database-schema.html`](database-schema.html) | the schema page: each old model next to the new collections, with what moved and what was dropped. Open it in a browser. |
| [`implementation-plan.html`](implementation-plan.html) | the plan with tick boxes (ticks are saved in your browser). Open it in a browser. |
| [`TESTS.md`](TESTS.md) | how to check that everything still works after any change: local setup without Docker, the checks, the end-to-end scenarios, the run log |

Phase 1 builds the rules and the data. The doors that call them (old-app routes, website API) come in
later phases and only call what Phase 1 builds.

## Contents

1. [How the work is organised](#1-how-the-work-is-organised)
2. [Database schema](#2-database-schema)
3. [Features](#3-features)
4. [Initial tasks](#4-initial-tasks)
5. [Feature tasks](#5-feature-tasks)
6. [Merge points and done](#6-merge-points-and-done)
7. [Guide: how to build it](#7-guide-how-to-build-it)
8. [Open decisions](#8-open-decisions)

---

## 1. How the work is organised

```
Initial tasks  →  Features (one branch each)  →  Merge points (merge and test together)  →  Device core done
```

- **Initial tasks** (Ali): turn the schema into code: the collections, their data access, the shared
  pieces. Finished before any feature starts.
- **Features**: one branch each, started when the features they need are merged.
- **Merge points**: both of us merge to `master` and test together before going on.
- No dates; the order comes from what each task needs.

Who does what:

| | Ali | Omar |
|---|---|---|
| Initial tasks | all four | reviews them |
| Features | Playlists, MAC switch, Recovery, Provider domain moves | Devices (starting 26 Oct), Licensing, Expiry and cleanup |

The same plan, with tick boxes, is in [`implementation-plan.html`](implementation-plan.html).

What `master` (`b2ac73a`) already has and Phase 1 uses:

- Skeleton: NestJS on Fastify, config, logger, error filter, access guard, Redis, BullMQ worker, CI.
- MongoDB pool and the **migration runner**: `pnpm cli migrate:central` and `pnpm cli migrate:tenants`.
- **Tenancy**: each request finds its brand from the host and gets that brand's database (`TenantDb`).
- **Brand config** (`tenantConfig`): `trial.days` (default 7), `app.demoUrl`, and brand settings
  `playlistProfile` (`xc` | `general`), `rawPlaylistsForAndroid44`.
- **Brand secrets** (`tenantSecrets`, encrypted): where the key for playlist PINs goes.
- `MacAddress` value object in `src/shared/kernel/mac-address.ts`.

The initial tasks (section 4) add `src/modules/devices`, `licensing`, `playlists` and `domain-migrations`: the six
collections, their migrations and repositories, `RedisLock` and `DeviceIdentity` (one MAC, one device). Use cases come
with the features.

---

## 2. Database schema

Six collections. Source: [`database-schema.html`](database-schema.html) (the Device, SuspectDevice,
PlayList, RecaptchaToken and DomainMigration tabs of the Old Database Map, agreed 21 and 25 Oct).

| Collection | Database | From the old model | Status |
|---|---|---|---|
| `trialDevices` | each brand | Device (never paid), SuspectDevice | agreed |
| `devices` | each brand | Device (paid at least once) | agreed |
| `licenses` | each brand | Device (`is_trial`, `expire_date`, `activated_by`, …) | agreed |
| `playlists` | each brand | PlayList | agreed |
| `captchas` | each brand | RecaptchaToken + the device's `recaptcha_*` fields | agreed |
| `domainMigrations` | central (one for all brands) | DomainMigration (cr) | agreed |

Conventions for every collection:

- `_id` is a UUID string. The old Mongo `_id` is kept in `legacy.id`.
- Field names are camelCase; dates are real `Date`s in UTC.
- Indexes are created by migrations, never `autoIndex`.

### 2.1 The idea in one picture

```
trialDevices  ──pays──▶  devices  ──currentLicenseId──▶  licenses (one row per license, kept as history)
     │                      │
     └──── deviceId ◀───────┴──────────  playlists (deviceId never changes)
```

- A device that **never paid** is in `trialDevices`. Its trial running or ended, it stays there, so it
  can never get a second trial.
- The first payment **moves** it to `devices`, keeping the same `_id`, MAC and device key. Its
  playlists point to the same `deviceId`, so they don't change.
- A device in `devices` is never deleted. An expired or revoked license leaves it in `devices` with no
  valid license.
- A MAC can be in **only one** of the two device collections: one TV is one device (rule UNQ).
  The device key is **not** unique; it is always checked together with the MAC.

### 2.2 `trialDevices`

Never paid; trial running or ended.

| Field | Type | Rule | From the old data |
|---|---|---|---|
| `_id` | String | new UUID | new id (old `_id` → `legacy.id`) |
| `macAddress` | String | unique across both device collections | `mac_address` |
| `appDeviceId` | String \| null | unique; used only when there is no usable MAC | `app_device_id`, `app_device_id_unique` |
| `platform` | String | device / OS the app runs on: samsung, lg, android, ios, roku…; lowercase fixed list | `app_type` (renamed) |
| `deviceKey` | String | 6 digits; not unique (checked together with the MAC) | `device_key` |
| `uid` | String \| null | only V4 apps send it | `u_id` |
| `trialStartedAt` | Date | | `created_time` (or the time inside the old `_id`) |
| `trialEndsAt` | Date | end of day UTC | `expire_date` when `is_trial` = 0 |
| `playlistCount` | Number | 0 = never added one; changes on add and delete | counted from old playlists |
| `firstPlaylistAt` | Date \| null | empty = never added one; stays set after a delete | earliest old playlist `createdAt` |
| `parentPin` | String \| null | kept as entered, not hashed: apps get it back and check it | `parent_pin` |
| `stalkerEnabled` | Boolean | turns Stalker portals on for this device | `stalker_enabled` |
| `apiVersion` | String | `legacy` \| `v4` \| `v5` | `api_version`, `apiVersion`, `android_api_version` |
| `appVersion` | String \| null | app version the device last sent | `version` (ibo: `pro_version`, `player_tv_version`) |
| `ip` | String | | `ip` |
| `lastSeenAt` | Date | | `last_seen` |
| `legacy` | Object | old brand, old `_id`, raw old fields | `_id`, `device_model`, `device_info` |
| `createdAt` | Date | | `created_time`, `createdAt` |
| `updatedAt` | Date | | `updatedAt` |

### 2.3 `devices`

Paid at least once. Never deleted.

| Field | Type | Rule | From the old data |
|---|---|---|---|
| `_id` | String | keeps the id it had in `trialDevices` | new id (old `_id` → `legacy.id`) |
| `macAddress` | String | unique across both device collections | `mac_address` |
| `appDeviceId` | String \| null | unique; used only when there is no usable MAC | `app_device_id` |
| `platform` | String | as in `trialDevices` | `app_type` |
| `deviceKey` | String | 6 digits; not unique | `device_key` |
| `uid` | String \| null | | `u_id` |
| `currentLicenseId` | String | points to a row in `licenses` | new |
| `activatedAt` | Date | first payment | new |
| `resellerId` | String \| null | a reseller (central DB; later phase) | `reseller_id` |
| `customerId` | String \| null | a customer (later phase) | `user_id` |
| `parentPin` | String \| null | kept as entered, not hashed | `parent_pin` |
| `stalkerEnabled` | Boolean | turns Stalker portals on for this device | `stalker_enabled` |
| `apiVersion` | String | `legacy` \| `v4` \| `v5` | as above |
| `appVersion` | String \| null | | as above |
| `ip` | String | | `ip` |
| `lastSeenAt` | Date | | `last_seen` |
| `switch` | Object \| null | MAC switch history: from, to, when | `switched_to`, `switched_from`, `switched_date`, `origin_mac_address` |
| `recovery` | Object \| null | `{ code, expiresAt, enabled, recoveredFrom, recoveredAt }`: a code made on the website (paid devices only, 30 minutes) that moves this device to a new TV | `recovery_code`, `…_expires_at`, `…_enabled`, `recovered_from`, `recovered_date` |
| `legacy` | Object | old brand, old `_id`, raw old fields | `_id`, `device_model`, `device_info` |
| `createdAt` | Date | | `created_time`, `createdAt` |
| `updatedAt` | Date | | `updatedAt` |

### 2.4 `licenses`

One row per license a paid device gets. Rows are kept as history; the device points to its current one.

| Field | Type | Rule | From the old data |
|---|---|---|---|
| `_id` | String | UUID | new |
| `deviceId` | String | a row in `devices` | new |
| `type` | String | `yearly` \| `lifetime` | `is_trial` 3 = yearly, 2 = lifetime |
| `expiresAt` | Date \| null | empty for lifetime | `expire_date` |
| `revoked` | Boolean | | `is_trial` 1 |
| `revokedAt` | Date \| null | | new |
| `activatedBy` | Object | admin, reseller, code, coupon, payment, store, transfer or plan | `activated_by` |
| `creditCost` | Number | yearly 1, lifetime 2 | `credit_count` |
| `multiActivate` | Boolean | bought in a multi-device store order; a MAC switch is refused | `multi_activate` |
| `sourceId` | String \| null | the transaction, code, coupon or subscription that paid | new |
| `createdAt` | Date | | new |

Rules:

- **Stacking:** a yearly license bought before the current one ends adds its year to that end date.
  So `expiresAt` is calculated when the row is created.
- **Revoking keeps the row.**
- **The state is worked out, never stored:** trial, yearly, lifetime, expired or revoked come from
  `trialEndsAt` or the current license. This replaces the old `is_trial` 0–3 number.

### 2.5 `playlists`

One collection for all kinds. Each row has a `type`, and only the part for that type is filled.

| Field | Type | Rule | From the old data |
|---|---|---|---|
| `_id` | String | new UUID | new id (old `_id` → `legacy.id`) |
| `deviceId` | String | the device in `trialDevices` or `devices`; indexed | `device_id` (text, no index today) |
| `name` | String | required, trimmed | `playlist_name` |
| `type` | String | `m3u` \| `xtream` \| `stalker` \| `code` | `playlist_type` (general = m3u, xc = xtream, empty = m3u) |
| `url` | String \| null | m3u and xtream: the link exactly as typed; **not encrypted** | `url` |
| `xtream` | Object \| null | `{ server, username, password }`, parsed once when saved; **not encrypted** | `username`, `password`, or parsed from `url` |
| `stalker` | Object \| null | `{ portalName, portalUrl, fallbackUrl, mac }` | `portal_name`, `portal_address`, `portal_fallback_address` / `fallback_portal_address`, `stalker_mac_address` |
| `code` | Object \| null | `{ code }`: a provider code (digits) instead of a link | `code` / `playlist_code` |
| `account` | Object \| null | `{ status, expiresAt, checkedAt }`: what the provider said about the account, as the app last reported it (any type; CRPlayer sends it for every playlist). Null until reported | `status`, `expiration_date` |
| `epgUrl` | String \| null | | `epg_url` |
| `backup` | Object | `{ enabled, hosts[] }`, up to 8 hosts; hosts kept when turned off | `cross_dns_backup`, `backup_dns` (cr) |
| `protected` | Boolean | opening it needs the PIN | `is_protected` (0, 1 or "") |
| `pinEnc` | String \| null | **encrypted, not hashed**: Roku and iOS replies send the PIN to the app | `pin` (plain text) |
| `provider` | Object \| null | `{ name, logo, whatsapp, email }` shown in the app | `contact_name`, `logo`, `whatsapp`, `email` |
| `addedBy` | Object | `{ via: app \| website \| store \| admin, resellerId }`; never the raw API key | `added_by` |
| `legacy` | Object | old brand, old `_id`, raw old fields | `_id`, `device_type` (ibo) |
| `createdAt` | Date | | `createdAt` (bob), else the time in the old `_id` |
| `updatedAt` | Date | | `updated_time`, `updatedAt` |

Rules:

- No limit on playlists per device.
- The status sync from the apps (old `PUT edit_playlist`) may change only `account` (status and expiry), for any playlist type.
- The demo playlist is **not a row**: it comes from brand config `app.demoUrl` when a device has none.

### 2.6 `captchas`

Per brand. The V4 registration captcha, the u_id recovery captcha and the website captcha. An
unanswered captcha expires; a **solved one is kept** for its MAC, because CRPlayer-type apps send the same
solved code on every start and cr checks it forever.

| Field | Type | Rule | From the old data |
|---|---|---|---|
| `_id` | String | new UUID | new |
| `token` | String | unique; what the app sends back with its answer | `token` |
| `kind` | String | `v4` \| `uidRecovery` \| `web` | `code` (`uid_recovery` = uidRecovery, empty = registration) |
| `macAddress` | String \| null | normalized | `mac_address` |
| `appDeviceId` | String \| null | for devices without a usable MAC | new |
| `platform` | String \| null | the app type that asked | `app_type` |
| `answerHash` | String | hash of the text shown, upper case; the answer itself is never stored | `captchaText` (plain text today) |
| `verifiedAt` | Date \| null | set once when solved; a solved V4 captcha lets the device skip the next one | `recaptcha_verified` (on the old device) |
| `expiresAt` | Date \| null | TTL; cleared when solved, so the solved row is kept | new (old rows never expired) |
| `createdAt` | Date | | `createdAt`, `recaptcha_requested_at` (on the old device) |

- Old `recaptchatokens` rows are not moved (short-lived).
- An old device with `recaptcha_code` + `recaptcha_verified` gets one solved `captchas` row for its MAC in
  the data move, so old CRPlayer apps keep working.

### 2.7 `domainMigrations`

**Central** (one collection for all brands, because a provider host is the same for every brand). When an
IPTV provider moves its server, devices report the new host. A move is learned from several **paid**
devices on **different IPs**, and only served after a staff member approves it.

| Field | Type | Rule | From the old data (cr) |
|---|---|---|---|
| `_id` | String | new UUID | new id (old `_id` → `legacy.id`) |
| `kind` | String | `migration` \| `mirror` | `kind` |
| `fromHost` | String | lowercase host[:port]; unique together with `toHost` | `from_host` |
| `toHost` | String | lowercase host[:port] | `to_host` |
| `fromScheme` | String | `http` \| `https` \| empty | `from_scheme` |
| `toScheme` | String | `http` \| `https` \| empty | `to_scheme` |
| `confirmations` | Array | `[{ tenantId, deviceId, ipHash, at }]`: paid devices only, one per IP | `confirmed_by` (device ids only) |
| `source` | String | `user` (learned from devices) \| `admin` (entered by staff) | `source` |
| `status` | String | `pending` \| `approved` \| `blocked`; only approved moves are served | `status` (active = approved) |
| `decidedBy` | String \| null | the staff user who approved or blocked it | new |
| `decidedAt` | Date \| null | | new |
| `firstSeenAt` | Date | | `first_seen_at` |
| `lastConfirmedAt` | Date | | `last_confirmed_at` |
| `legacy` | Object | old `_id` | `_id` |
| `createdAt` | Date | | `createdAt` |
| `updatedAt` | Date | | `updatedAt` |

- `confirmation_count` is not stored: it is the number of `confirmations`.
- After **3** confirmations from different IPs a move shows up for approval; it is only served once approved.
- Approving changes what devices **get** in playlist replies; stored playlists are never rewritten by a move.

### 2.8 SuspectDevice

Old ibo archive of expired trial devices, moved out of `devices` by an admin page to keep that table
small. Same fields as Device. **No collection in the new design**: its rows go to `trialDevices`, which
already holds every device that never paid.

### 2.9 Indexes

| Collection | Index | Why |
|---|---|---|
| `trialDevices`, `devices` | `macAddress` unique | one device per MAC (within the collection) |
| `trialDevices`, `devices` | `appDeviceId` unique, partial (only when set) | devices without a usable MAC |
| `trialDevices`, `devices` | `uid` (partial) | V4 lookups |
| `trialDevices` | `trialEndsAt` + `playlistCount` | the cleanup job |
| `devices` | `currentLicenseId` | |
| `licenses` | `deviceId` + `createdAt` | history of one device |
| `licenses` | `deviceId` + `sourceId` unique, partial | activating a device twice with the same source does nothing; one coupon pack or code batch may still pay for several devices |
| `playlists` | `deviceId` | every playlist read is by device (the old backends scanned everything) |
| `playlists` | one unique key per device: `url` + username, or portal + MAC, or code | the same playlist cannot be saved twice |
| `captchas` | `token` unique | the app answers by token |
| `captchas` | `macAddress` + `kind` | the solved captcha of a MAC |
| `captchas` | `expiresAt` TTL (expireAfterSeconds 0) | unanswered captchas disappear; solved ones have no `expiresAt` and stay |
| `domainMigrations` (central) | `fromHost` + `toHost` unique | one row per move |
| `domainMigrations` (central) | `status` | approved moves are read on every playlist reply |
| all | `legacy.id` (partial) | look up by old id, for the data move |

A MongoDB index covers one collection only. "Unique across **both** device collections" therefore
needs its own rule, task **UNQ**: the Redis lock on the MAC, with no extra collection.

### 2.10 What was dropped or moved

Dropped (decided 21 and 25 Oct):

| Old field | Why |
|---|---|
| `old_device_key` | only a dead bulk job wrote it |
| `status` (device) | its only check can never be true |
| `api_hit_count` | counted, never read |
| `is_automatic_saved` | never read |
| `platform` (ibo) | which ibo app registered the device; removed by team decision |
| `hostname` (ibo) | first API domain; only shown in the old admin |
| `pending_deletion`, `deletion_at` | set by recovery, never read by any job |
| orphan playlists (device gone) | left out of the new database; the data move counts them |
| `portal_fallback_address` vs `fallback_portal_address` | two names for one value; merged into `stalker.fallbackUrl` |

Moved elsewhere:

| Old field | Goes to |
|---|---|
| `recaptcha_code`, `recaptcha_verified`, `recaptcha_requested_at` | `captchas` (2.6) |
| `user_id`, `plan_id`, `pre_plan_*` | customers / subscriptions (later phase) |
| `migrated_*` (8 fields) | central licenseTransfers, deviceRegistry (later phase) |
| `device_name` | customers (later phase) |
| old `SuspectDevice` rows | `trialDevices` (2.8) |
| old revoked devices (`is_trial` 1) | `trialDevices` |

### 2.11 Decisions behind the schema

- Two device collections, `trialDevices` and `devices`; paying moves a device and keeps its id (25 Oct).
- Every license is its own row in `licenses`, kept as history (25 Oct).
- An old device with `is_trial` 1 (revoked) goes to `trialDevices` (25 Oct).
- `playlistCount` + `firstPlaylistAt` only on `trialDevices` (25 Oct).
- One `playlists` collection with a type and one filled part (25 Oct).
- No encryption at rest for `url` or the Xtream password; the PIN per playlist stays (`pinEnc`) (25 Oct).
- No limit on playlists per device.
- Only the MAC is unique (across both device collections); the device key is not unique (25 Oct).
- `stalkerEnabled` stays on the device, in both device collections (25 Oct).
- Only `trialDevices` and `devices` hold devices; "one MAC, one device" is kept by the Redis lock on the MAC, not by an extra collection (25 Oct).
- Orphan playlists are left out; the data move reports how many (25 Oct).
- `captchas` and `domainMigrations` as in 2.6 and 2.7 (25 Oct).
- A provider move shows up for approval after 3 confirmations from different IPs (25 Oct).

---

## 3. Features

The device core features from `Unified Backend Tour.html`, and the task that delivers each.

### Devices

| Feature | Task |
|---|---|
| Register an unknown device with a trial | DEV-1 |
| 6-digit device key for website login | DEV-5 |
| u_id identity + captcha registration (V4) | DEV-4 |
| UID-recovery captcha when the u_id does not match | DEV-4 |
| MAC switch: move a license to a new MAC | DEV-7 |
| Parent PIN | DEV-5 |
| Random MAC from app_device_id | DEV-2 |
| Merge rows stored under the wrong app type | DEV-3 |
| One device shared by IBO Player, Pro and TV | DEV-3 |
| V4 lock: a V4 device is refused by old routes | DEV-6 |
| Store-review build override | DEV-6 |
| Fallback MACs treated as "no MAC" | DEV-2 |

### Licensing

| Feature | Task |
|---|---|
| License states: trial, yearly, lifetime, expired, revoked | LIC-1 |
| Activate from any source: reseller, code, coupon, payment, store, admin | LIC-2 |
| Multi-activate flag and credit count | LIC-1, LIC-2 |
| Activation history with who did it | LIC-3 |
| Expiry and cleanup of old devices | LIC-4 |

### Playlists

| Feature | Task |
|---|---|
| Kinds: M3U, Xtream, Stalker portal, code | PL-1 |
| Add, edit, delete from app, website, store, admin | PL-2 |
| Bulk sync by MAC (update_playlist) | PL-2 |
| PIN protection per playlist | PL-3 |
| Provider branding: logo, contacts | PL-4 |
| Response shaping: Xtream, general or raw, per brand and app | PL-4 |
| Demo playlist when the device has none | PL-4 |
| Backup URLs (up to 8) | PL-5 |
| Add without login: QR code, Stalker form | PL-6 |
| Add or delete by MAC only | PL-6 |
| Playlist status sync (edit_playlist) | PL-7 |
| Bulk provider domain rewrite | PL-8 |

### Recovery

| Feature | Task |
|---|---|
| Generate a recovery code on the website | REC-1 |
| Apply the code on a new device | REC-2 |
| Retire the old device after recovery (no purge today) | REC-3 |

### Provider domain moves

| Feature | Task |
|---|---|
| Learn provider host moves from devices | DOM-1 |
| Admin approves a move before it is served | DOM-2 |

---

## 4. Initial tasks

Four tasks, all Ali's, reviewed by Omar. When they are merged, every feature can start.

| Task | Branch | Needs |
|---|---|---|
| SCH-1 Create the Phase 1 collections | `feat/schema-device-core` | nothing |
| LOCK Redis lock helper | `feat/redis-lock` | nothing |
| SCH-2 Data access for the Phase 1 collections | `feat/device-core-repositories` | SCH-1 |
| UNQ One MAC, one device | `feat/device-identity-unique` | SCH-2, LOCK |

### SCH-1: Create the Phase 1 collections

**What:** make the schema in section 2 real in the code: the six collections.

**Work:**

- Create four modules from `_template`: `src/modules/devices` (trialDevices, devices, captchas),
  `licensing` (licenses), `playlists` (playlists) and `domain-migrations` (domainMigrations). Recovery has
  no collection of its own (it uses `devices.recovery`); its module starts with the Recovery feature.
- In each module's `domain/`: the TypeScript types for its collections and their fixed values
  (`platform`, `apiVersion`, playlist `type`, license `type`, captcha `kind`, move `status`).
- In `infrastructure/`: the stored document shape and a zod schema that checks it.
- One migration per collection with a MongoDB validator and the indexes in 2.9:
  - brand collections are listed in `tenantMigrations` in `src/migrations.ts`;
  - `domainMigrations` is listed in `centralMigrations`.
- Bring `PLAN.md` §5–6, `docs/TASKS.md` and `docs/ARCHITECTURE.md` in line with this folder: no
  `pendingDevices`, no Dev A / Dev B or sprints, no playlist encryption.

**Done when:**

- `pnpm cli migrate:tenants` creates the five brand collections on every brand database, and
  `pnpm cli migrate:central` creates `domainMigrations`, all with their indexes.
- Every field name and type matches section 2.
- `grep -ri pendingDevices PLAN.md docs/` returns nothing.
- Unit tests for the zod schemas pass; reviewed by Omar; merged.

### SCH-2: Data access for the Phase 1 collections

**What:** one repository per collection, so features never touch the MongoDB driver directly.

**Work:**

- In each module's `application/ports/`: a repository port with the reads and writes the features need
  (find by id, by MAC, by device key, by appDeviceId, by uid, by old id; insert; update; list
  playlists and licenses by device; find a captcha by token or by MAC; find a move by its hosts or status).
- In `infrastructure/`: a Mongo adapter that maps between the stored document and the domain type, on
  `TenantDb` for brand collections and on `CENTRAL_DB` for `domainMigrations`.

**Done when:**

- Typed repositories exist for `trialDevices`, `devices`, `licenses`, `playlists`, `captchas` and
  `domainMigrations`.
- They only work inside a brand context. An integration test with two brands proves that nothing
  written for brand A is visible to brand B.
- Look up by old id (`legacy.id`) works.
- Reviewed by Omar; merged.

### LOCK: Redis lock helper

**What:** a way to make sure two servers never change the same device at the same time.

**Work:** `RedisLock.withLock(key, { ttlMs }, fn)` in `src/shared/redis/redis-lock.ts`. It takes the
lock with `SET NX PX` and a random token, and releases it with a script that deletes the key only if
the token is still ours.

**Done when:**

- A second caller cannot take a lock that is held; different keys run in parallel.
- A lock expires after its TTL and is released when the work throws.
- A late release never deletes someone else's lock.
- If Redis is down, the lock is refused (fails closed).
- Integration tests against a real Redis pass in CI; reviewed by Omar; merged.

### UNQ: One MAC, one device

**What:** the schema says a MAC can be in only one of `trialDevices` or `devices`: one TV is one
device. An index cannot do that across two collections, so one helper does it. (The device key is not
unique, so it needs nothing here.)

**Work:**

- Only `trialDevices` and `devices`; no extra collection (decided 25 Oct).
- One helper takes the Redis lock for the MAC (`device:<brand>:<mac>`, task LOCK), then:
  - **create:** looks in both collections, and inserts into `trialDevices` only if the MAC is in neither;
  - **move to paid:** writes the row to `devices` (same id, MAC and device key), then deletes it from
    `trialDevices`;
  - **MAC switch:** checks the new MAC is in neither collection before changing it.
- Lookups always check `devices` first, so a device caught halfway through a move is still found as
  paid. A move that stopped halfway is finished by running it again.
- A device that already exists is only read, without the lock: if Redis is down, existing TVs keep
  working; only new TVs, payments and MAC switches wait until Redis is back.

**Done when:**

- Parallel sign-ups with the same MAC create exactly one device.
- A moved device is in exactly one collection afterwards; a move stopped halfway and run again ends in
  `devices` only.
- With Redis down, an existing device is still found; creating a new one is refused with a clear error.
- Reviewed by Omar; merged.

---

## 5. Feature tasks

Each feature is one branch, merged when its "done when" holds. Review by the other developer;
tests green; then `master`.

### Devices (Omar), `feature/devices`, after the initial tasks

Done when: a new device on any app gets a trial and comes back as the same device; fallback MACs
never merge devices; V4 devices register with a captcha.

- **DEV-1 Register and find a device**
  - An unknown MAC creates a `trialDevices` row: new UUID, new 6-digit device key, `trialStartedAt` now,
    `trialEndsAt` = end of day UTC after `trial.days` from brand config.
  - A device whose trial ended stays in `trialDevices` and never gets a second trial.
  - `lastSeenAt`, `ip`, `appVersion` and `apiVersion` are updated on each visit.
- **DEV-2 Devices without a usable MAC**
  - No MAC: one is made from `appDeviceId`, and the device is found again by `appDeviceId`.
  - The fallback MACs `52:54:00:12:34:57`, `…:58`, `…:59` and the Windows fallback never create or match a
    shared device; such devices are found by `appDeviceId` or `uid`. A test for each.
- **DEV-3 One device for IBO Player, Pro and TV; wrong app type**
  - The three IBO apps with the same MAC get the same device; `appVersion` records the last caller.
  - Two rows for one device under different platforms are merged, keeping the paid one.
- **DEV-4 u_id and captcha registration (V4)**
  - Uses the `captchas` collection (2.6): unanswered captchas expire; solved ones are kept for their MAC.
  - A captcha is issued, expires if unanswered, and can be answered once.
  - A solved captcha lets the device skip the next one. CRPlayer-type apps send the same solved code on
    every start, and it keeps working.
  - A u_id that does not match asks for the recovery captcha; solving it updates `uid`.
- **DEV-5 Device key and parent PIN**
  - A new device key is 6 random digits; it does not have to be unique, because it is always checked
    together with the MAC.
  - The key can be changed; the old one stops working.
  - `parentPin` can be set and changed and is returned as entered.
- **DEV-6 V4 lock and store-review builds**
  - A device with `apiVersion` v4 is refused by the old entry points.
  - ibo and bob reply "lifetime" to a Samsung / LG review build when a hard-coded testing flag is on (it
    is off today). Replace the flag with a per-brand list of review builds (platform + version) in
    brand config, empty by default.

### Licensing (Omar), `feature/licensing`, after Devices

Done when: a device can be activated from any source, extended and revoked, and its license history listed.

- **LIC-1 License rules**
  - The state (trial, yearly, lifetime, expired, revoked) is worked out from `trialEndsAt` or the current license.
  - Stacking: a yearly license bought early adds its year to the current end date; lifetime has no `expiresAt`.
  - `creditCost` is 1 for yearly and 2 for lifetime; `multiActivate` is stored.
  - A unit test for every rule.
- **LIC-2 Activate from any source**
  - One use case for every source: reseller, code, coupon, payment, store, transfer, admin, plan. The
    sources themselves come in later phases; here the source is only recorded.
  - Writes a `licenses` row (`type`, `expiresAt`, `activatedBy`, `creditCost`, `multiActivate`, `sourceId`).
  - A trial device moves to `devices` (UNQ helper); `currentLicenseId` and `activatedAt` are set.
  - The same `sourceId` twice does nothing the second time. Runs under the Redis lock for the device.
- **LIC-3 Revoke, expiry and history**
  - Revoke sets `revoked` and `revokedAt`; the device stays in `devices` with no valid license.
  - Expired is worked out from `expiresAt`, never stored.
  - A device's full license history is listed with `activatedBy`.

### Playlists (Ali), `feature/playlists`, after Devices

Done when: a device can add, edit, delete, protect and sync playlists and gets them in its brand's reply format.

- **PL-1 Playlist kinds and storage**
  - An Xtream link is parsed once into `xtream { server, username, password }`; `url` is kept as typed.
  - Each type fills only its own part; a test per type. `url` and the Xtream password are plain text.
- **PL-2 Add, edit, delete and bulk sync**
  - Add, edit, delete and list by device; `addedBy` records app, website, store or admin.
  - Bulk sync by MAC (update_playlist):
    - adds new playlists and returns their new ids next to the app's origin ids;
    - removes `remove_ids`;
    - only touches the calling device's playlists.
  - `playlistCount` and `firstPlaylistAt` on `trialDevices` follow add and delete. No limit per device.
- **PL-3 PIN protection per playlist**
  - `protected` + `pinEnc` set and changed; `pinEnc` uses the brand key from secrets.
  - Opening or changing a protected playlist without the PIN is refused.
- **PL-4 Reply shaping, demo playlist and provider branding**
  - One URL parser replaces the old ones, with tests.
  - The reply follows the brand's `playlistProfile` (xc or general); Android 4.4 gets raw playlists when
    `rawPlaylistsForAndroid44` is on.
  - A device with no playlist of its own gets the demo playlist from `app.demoUrl`.
  - `provider { name, logo, whatsapp, email }` is returned with the playlist.
- **PL-5 Backup URLs**
  - `backup { enabled, hosts[] }`, up to 8 hosts; turning it off keeps the hosts.
  - Replies include them in the shape cr gives today.
- **PL-6 Add without login and by MAC only**
  - Add by QR code and by the Stalker form for a known MAC without a login.
  - Add and delete by MAC only as on cr, rate limited per IP.
- **PL-7 Playlist status sync and code playlists**
  - The status sync changes only `account` (status, expiry), for any playlist type; any other field sent is ignored, with a test.
- **PL-8 Bulk provider domain rewrite**
  - Touches only the calling brand; the domain is plain text, not a pattern.
  - Reports how many playlists changed; a count-only mode changes nothing.

### MAC switch (Ali), `feature/mac-switch`, after Licensing

- **DEV-7 MAC switch**
  - The device moves to the new MAC, keeping its id, license and playlists; `switch` records from, to and when.
  - Refused when the current license has `multiActivate`, and when the new MAC belongs to a paid device.

### Expiry and cleanup (Omar), `feature/license-cleanup`, after Licensing and Playlists

- **LIC-4 Expiry and cleanup of old devices**
  - The rule for trial devices that ended and never added a playlist (`playlistCount` 0) is agreed and
    written here.
  - `devices` are never deleted. A cleaned trial device takes its playlists with it (by `deviceId`), so
    no new orphans appear.
  - The job has a dry-run mode, writes a report, and runs once across all servers.

### Recovery (Ali), `feature/recovery`, after Licensing

Done when: a code made on the website moves a paid device to a new TV with its license and playlists,
and nothing is left behind.

- **REC-1 Recovery code**
  - Only a device in `devices` (paid) gets a code. It is stored in `recovery { code, expiresAt, enabled }`
    and lasts 30 minutes.
  - A new code replaces the old one; a trial device is refused.
- **REC-2 Apply the code on a new TV**
  - The paid device takes the new TV's MAC and keeps its id, license and playlists.
  - `recovery` records `recoveredFrom` (the old MAC) and `recoveredAt`.
  - A code works once; an expired or wrong code is refused. Runs under the Redis lock for both MACs.
- **REC-3 Retire what is left after recovery**
  - The old backends never purged after a recovery.
  - The new TV's own trial row, if it had one, is removed with its playlists (by `deviceId`).
  - After a recovery each MAC belongs to exactly one device; a test proves there are no leftovers.

### Provider domain moves (Ali), `feature/domain-moves`, after Licensing and Playlists

Done when: a move reported by paid devices on different IPs is served only after it is approved.

- **DOM-1 Learn provider host moves**
  - The first report of `fromHost` → `toHost` creates a `pending` row; later reports add confirmations.
  - Only paid devices count, and only one confirmation per IP (`ipHash`); trial devices are ignored.
  - After 3 confirmations from different IPs the move shows up for approval; it is not served yet.
  - Hosts are stored lowercase with the port; a test per rule.
- **DOM-2 Approve a move before it is served**
  - Approve and block set `status`, `decidedBy` and `decidedAt` (a CLI command until the admin API exists).
  - Playlist replies swap `fromHost` for `toHost` only for approved moves; stored playlists are not changed.
  - A blocked move is never served, however many confirmations it gets.

---

## 6. Merge points and done

| Merge point | After | Test together on `master` |
|---|---|---|
| Devices and licenses work | Devices, Licensing | Register a device, activate it from two different sources, extend it and revoke it. |
| Device core works | Playlists, MAC switch, Expiry and cleanup, Recovery, Provider domain moves | Add and sync playlists, switch the MAC of a paid device, recover it on a new TV, approve a provider move, dry-run the cleanup. |

**Device core done (CORE, both):** on a test brand, run the whole flow:

1. Register a device and add playlists.
2. Activate it, extend it, switch its MAC, recover it on a new TV, revoke it.
3. Report a provider move from paid devices, approve it, and see it in the playlist replies.
4. Check the state and the replies after each step.

Run it again on a second brand to see that nothing crosses between brands.

---

## 7. Guide: how to build it

### 7.1 Module layout

Every module is a copy of `src/modules/_template` (read its README):

```
src/modules/devices/
  domain/              types, value objects, rules, domain errors — pure TypeScript, no packages
  application/
    ports/             repository ports (abstract classes)
    use-cases/         one class per action, one public execute(), unit-tested with in-memory fakes
  infrastructure/      Mongo adapters on TenantDb, stored document shapes, migrations
  devices.module.ts    binds ports to adapters, exports use cases
  index.ts             the only file other code may import
```

Rules (ESLint enforces most):

- `domain/` imports only `src/shared/kernel`.
- Other modules import a module only through its `index.ts`.
- Business failures are `DomainError`s returned in a `Result`; throw only for bugs and infrastructure errors.
- Time comes from an injected `Clock`; dates in UTC.
- No `if (brand === 'x')`; per-brand behaviour comes from brand config.

### 7.2 Brand data and migrations

- Brand repositories inject `TenantDb` and ask for their collection **on every call**: one repository
  object serves every brand.
- A migration is `{ id: '0001-…', description, up(db) }` (`src/shared/database/migrations/migration.ts`):
  forward only, ids in order.
- Each module exports its migrations (as `tenants` does in `tenants.migrations.ts`); add them to
  `tenantMigrations` in `src/migrations.ts`.

```bash
pnpm cli migrate:tenants        # applies brand migrations to every brand database
pnpm cli tenants:seed           # seed the local test brands
pnpm cli tenant:create …        # make a test brand (all commands: src/main.cli.ts)
pnpm cli tenant:config …        # see a brand's config (trial.days, app.demoUrl, …)
```

### 7.3 Tests

| Command | What | Needs |
|---|---|---|
| `pnpm typecheck` | TypeScript | nothing |
| `pnpm lint` | ESLint, layer rules | nothing |
| `pnpm test` | unit tests: domain rules, use cases with fakes | nothing |
| `pnpm knip` | unused files and exports | nothing |
| `pnpm test:int` | integration: repositories, migrations, Redis lock, brand isolation | Docker, or `TEST_MONGO_URI` + `TEST_REDIS_URL` pointing at servers you can wipe |

The full checklist to run after any change, the local setup without Docker and the end-to-end scenarios are in
[TESTS.md](TESTS.md). Every rule in this document gets a test. Every repository gets an integration test, including the
two-brand isolation check.

### 7.4 Branches and merging

- Start every branch from `master`. Only `master` counts; the `ali-dev` and `omar-dev` branches and
  their stashes are not used.
- One branch per initial task and per feature (names in sections 4 and 5).
- Merge flow: review by the other developer → typecheck, lint, unit and integration tests green → `master`.
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).

---

## 8. Open decisions

Settle these before or during the task named.

| # | Question | Options | Recommendation | Task |
|---|---|---|---|---|
| 1 | Which trial devices does the cleanup remove, and when? | to agree | ended trial + `playlistCount` 0 + not seen for N days; dry run first | LIC-4 |
