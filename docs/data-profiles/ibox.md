# Data profile: `ibox`

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
| `devices` | 0 | _id_, app_device_id_1 (unique), plan_id_1_user_id_1, recovery_code_1 |
| `domainmigrations` | 0 | _id_, from_host_1_to_host_1_kind_1 (unique), kind_1_status_1_last_confirmed_at_-1 |
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
- Devices: **0**
- Same MAC (normalized) in several rows: **0 MACs**, 0 extra rows
- Same MAC + app type in several rows: **0**
- Rows on a fallback MAC (52:54:00:12:34:57, 52:54:00:12:34:59): **0**
- Rows without a usable MAC: 0
- Missing app_type: 0
- "Lifetime" (is_trial 2) with an expiry date in the past: **0 of 0**
- reseller_id types: 

| is_trial / expiry | Devices |
|---|---|

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
