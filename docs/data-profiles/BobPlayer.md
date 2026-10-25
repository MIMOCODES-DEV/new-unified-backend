# Data profile: `BobPlayer`

> Generated 2026-10-15 by `tools/legacy-analysis/profile-database.cjs` — read-only. Sensitive fields (MACs, emails, URLs, credentials, names, IPs…) show formats only, never values.

## Collections

| Collection | Documents | Indexes |
|---|---|---|
| `activationcontents` | 1 | _id_ |
| `admins` | 1 | _id_ |
| `blockedipadresses` | 66,996 | _id_ |
| `coinlists` | 5 | _id_ |
| `contacts` | 11,990 | _id_ |
| `countrycodes` | 0 | _id_ |
| `couponactivities` | 0 | _id_ |
| `coupons` | 0 | _id_ |
| `creditpackages` | 0 | _id_, credit_count_1 (unique) |
| `devices` | 237,397 | _id_, app_device_id_1 (unique), plan_id_1_user_id_1 |
| `faqs` | 1 | _id_ |
| `languages` | 14 | _id_ |
| `languagewords` | 2,657 | _id_ |
| `news` | 0 | _id_ |
| `notifications` | 1 | _id_ |
| `plans` | 0 | _id_ |
| `playlists` | 715,952 | _id_ |
| `privacycontents` | 1 | _id_ |
| `recaptchatokens` | 0 | _id_, token_1 (unique), createdAt_1 |
| `reselleractivities` | 0 | _id_ |
| `resellercodes` | 20 | _id_ |
| `resellercontents` | 0 | _id_ |
| `resellerlogos` | 0 | _id_ |
| `resellernotifications` | 0 | _id_ |
| `resellerpackages` | 0 | _id_ |
| `resellers` | 1 | _id_ |
| `settings` | 95 | _id_ |
| `termscontents` | 1 | _id_ |
| `transactions` | 24,786 | _id_ |
| `users` | 4 | _id_, email_1 (unique), plans.plan_id_1 |
| `verificationtokens` | 0 | _id_, created_at_1 |
| `words` | 160 | _id_ |

## Checks

### devices
- Devices: **237,397**
- Same MAC (normalized) in several rows: **2 MACs**, 2 extra rows
- Same MAC + app type in several rows: **1**
- Rows on a fallback MAC (52:54:00:12:34:57, 52:54:00:12:34:59): **1**
- Rows without a usable MAC: 0
- Missing app_type: 683
- "Lifetime" (is_trial 2) with an expiry date in the past: **23,185 of 95,404**
- reseller_id types: numeric-string 209,723, missing 26,766, number 781, objectId-string 127

| is_trial / expiry | Devices |
|---|---|
| 2 / expired | 23,185 |
| 2 / future | 72,219 |
| 3 / expired | 141,735 |
| 3 / future | 258 |

### playlists
- Playlists: **715,952**
- Orphans (device_id points at no device): **438,944 (61.3%)**
- Without device_id: 0 · device_id types: string 715,952

### settings
- Keys: 89 · duplicated keys: **2** (`trial_days` ×6, `phone_number` ×2)

### transactions
- Transactions: 24,786
- pay_time formats: datetime "YYYY-MM-DD HH:mm" 17,862, date YYYY-MM-DD 6,924
- device_id holds: device id (string) 17,862, missing 6,924

## `activationcontents` · 1 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 1 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `contents` | 100.0% | string 100.0% | text 100.0% | many |

## `admins` · 1 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 1 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `created_by` | 100.0% | string 100.0% | objectId-hex 100.0% | many |
| `email` | 100.0% | string 100.0% | email 100.0% | hidden |
| `id` | 100.0% | number 100.0% |  | `1` 1 |
| `is_admin` | 100.0% | number 100.0% |  | `1` 1 |
| `max_connections` | 100.0% | number 100.0% |  | `1000000000` 1 |
| `name` | 100.0% | string 100.0% | text 100.0% | hidden |
| `password` | 100.0% | string 100.0% | text 100.0% | many |

## `blockedipadresses` · 66,996 documents (field profile from a random sample of 50,000)

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 50,000 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `ip` | 100.0% | string 100.0% | text 100.0% | many |
| `reason` | 100.0% | string 100.0% | text 100.0% | many |
| `time` | 100.0% | string 100.0% | datetime "YYYY-MM-DD HH:mm" 100.0% | many |

## `coinlists` · 5 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 5 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `code` | 100.0% | string 100.0% | text 100.0% | hidden |
| `name` | 100.0% | string 100.0% | text 100.0% | many |

## `contacts` · 11,990 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 11,990 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `answered` | 100.0% | number 100.0% |  | hidden |
| `email` | 97.8% | string 100.0% | email 98.3%, text 1.1%, empty 0.5%, integer-as-string 0.0% | many |
| `message` | 97.8% | string 100.0% | text 95.9%, url 1.8%, integer-as-string 1.3%, empty 0.9% | many |
| `subject` | 97.8% | string 100.0% | text 96.4%, integer-as-string 1.4%, empty 1.3%, url 0.5% | many |
| `time` | 100.0% | string 100.0% | datetime "YYYY-MM-DD HH:mm" 100.0% | many |

## `devices` · 237,397 documents (field profile from a random sample of 50,000)

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 99.7% | number 100.0% |  | `0` 49,852 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `app_type` | 99.7% | string 100.0% | text 100.0% | `"samsung"` 25,371, `"lg"` 12,477, `"android"` 9,074, `"iOS"` 2,088, `"tvOS"` 613, `"macOS"` 229 |
| `created_time` | 0.2% | string 100.0% | datetime "YYYY-MM-DD HH:mm" 100.0% | many |
| `credit_count` | 99.7% | number 100.0% |  | `1` 49,794, `2` 58 |
| `device_key` | 100.0% | string 100.0% | integer-as-string 99.9%, text 0.1% | many |
| `expire_date` | 100.0% | string 100.0% | date YYYY-MM-DD 100.0% | many |
| `ip` | 99.7% | string 100.0% | text 100.0% | many |
| `is_trial` | 100.0% | number 100.0% |  | `3` 29,994, `2` 20,006 |
| `mac_address` | 100.0% | string 100.0% | mac aa:bb (lower) 100.0%, text 0.0% | many |
| `reseller_id` | 88.8% | string 99.7%, number 0.3% | integer-as-string 99.6%, objectId-hex 0.1% | many |

## `faqs` · 1 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 1 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `content` | 100.0% | string 100.0% | text 100.0% | many |

## `languages` · 14 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 14 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `code` | 100.0% | string 100.0% | text 100.0% | hidden |
| `name` | 100.0% | string 100.0% | text 100.0% | hidden |

## `languagewords` · 2,657 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 2,657 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `language_id` | 94.1% | string 100.0% | objectId-hex 100.0% | many |
| `value` | 100.0% | string 100.0% | text 100.0% | many |
| `word_id` | 100.0% | string 100.0% | objectId-hex 100.0% | many |

## `notifications` · 1 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 1 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `content` | 100.0% | string 100.0% | text 100.0% | many |
| `title` | 100.0% | string 100.0% | text 100.0% | many |

## `playlists` · 715,952 documents (field profile from a random sample of 50,000)

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 49,998 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `device_id` | 100.0% | string 100.0% | objectId-hex 100.0% | many |
| `epg_url` | 0.0% | string 100.0% | empty 100.0% | hidden |
| `is_protected` | 99.4% | number 100.0%, string 0.0% | empty 0.0% | `0` 27,589, `1` 22,121, `""` 12 |
| `password` | 0.0% | string 100.0% | empty 100.0% | hidden |
| `pin` | 99.4% | string 100.0% | empty 55.2%, integer-as-string 34.5%, text 10.2%, mac aabbcc (no separators) 0.0% | many |
| `playlist_name` | 100.0% | string 100.0% | text 98.2%, integer-as-string 1.4%, url 0.3%, mac aa:bb (lower) 0.0% | many |
| `playlist_type` | 0.0% | string 100.0% | text 100.0% | `"general"` 15 |
| `url` | 100.0% | string 100.0% | url 98.7%, text 1.1%, email 0.2%, integer-as-string 0.0% | many |
| `username` | 0.0% | string 100.0% | empty 100.0% | hidden |

## `privacycontents` · 1 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 1 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `contents` | 100.0% | string 100.0% | text 100.0% | many |

## `resellercodes` · 20 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 20 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `code` | 100.0% | string 100.0% | text 100.0% | hidden |
| `is_used` | 100.0% | number 100.0% |  | `0` 20 |
| `reseller_id` | 100.0% | string 100.0% | objectId-hex 100.0% | many |

## `resellers` · 1 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 1 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `email` | 100.0% | string 100.0% | email 100.0% | hidden |
| `max_connections` | 100.0% | number 100.0% |  | `20` 1 |
| `password` | 100.0% | string 100.0% | text 100.0% | many |
| `used_count` | 100.0% | number 100.0% |  | `0` 1 |

## `settings` · 95 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 95 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `key` | 100.0% | string 100.0% | text 100.0% | many |
| `value` | 96.8% | string 100.0% | text 64.1%, integer-as-string 30.4%, url 2.2%, json-like 1.1% | many |

## `termscontents` · 1 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 1 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `contents` | 100.0% | string 100.0% | text 100.0% | many |

## `transactions` · 24,786 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 24,786 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `amount` | 100.0% | number 100.0% |  | many |
| `device_id` | 72.1% | string 100.0% | objectId-hex 100.0% | many |
| `order_id` | 0.0% | string 100.0% | text 100.0% | many |
| `pay_time` | 100.0% | string 100.0% | datetime "YYYY-MM-DD HH:mm" 72.1%, date YYYY-MM-DD 27.9% | many |
| `payment_id` | 43.8% | string 100.0% | empty 70.6%, text 29.4% | `""` 7,667, `"order_id"` 3,187 |
| `payment_type` | 100.0% | string 100.0% | text 100.0% | `"paysky"` 7,667, `"opay"` 6,942, `"app_purchase"` 6,924, `"paypal"` 3,187, `"opay1"` 62, `"cashcall"` 3, `"geidea"` 1 |
| `status` | 100.0% | string 100.0% | text 100.0% | `"success"` 24,786 |
| `status_url` | 100.0% | string 100.0% | empty 100.0% | hidden |

## `users` · 4 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 4 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `created_at` | 100.0% | date 100.0% |  |  |
| `email` | 100.0% | string 100.0% | email 100.0% | many |
| `first_name` | 100.0% | string 100.0% | text 100.0% | hidden |
| `is_verified` | 100.0% | boolean 100.0% |  | `true` 2, `false` 2 |
| `last_name` | 100.0% | string 100.0% | text 100.0% | hidden |
| `password` | 100.0% | string 100.0% | text 100.0% | many |
| `plans` | 100.0% | array 100.0% |  |  |
| `resetToken` | 100.0% | null 100.0% |  | hidden |
| `resetTokenExpires` | 100.0% | null 100.0% |  | hidden |
| `verificationToken` | 100.0% | null 100.0% |  | hidden |
| `verified_at` | 100.0% | date 50.0%, null 50.0% |  | `null` 2 |

## `words` · 160 documents

| Field | Present | Types | String formats | Values |
|---|---|---|---|---|
| `__v` | 100.0% | number 100.0% |  | `0` 160 |
| `_id` | 100.0% | objectId 100.0% |  |  |
| `name` | 100.0% | string 100.0% | text 100.0% | many |
