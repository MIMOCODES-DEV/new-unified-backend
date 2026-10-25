# Data profile: `ibosol`

> Generated 2026-10-15 by `tools/legacy-analysis/profile-database.cjs` — read-only. Sensitive fields (MACs, emails, URLs, credentials, names, IPs…) show formats only, never values.

## Collections

| Collection | Documents | Indexes |
|---|---|---|
| `activationcontents` | 0 | _id_ |
| `admins` | 0 | _id_ |
| `blockedipaddresses` | 7 | _id_ |
| `coinlists` | 0 | _id_ |
| `contacts` | 0 | _id_ |
| `couponactivities` | 0 | _id_ |
| `coupons` | 0 | _id_ |
| `devices` | 3 | _id_, app_device_id_1 (unique), plan_id_1_user_id_1, recovery_code_1 |
| `domainmigrations` | 0 | _id_, from_host_1_to_host_1_kind_1 (unique), kind_1_status_1_last_confirmed_at_-1 |
| `faqs` | 0 | _id_ |
| `languages` | 0 | _id_ |
| `languagewords` | 0 | _id_ |
| `news` | 0 | _id_ |
| `notifications` | 0 | _id_ |
| `plans` | 3 | _id_ |
| `playlists` | 1 | _id_ |
| `privacycontents` | 0 | _id_ |
| `recaptchatokens` | 0 | _id_, token_1 (unique), createdAt_1 |
| `resellerpackages` | 0 | _id_ |
| `settings` | 0 | _id_ |
| `termscontents` | 0 | _id_ |
| `transactions` | 0 | _id_ |
| `users` | 0 | _id_, email_1 (unique), plans.plan_id_1 |
| `words` | 0 | _id_ |

## Checks

### devices
- Devices: **3**
- Same MAC (normalized) in several rows: **0 MACs**, 0 extra rows
- Same MAC + app type in several rows: **0**
- Rows on a fallback MAC (52:54:00:12:34:57, 52:54:00:12:34:59): **0**
- Rows without a usable MAC: 0
- Missing app_type: 0
- "Lifetime" (is_trial 2) with an expiry date in the past: **0 of 0**
- reseller_id types: missing 3

| is_trial / expiry | Devices |
|---|---|
| 0 / expired | 1 |
| 0 / future | 1 |
| 1 / expired | 1 |

### playlists
- Playlists: **1**
- Orphans (device_id points at no device): **0 (0.0%)**
- Without device_id: 0 · device_id types: string 1

### settings
- Keys: 0 · duplicated keys: **0**

### transactions
- Transactions: 0
- pay_time formats: 
- device_id holds: 

## `blockedipaddresses` · 7 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 7 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `count` | 100.0% | number 100.0% |  | `1` 7 |
| `ip` | 100.0% | string 100.0% | text 100.0% | hidden |
| `reason` | 100.0% | string 100.0% | text 100.0% | many |
| `time` | 100.0% | string 100.0% | datetime "YYYY-MM-DD HH:mm" 100.0% | `"2026-08-25 15:54"` 3, `"2026-08-25 15:48"` 2, `"2026-08-26 09:20"` 1, `"2026-08-26 09:22"` 1 |

## `devices` · 3 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `_id` | 100.0% | objectId 100.0% |  |  |
| `activated_by` | 100.0% | string 100.0% | text 100.0% | `"local-dashboard-test"` 3 |
| `app_type` | 100.0% | string 100.0% | text 100.0% | `"samsung"` 1, `"lg"` 1, `"android"` 1 |
| `created_time` | 100.0% | string 100.0% | datetime "YYYY-MM-DD HH:mm" 100.0% | `"2026-08-26 09:19"` 3 |
| `credit_count` | 100.0% | number 100.0% |  | `1` 3 |
| `device_key` | 100.0% | string 100.0% | integer-as-string 100.0% | hidden |
| `device_name` | 100.0% | string 100.0% | text 100.0% | many |
| `expire_date` | 100.0% | string 100.0% | date YYYY-MM-DD 100.0% | `"2026-11-24"` 1, `"2026-08-31"` 1, `"2026-08-16"` 1 |
| `ip` | 100.0% | string 100.0% | text 100.0% | hidden |
| `is_active` | 100.0% | number 100.0% |  | `1` 3 |
| `is_trial` | 100.0% | number 100.0% |  | `0` 2, `1` 1 |
| `mac_address` | 100.0% | string 100.0% | text 100.0% | hidden |
| `macAddress` | 100.0% | string 100.0% | text 100.0% | hidden |
| `multi_activate` | 100.0% | number 100.0% |  | `0` 3 |
| `plan_id` | 100.0% | objectId 100.0% |  |  |

## `plans` · 3 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 3 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `created_at` | 100.0% | date 100.0% |  |  |
| `description` | 100.0% | string 100.0% | text 100.0% | many |
| `name` | 100.0% | string 100.0% | text 100.0% | hidden |
| `number_of_devices` | 100.0% | number 100.0% |  | `1` 1, `3` 1, `5` 1 |
| `price` | 100.0% | number 100.0% |  | `5` 1, `10` 1, `18` 1 |
| `updated_at` | 100.0% | date 100.0% |  |  |

## `playlists` · 1 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 1 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `added_by` | 100.0% | null 100.0% |  | `null` 1 |
| `device_id` | 100.0% | string 100.0% | objectId-hex 100.0% | many |
| `epg_url` | 100.0% | string 100.0% | empty 100.0% | hidden |
| `is_protected` | 100.0% | number 100.0% |  | `0` 1 |
| `password` | 100.0% | string 100.0% | empty 100.0% | hidden |
| `pin` | 100.0% | string 100.0% | empty 100.0% | hidden |
| `playlist_name` | 100.0% | string 100.0% | integer-as-string 100.0% | hidden |
| `playlist_type` | 100.0% | string 100.0% | text 100.0% | `"general"` 1 |
| `url` | 100.0% | string 100.0% | url 100.0% | many |
| `username` | 100.0% | string 100.0% | empty 100.0% | hidden |
