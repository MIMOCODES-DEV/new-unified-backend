# Device core database schema

The six collections of the device core, agreed on 21 and 25 Oct 2026. They were built in **Phase 2 · Database** and are used by
**Phase 3 · Core features** and **Phase 4 · Moves and cleanup** ([ROADMAP.md](ROADMAP.md)). The rules each module builds on them are in [modules/](modules/).

[`schema.html`](schema.html) shows the old models (Device, SuspectDevice, PlayList, RecaptchaToken,
DomainMigration) next to these collections, with what moved and what was dropped. Open it in a browser.

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

## 1. The idea in one picture

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

## 2. `trialDevices`

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

## 3. `devices`

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
| `switch` | Object \| null | MAC switch history: from, to, when, how many, first MAC | `switched_to`, `switched_from`, `switched_date`, `origin_mac_address` |
| `recovery` | Object \| null | `{ code, expiresAt, enabled, recoveredFrom, recoveredAt }`: a code made on the website (paid devices only, 30 minutes, 8 characters) that moves this device to a new TV; the code is cleared once used | `recovery_code`, `…_expires_at`, `…_enabled`, `recovered_from`, `recovered_date` |
| `legacy` | Object | old brand, old `_id`, raw old fields | `_id`, `device_model`, `device_info` |
| `createdAt` | Date | | `created_time`, `createdAt` |
| `updatedAt` | Date | | `updatedAt` |

## 4. `licenses`

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
  So `expiresAt` is calculated when the row is created. (Under discussion: [DISCUSSIONS.md #6](DISCUSSIONS.md#6-stacking-yearly-licenses-and-what-a-revoke-takes-away).)
- **Revoking keeps the row.**
- **The state is worked out, never stored:** trial, yearly, lifetime, expired or revoked come from
  `trialEndsAt` or the current license. This replaces the old `is_trial` 0–3 number.

## 5. `playlists`

One collection for all kinds. Each row has a `type`, and only the part for that type is filled.

| Field | Type | Rule | From the old data |
|---|---|---|---|
| `_id` | String | new UUID | new id (old `_id` → `legacy.id`) |
| `deviceId` | String | the device in `trialDevices` or `devices`; indexed | `device_id` (text, no index today) |
| `name` | String | required, trimmed; **unique per device, case does not matter** (index `name_once_per_device`, decided 26 Oct) | `playlist_name` |
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
- A playlist name is unique per device ("My List" and "my list" are the same name); the same name on another device is fine. Older duplicates were renamed "Name (2)", "Name (3)" by migration `0007`.
- The status sync from the apps (old `PUT edit_playlist`) may change only `account` (status and expiry), for any playlist type.
- The demo playlist is **not a row**: it comes from brand config `app.demoUrl` when a device has none.

## 6. `captchas`

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

## 7. `domainMigrations`

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

## 8. SuspectDevice

Old ibo archive of expired trial devices, moved out of `devices` by an admin page to keep that table
small. Same fields as Device. **No collection in the new design**: its rows go to `trialDevices`, which
already holds every device that never paid.

## 9. Indexes

| Collection | Index | Why |
|---|---|---|
| `trialDevices`, `devices` | `macAddress` unique | one device per MAC (within the collection) |
| `trialDevices`, `devices` | `appDeviceId` unique, partial (only when set) | devices without a usable MAC |
| `trialDevices`, `devices` | `uid` (partial) | V4 lookups |
| `trialDevices` | `trialEndsAt` + `playlistCount` | the cleanup job |
| `devices` | `currentLicenseId` | |
| `devices` | `recovery.code` unique, partial (only when set) | a recovery code belongs to one device and finds it (migration 0008) |
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
needs its own rule, rule **UNQ**: the Redis lock on the MAC, with no extra collection ([modules/devices.md](modules/devices.md#one-mac-one-device-unq)).

## 10. What was dropped or moved

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
| `recaptcha_code`, `recaptcha_verified`, `recaptcha_requested_at` | `captchas` (§6) |
| `user_id`, `plan_id`, `pre_plan_*` | customers / subscriptions (later phase) |
| `migrated_*` (8 fields) | central licenseTransfers, deviceRegistry (later phase) |
| `device_name` | customers (later phase) |
| old `SuspectDevice` rows | `trialDevices` (§8) |
| old revoked devices (`is_trial` 1) | `trialDevices` |

## 11. Decisions behind the schema

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
- `captchas` and `domainMigrations` as in §6 and §7 (25 Oct).
- A provider move shows up for approval after 3 confirmations from different IPs (25 Oct).
