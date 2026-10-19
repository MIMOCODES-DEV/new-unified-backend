# Device registration with pending devices — design

- Status: rules agreed, plan to be rewritten. Updated 2026-10-19 with the product owner's decisions: separate `pendingDevices` collection, only paying moves a device into `devices`, unpaid devices are never removed.
- Feature: "Auto-register unknown MAC with trial" (docs/FEATURES.md §2), ibo · bob · cr, all apps
- Diagrams: [docs/diagrams/device-registration.md](../../diagrams/device-registration.md)
- Background: PLAN.md §5.3 (device model), §6 (pending devices); old behaviour traced in the three legacy backends (summary below)

## Intent

Every app route in the old backends (legacy TV, signed Android, Roku, iOS, V4, store) does the same thing underneath: find a device by MAC, or create one with a 7-day trial. They do it in 20+ copy-pasted blocks with no unique index, so the same MAC ends up as several rows, every unknown MAC (including bots) becomes a permanent row in `devices`, and cleanup jobs delete devices that then get a fresh trial on their next visit.

This slice builds that core once, with no wire format: a `devices` module that registers-or-gets a device in the brand's own database. **A new device never enters `devices` directly.** It waits in `pendingDevices` on its trial and moves into `devices` only when it pays, so `devices` contains paying users only. Each app door (legacy, V4, store…) becomes a thin adapter over this core in later slices.

## Goals

1. `RegisterOrGetDeviceUseCase`: given a MAC and an app type for the current brand, return the device: from `devices` if paid, else from `pendingDevices`, else create it in `pendingDevices`.
2. A new device gets a trial of **7 days**.
3. A MAC never gets a second trial: its `pendingDevices` record is kept forever with its original trial end date, so a returning device finds it unchanged.
4. `ActivateDeviceUseCase`: when a device pays, move it from `pendingDevices` to `devices` with the same id and device key, in one MongoDB transaction. A device already in `devices` is returned as is (licence handling comes with payments).
5. Unpaid devices are **never removed** automatically: no TTL index, no deletion jobs.
6. One device per normalized MAC per brand, and a 6-digit device key unique per brand. Lookups always check `devices` first, so a paid device wins.
7. CLI commands to try it by hand: `pnpm cli device:register <brand> <mac> <app>` and `pnpm cli device:activate <brand> <mac>`.
8. Unit tests (fixed clock, in-memory ports) and an integration test on real MongoDB.

## Non-goals (later slices)

- Any HTTP route or legacy/V4/store wire format; captcha; `u_id`.
- Payments, licence plans (yearly/lifetime/plan), expiry of paid licences, reseller codes, coupons: they will call `ActivateDeviceUseCase`.
- Devices without a MAC (`app_device_id`, random MACs) and the shared fallback MACs `52:54:00:12:34:57/59` (DEV-10).
- Quarantine, MAC switch, recovery, activation history.
- Per-brand trial/pending lengths (need `tenantConfig`, TEN-05). Constants for now.
- The central `deviceRegistry` index.

## Anti-goals

- A device that has not paid is never written to `devices`.
- Never a second fresh trial for a MAC, ever.
- A device is never in both collections, and is never lost while moving.
- Never touch another brand's data: all reads/writes go through `TenantDb`.
- No `if (slug === …)` and no direct `new Date()` in domain/application code (inject `Clock`).

## Decisions

| Topic | Decision | Whose |
|---|---|---|
| Collections | Brand DB (`TenantDb`): `pendingDevices` (not paid, kept forever), `devices` (paid only) | product owner |
| Promotion | Only paying (any paid activation) moves a device to `devices`. Return visits, playlists and logins do not. Replaces PLAN.md §6's "any sign of real use" | product owner |
| Trial memory | No separate `trialHistory` collection: since nothing removes pending records, the record itself remembers the trial | builder's call, follows from "never removed" |
| Moving | `ActivateDeviceUseCase` inserts into `devices` and deletes from `pendingDevices` in one transaction (the local MongoDB is a replica set, transactions are available); same `_id` and `deviceKey` | builder's call |
| Lookup order | `devices`, then `pendingDevices`; both by normalized MAC | builder's call |
| MAC | Normalized with existing `MacAddress.parse`; unique index on `macAddress` in each collection; unique per brand regardless of app type (PLAN §5.3) | doc |
| App type | Trimmed, lowercased, must match `^[a-z0-9_]{1,32}$`; stored, not part of identity | builder's call |
| Device key | 6 digits `100000`–`999999` via `crypto.randomInt`; unique index in each collection, and generation checks both collections; on collision retry, max 5 attempts, then throw | builder's call |
| Trial | `trialExpiresAt = now + 7 days` (exact instant, UTC); already-used trial: `trialExpiresAt = now` | builder's call |
| Removal | None: unpaid devices stay in `pendingDevices` forever. Accepted trade-off: bot MACs accumulate there, but never in `devices` | product owner |
| Visits | Every register-or-get of an existing device updates `lastSeenAt` | builder's call |
| Indexes | Tenant migration `0001-devices-indexes` in `tenantMigrations` (`pnpm cli migrate:tenants`), never `autoIndex` | doc |
| Errors | `kernel.invalid_mac_address` (existing), `devices.invalid_app_type`, `devices.not_found` (activate unknown MAC), returned as `Result` | doc pattern |

## Old behaviour (for reference)

All three backends: MAC-only lookup, `toLowerCase()` only, no unique index, random 6-digit key without uniqueness, 7-day trial as a local `YYYY-MM-DD` string (Roku/iOS: unpadded `Y-M-D`, `is_trial = 1`), every unknown MAC a permanent `devices` row, cleanup crons delete expired trials after 6 months (ibo), 120 days (bob) or 400 days (cr), after which the MAC gets a fresh trial.

## Left to the builder

File layout inside `src/modules/devices/` following `src/modules/_template/`, mappers, test names, log wording of the CLI commands.
