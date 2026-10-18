# Data profile: `cr7`

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
| `devices` | 8 | _id_, macAddress_1 (unique), app_device_id_1 (unique), plan_id_1_user_id_1, userId_1_isActive_1, recovery_code_1 |
| `domainmigrations` | 0 | _id_, from_host_1_to_host_1_kind_1 (unique), kind_1_status_1_last_confirmed_at_-1 |
| `faqs` | 0 | _id_ |
| `languages` | 0 | _id_ |
| `languagewords` | 0 | _id_ |
| `news` | 0 | _id_ |
| `notifications` | 0 | _id_ |
| `plans` | 3 | _id_ |
| `playlists` | 0 | _id_, userId_1, hostId_1 |
| `privacycontents` | 0 | _id_ |
| `recaptchatokens` | 0 | _id_, token_1 (unique), createdAt_1 |
| `resellerpackages` | 0 | _id_ |
| `settings` | 0 | _id_ |
| `subscriptions` | 0 | _id_, name_1 (unique), userId_1_status_1_expiresAt_1, expiresAt_1, isTrial_1, userId_1_isCurrent_1 |
| `syncjobs` | 0 | _id_, playlistId_1_type_1 |
| `termscontents` | 0 | _id_ |
| `transactions` | 0 | _id_, userId_1, userId_1_createdAt_-1, subscriptionId_1, type_1_subscriptionId_1 |
| `users` | 6 | _id_, email_1 (unique), plans.plan_id_1 |
| `words` | 0 | _id_ |

## Checks

### devices
- Devices: **8**
- Same MAC (normalized) in several rows: **0 MACs**, 0 extra rows
- Same MAC + app type in several rows: **0**
- Rows on a fallback MAC (52:54:00:12:34:57, 52:54:00:12:34:59): **0**
- Rows without a usable MAC: 5
- Missing app_type: 5
- "Lifetime" (is_trial 2) with an expiry date in the past: **0 of 0**
- reseller_id types: missing 8

| is_trial / expiry | Devices |
|---|---|
| 0 / expired | 1 |
| 0 / future | 1 |
| 1 / expired | 1 |
| missing / no expiry | 5 |

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

## `devices` · 8 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 75.0% | number 100.0% |  | `0` 6 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `activated_by` | 37.5% | string 100.0% | text 100.0% | `"local-dashboard-test"` 3 |
| `app_type` | 37.5% | string 100.0% | text 100.0% | `"samsung"` 1, `"lg"` 1, `"android"` 1 |
| `created_time` | 37.5% | string 100.0% | datetime "YYYY-MM-DD HH:mm" 100.0% | `"2026-08-25 15:16"` 3 |
| `createdAt` | 62.5% | date 100.0% |  |  |
| `credit_count` | 37.5% | number 100.0% |  | `1` 3 |
| `deletion_at` | 12.5% | null 100.0% |  | `null` 1 |
| `device_key` | 37.5% | string 100.0% | integer-as-string 100.0% | hidden |
| `device_name` | 37.5% | string 100.0% | text 100.0% | hidden |
| `deviceModel` | 62.5% | string 100.0% | text 100.0% | `"Soap"` 3, `"Chair"` 1, `"Shirt"` 1 |
| `expire_date` | 37.5% | string 100.0% | date YYYY-MM-DD 100.0% | `"2026-11-23"` 1, `"2026-08-30"` 1, `"2026-08-15"` 1 |
| `ip` | 37.5% | string 100.0% | text 100.0% | hidden |
| `ipAddress` | 62.5% | string 100.0% | text 100.0% | many |
| `is_active` | 37.5% | number 100.0% |  | `1` 3 |
| `is_trial` | 37.5% | number 100.0% |  | `0` 2, `1` 1 |
| `isActive` | 62.5% | boolean 100.0% |  | `true` 4, `false` 1 |
| `isGuest` | 62.5% | boolean 100.0% |  | `false` 5 |
| `mac_address` | 37.5% | string 100.0% | mac aa:bb (lower) 100.0% | hidden |
| `macAddress` | 100.0% | string 100.0% | mac aa:bb (lower) 100.0% | hidden |
| `multi_activate` | 37.5% | number 100.0% |  | `0` 3 |
| `old_plan_id` | 12.5% | null 100.0% |  | `null` 1 |
| `parent_pin` | 12.5% | string 100.0% | integer-as-string 100.0% | hidden |
| `pending_deletion` | 12.5% | boolean 100.0% |  | `false` 1 |
| `plan_id` | 37.5% | objectId 100.0% |  |  |
| `platform` | 62.5% | string 100.0% | text 100.0% | `"Android App"` 3, `"Web Browser"` 1, `"iOS App"` 1 |
| `pre_plan_expire_date` | 12.5% | null 100.0% |  | `null` 1 |
| `pre_plan_is_trial` | 12.5% | null 100.0% |  | `null` 1 |
| `recaptcha_verified` | 12.5% | boolean 100.0% |  | `false` 1 |
| `recovery_code_enabled` | 12.5% | boolean 100.0% |  | hidden |
| `tokenVersion` | 62.5% | number 100.0% |  | hidden |
| `updatedAt` | 62.5% | date 100.0% |  |  |
| `userAgent` | 62.5% | string 100.0% | text 100.0% | many |

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

## `users` · 6 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 6 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `autoRenewal` | 100.0% | boolean 100.0% |  | `true` 6 |
| `blacklist` | 100.0% | array 100.0% |  |  |
| `createdAt` | 100.0% | date 100.0% |  |  |
| `email` | 100.0% | string 100.0% | email 100.0% | many |
| `isActive` | 100.0% | boolean 100.0% |  | `true` 4, `false` 2 |
| `isVerified` | 100.0% | boolean 100.0% |  | `true` 4, `false` 2 |
| `movieTasteProfile` | 100.0% | object 100.0% |  |  |
| `movieTasteProfile.topActors` | 100.0% | array 100.0% |  |  |
| `movieTasteProfile.topCountries` | 100.0% | array 100.0% |  |  |
| `movieTasteProfile.topGenres` | 100.0% | array 100.0% |  |  |
| `name` | 100.0% | string 100.0% | text 100.0% | hidden |
| `password` | 100.0% | string 100.0% | text 100.0% | many |
| `refreshToken` | 100.0% | null 100.0% |  | hidden |
| `resetPasswordExpires` | 100.0% | null 100.0% |  | hidden |
| `resetPasswordOtp` | 100.0% | null 100.0% |  | hidden |
| `resetPasswordToken` | 100.0% | null 100.0% |  | hidden |
| `seriesTasteProfile` | 100.0% | object 100.0% |  |  |
| `seriesTasteProfile.topActors` | 100.0% | array 100.0% |  |  |
| `seriesTasteProfile.topCountries` | 100.0% | array 100.0% |  |  |
| `seriesTasteProfile.topGenres` | 100.0% | array 100.0% |  |  |
| `subscription` | 100.0% | null 100.0% |  | `null` 6 |
| `updatedAt` | 100.0% | date 100.0% |  |  |
| `verificationExpires` | 100.0% | null 100.0% |  | `null` 6 |
| `verificationOtp` | 100.0% | null 100.0% |  | `null` 6 |
| `walletBalance` | 100.0% | number 100.0% |  | `0` 6 |
