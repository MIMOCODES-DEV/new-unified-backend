# Data profile: `cr`

> Generated 2026-10-15 by `tools/legacy-analysis/profile-database.cjs` — read-only. Sensitive fields (MACs, emails, URLs, credentials, names, IPs…) show formats only, never values.

## Collections

| Collection | Documents | Indexes |
|---|---|---|
| `activationcontents` | 0 | _id_ |
| `admins` | 0 | _id_ |
| `blockedipaddresses` | 0 | _id_ |
| `coinlists` | 0 | _id_ |
| `contacts` | 0 | _id_ |
| `couponactivities` | 0 | _id_ |
| `coupons` | 0 | _id_ |
| `devices` | 1 | _id_, app_device_id_1 (unique), plan_id_1_user_id_1 |
| `faqs` | 0 | _id_ |
| `languages` | 0 | _id_ |
| `languagewords` | 0 | _id_ |
| `news` | 0 | _id_ |
| `notifications` | 0 | _id_ |
| `plans` | 0 | _id_ |
| `playlists` | 0 | _id_ |
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
- Devices: **1**
- Same MAC (normalized) in several rows: **0 MACs**, 0 extra rows
- Same MAC + app type in several rows: **0**
- Rows on a fallback MAC (52:54:00:12:34:57, 52:54:00:12:34:59): **0**
- Rows without a usable MAC: 0
- Missing app_type: 0
- "Lifetime" (is_trial 2) with an expiry date in the past: **0 of 0**
- reseller_id types: numeric-string 1

| is_trial / expiry | Devices |
|---|---|
| 0 / expired | 1 |

### playlists
- Playlists: **0**
- Orphans (device_id points at no device): **0 (—)**
- Without device_id: 0 · device_id types: 

### settings
- Keys: 0 · duplicated keys: **0**

### transactions
- Transactions: 0
- pay_time formats: 
- device_id holds: 

## `devices` · 1 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `_id` | 100.0% | objectId 100.0% |  |  |
| `activated_by` | 100.0% | string 100.0% | text 100.0% | `"admin"` 1 |
| `apiVersion` | 100.0% | string 100.0% | text 100.0% | `"1.0.0"` 1 |
| `app_device_id` | 100.0% | string 100.0% | text 100.0% | `"DEVICE-123456"` 1 |
| `app_type` | 100.0% | string 100.0% | text 100.0% | `"android"` 1 |
| `created_time` | 100.0% | string 100.0% | datetime "YYYY-MM-DD HH:mm" 100.0% | `"2025-01-01 10:00:00"` 1 |
| `credit_count` | 100.0% | number 100.0% |  | `1` 1 |
| `device_key` | 100.0% | string 100.0% | integer-as-string 100.0% | hidden |
| `device_name` | 100.0% | string 100.0% | text 100.0% | hidden |
| `expire_date` | 100.0% | string 100.0% | date YYYY-MM-DD 100.0% | `"2026-01-01"` 1 |
| `ip` | 100.0% | string 100.0% | text 100.0% | hidden |
| `is_automatic_saved` | 100.0% | number 100.0% |  | `1` 1 |
| `is_trial` | 100.0% | number 100.0% |  | `0` 1 |
| `mac_address` | 100.0% | string 100.0% | mac aa:bb (lower) 100.0% | hidden |
| `multi_activate` | 100.0% | number 100.0% |  | `0` 1 |
| `origin_mac_address` | 100.0% | string 100.0% | empty 100.0% | hidden |
| `parent_pin` | 100.0% | string 100.0% | integer-as-string 100.0% | hidden |
| `plan_id` | 100.0% | objectId 100.0% |  |  |
| `recaptcha_code` | 100.0% | string 100.0% | text 100.0% | hidden |
| `reseller_id` | 100.0% | string 100.0% | integer-as-string 100.0% | `"123"` 1 |
| `switched_date` | 100.0% | string 100.0% | empty 100.0% | `""` 1 |
| `switched_from` | 100.0% | string 100.0% | empty 100.0% | `""` 1 |
| `switched_to` | 100.0% | string 100.0% | empty 100.0% | `""` 1 |
| `user_id` | 100.0% | objectId 100.0% |  | hidden |
