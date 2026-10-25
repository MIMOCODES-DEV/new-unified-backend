# Data profiles (CAP-06)

> Generated 2026-10-15 from the **local sample databases** with `tools/legacy-analysis/profile-database.cjs` (read-only; sensitive fields show formats only, never values).
> Rerun: `node tools/legacy-analysis/profile-database.cjs "mongodb://127.0.0.1:27017/?directConnection=true" docs/data-profiles BobPlayer cr7 …`
> **Sample data, not production.** Formats and quirks are produced by the code, so they exist in production too; counts and percentages describe the sample only.

| Database | Source | Devices | Notes |
|---|---|---|---|
| [BobPlayer](BobPlayer.md) | bobplayer-backend | 237,397 | The only large sample: 716k playlists, 24.8k transactions, 67k blocked-IP rows |
| [cr7](cr7.md), [messi](messi.md), [duplex](duplex.md), [family](family.md), [ibosol](ibosol.md), [ibostb](ibostb.md), [king4k](king4k.md), [virginia](virginia.md), [alltv](alltv.md), [cr](cr.md) | cr-unified-backend (one DB per brand) | 1–8 each | Dev data: shapes only |
| [bob](bob.md), [ibox](ibox.md), [smart](smart.md) | cr-unified-backend | 0 | Empty collections: the schema only |
| — | iboplayer-backend | — | **No local ibo database.** ibo shapes must come from a production copy (cutover prep) |

Not profiled: `central`, `orbit`, `app` belong to a different project on the same server.

## Findings (BobPlayer)

| Finding | Number | Consequence for the new backend |
|---|---|---|
| Orphan playlists (device deleted, playlists left) | **438,944 of 715,952 (61.3%)** | Migration drops them and reports the count; cleanup jobs delete by the correct key |
| Index on `playlists.device_id` | **none** — only `_id` | Every playlist lookup scans 716k rows today; new `playlists.deviceId` is indexed by migration |
| `playlists.device_id` type | string 100% (not ObjectId) | Migration converts to ObjectId |
| "Lifetime" licenses (`is_trial` 2) with an expiry in the past | **23,185 of 95,404** | Licensing must read them exactly as bob does today (decision per old backend, PLAN §5.3) |
| `is_trial` values in data | only 2 (lifetime) and 3 (yearly); 0 and 1 never stored | Mapping table in PLAN §5.3 holds; 0/1 rules still needed for ibo and cr |
| Duplicate MACs (normalized) | 2 MACs, 2 extra rows | Few in this sample; the unique-MAC index and merge rules still apply |
| Rows on a fallback MAC | 1 | Confirms the fallback-MAC case exists in data (DEV-10) |
| `app_type` | `samsung`, `lg`, `android`, **`iOS`, `tvOS`, `macOS`** (mixed case); 683 missing | Normalize to lowercase enum; missing → `unknown` + report |
| `reseller_id` | numeric string 209,723 · missing 26,766 · number 781 · ObjectId string 127 | Four kinds of value: map to central resellers via `legacyRefs` |
| `mac_address` format | lowercase `aa:bb:…` (100% in sample) | Already normalized in bob; ibo/cr still need the normalizer |
| `expire_date` | string `YYYY-MM-DD` (100%) | Parse to UTC Date, end of day |
| `device_key` | numeric string 99.9%, text 0.1% | Keep as string; the 0.1% must still log in |
| `created_time` | present on **0.2%** of devices | Creation date unknown for 99.8% — use ObjectId timestamp |
| Settings duplicates | `trial_days` ×6, `phone_number` ×2 | Resolve to the value the old code reads; report the rest |
| Transactions without `device_id` | **6,924** — all with date-only `pay_time` | These match the 6,924 `app_purchase` rows: purchases trusted from the app, not linked to a device |
| `pay_time` formats | `YYYY-MM-DD HH:mm` 17,862 · `YYYY-MM-DD` 6,924 | Two formats to parse |
| Unique index on `devices.app_device_id` | present | Kept; becomes `appDeviceId` sparse unique |
