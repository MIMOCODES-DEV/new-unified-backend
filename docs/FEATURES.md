# Feature Catalogue (merged from the 3 old backends)

> Source: survey of `iboplayer-backend` (ibo), `bobplayer-backend` (bob), `cr-unified-backend` (cr) on 2026-10-13.
> Purpose: the list of **features** the new backend must provide. Each feature is rebuilt cleanly from its intent — the old code is a reference for *what* it does, never for *how*.
> Columns: ✅ present · — absent · (x) partial/broken.
> The detailed per-route contract for legacy device protocols is produced in task `LEG-01` (see TASKS.md).

---

## 1. Tenancy & platform

| Feature | ibo | bob | cr | Notes for rebuild |
|---|---|---|---|---|
| Host → app resolution | 7 domains, 1 app | 1 app | ~13 apps, substring + hardcoded rules | Exact host list per tenant in central registry; unknown host rejected |
| One DB per app | — | — | ✅ | Central DB + tenant DB |
| Per-app behaviour switches | settings `*_android_enabled`, `enable_old_only_samsung` | — | `if (tenant === ...)` branches | Typed tenant config / feature flags, never slug checks |
| Settings key/value store | ✅ | ✅ | ✅ | Typed `tenantConfig` doc + encrypted `tenantSecrets` |
| Settings/languages cache | per worker | per worker | per worker | Redis cache + pub/sub invalidation |
| CORS allowlist | — | — | hardcoded | Per-tenant config |

## 2. Device identity & licensing (core domain)

| Feature | ibo | bob | cr |
|---|---|---|---|
| Auto-register unknown MAC with trial (`trial_days`) | ✅ | ✅ | ✅ |
| Device key (6-digit) for website login, regenerate | ✅ | ✅ | ✅ |
| `u_id` identity (6 chars) + captcha-gated registration (V4) | ✅ | ✅ | ✅ |
| UID-recovery captcha when `u_id` mismatches | ✅ | ✅ | ✅ |
| License states: trial / yearly / lifetime / expired / revoked (old `is_trial` 0–3) | ✅ | ✅ | ✅ |
| Multi-activate flag, credit count | ✅ | ✅ | ✅ |
| MAC switch (move license to another MAC; `switched_from/to`) | ✅ | ✅ | ✅ |
| Recovery code (generate on site, apply on new MAC; old MAC `pending_deletion` 30d) | ✅ | apply only | ✅ |
| Parent PIN (set/change) + PIN-protected playlists | ✅ | ✅ | ✅ |
| Random MAC from `app_device_id` (devices with no MAC) | ✅ | ✅ | ✅ |
| Adopt/dedupe device rows stored under wrong `app_type` | ✅ | ✅ | ✅ |
| "V4 lock" — device that used V4 is refused by legacy routes | — | ✅ | ✅ |
| Store-review bypass (lifetime for a specific test build on Samsung/LG/Vidaa/Windows) | ✅ | ✅ | (dead flags) |
| Old/expired device cleanup | 6 months | 120 days | 400 days | → replaced by pending-devices TTL + correct cleanup |
| Suspect-device quarantine / restore | ✅ | — | — | → replaced by pending/quarantine design |

## 3. Playlists

| Feature | ibo | bob | cr |
|---|---|---|---|
| Kinds: general M3U, Xtream (host/user/pass), Stalker portal (+ portal MAC, fallback portal), code | ✅ | ✅ | ✅ |
| CRUD from app / website / store / admin | ✅ | ✅ | ✅ |
| Bulk upsert by MAC (`update_playlist`) | ✅ | ✅ | ✅ |
| PIN protection per playlist | ✅ | ✅ | ✅ |
| Provider branding (logo, contact, whatsapp, email) | ✅ | ✅ | ✅ |
| Response shaping: Xtream-parsed vs general vs raw (per app/version/tenant) | ✅ | ✅ | ✅ |
| Demo playlist when none | ✅ | ✅ | ✅ |
| Backup DNS / `backup_urls[]` (≤8) | — | — | ✅ |
| Learned domain migrations (≥3 distinct devices confirm host move, 90d expiry, ≤3 hops) | — | — | ✅ |
| Bulk domain rewrite for a provider (store) + count | ✅ | ✅ | ✅ |
| Add playlist via QR code (captcha, no login) | ✅ | — | — |
| Check a playlist URL (`/frontend/check-playlist`) | — | — | ✅ (SSRF — add guard) |

## 4. Device API protocol families (old apps — wire format must be kept)

| Family | Routes (prefix `/api`) | Wire scheme | ibo | bob | cr |
|---|---|---|---|---|---|
| Legacy TV (Samsung/LG) | `playlist_info`, `playlist_list`, `update_playlist`, `check-activation-code`, `changeParentPin`, `check_active_status` | obfuscated envelope | ✅ | ✅ | ✅ |
| Legacy plain GET | `GET playlist_information/:mac/:app_type?` | plain | ✅ | — | — |
| Legacy Android AES | `POST playlist_information` | AES old key | ✅ | ✅ | — |
| Signed Android V2 | `/MBBPj5UwlCmTstXGb/android/playlist_information`, `/manage/{add,update,delete}_playlist` | AES new + HMAC | ✅ | ✅ | ✅ |
| Signed TV alias | `/Mxcvfghytrhjsjj/tv/playlist_information` | AES new + HMAC | — | ✅ | — |
| Signed TV V3 | `/MBBPj5UwlCmTstXGb/tv/v3/playlist_information` | AES V3 + HMAC + `u_id` HMAC-SHA1 | ✅ | ✅ | — |
| Signed Android V3 | `/MBBPj5UwlCmTstXGb/android/v3/playlist_information` | AES V3 + HMAC | ✅ | — | — |
| Smart TV | `device_info` | envelope | — | — | ✅ |
| TV V4 | `tv/v4/playlist_info` | static bearer `TV_KEY_V4` | — | — | ✅ |
| Roku | `device_login`, `register_device`, `validate_status`, `activate_free_trial`, `playlist`, `languages`, `translations`, `app_info` | plain JSON + XOR token | ✅ | ✅ | ✅ |
| iOS v2 / Android v2 | `/{ios,android}/v2/{device_login,reset_uid,validate_status,playlist,languages,translations}` | XOR token | ✅ | iOS only | — |
| iOS v3 / Android v3 | same set + `generate_captcha`, `delete-playlist` | XOR token | — | — | ✅ |
| V4 any-device (13 app types) | `/{type}/v4/{recaptcha,device_login,device_info,manage/*,check_update,apply_recovery,device/add,sportsdb}` + `ios/v4/apple_purchase` | envelope + XOR bearer | ✅ (12 types) | ✅ (12) | ✅ (13 + sportsdb + apple) |
| Recovery V3 | `tv/v3/recover-summary`, `recover-my-device` | — | — | — | ✅ |
| Misc | `status_check`, `app/version`, `get_app_setting/:mac`, `device/check-activate` (captcha), `v4/recaptcha` | — | ✅ | ✅ | ✅ |

## 5. Store & partner integrations

| Feature | ibo | bob | cr |
|---|---|---|---|
| Store API (`token` header): `validate-mac-address`, `save-device-activation`, `save-play-list`, `delete-playlist`, `delete-playlist-by-id`(cr), `reset-playlist`, `update-domain`, `count-domain-updates`, `switch-mac-address` | ✅ | ✅ | ✅ |
| License transfer protocol (via `save-device-activation`) | ✅ | ✅ | ✅ |
| Mimo Store / MDLS order + signed callback | ✅ | ✅ | ✅ |
| `PLATFORM_KEY` APIs: reseller notification CRUD, `transfer-device-app` (cross-app transfer) | — | — | ✅ |
| Old partner API with hardcoded token: `checkDeviceStatusFromExternal`, `activateWithCouponFromExternal` | ✅ | ✅ | (not routed) |
| Admin-token external links: `get-available-connections/:id/:token`, `activate/:mac/:credits/:id/:token` | (commented) | ✅ | ✅ |
| Cross-app import: bob ← ibo, cr ← ibo/bob (HTTP polling) | — | ✅ | ✅ | → internal lookup via central `deviceRegistry` |
| StarArcs device registration proxy (`/{type}/v4/device/add`) | ✅ | ✅ | ✅ |
| SportsDB v2 mirror with cache | — | — | ✅ |
| Apple IAP (App Store Server API) | — | — | ✅ |

## 6. Customer website (backend becomes API-only; UIs are separate SPAs)

| Feature | ibo | bob | cr |
|---|---|---|---|
| Device login (MAC + device key + captcha) → JWT | ✅ | ✅ (session) | ✅ |
| Manage playlists, device key, UID, parent PIN, MAC switch, recovery code | ✅ | ✅ | ✅ |
| Pay to activate device (choose provider) | ✅ | ✅ | ✅ |
| MAC-only playlist add/delete (no login) | — | — | ✅ |
| Customer accounts: signup, verify email, login, password reset, change password | — | — | ✅ |
| Plans: buy multi-device plan, assign/remove/select devices, rename device | — | — | ✅ |
| Activation-code portal (customer buys credits, generates codes) | ✅ | — | — |
| Coupons: buy coupon (credits, emailed), activate MAC with coupon | (commented) | ✅ | ✅ |
| Become a reseller: buy reseller package → account created + emailed | ✅ | ✅ | ✅ |
| Public content: news, FAQ, terms, privacy, contact form, SEO meta | ✅ | ✅ | ✅ |
| Public device status check (captcha) | ✅ | — | — |

## 7. Resellers, credits, codes, coupons

| Feature | ibo | bob | cr |
|---|---|---|---|
| Admin-type resellers (`Admin.is_admin=0`, `max_connections` credits, sub-resellers) | ✅ | ✅ | ✅ |
| Separate Reseller model + panel (`/reseller`): activate device, activity log | — | ✅ | ✅ |
| Activation codes (ibo ActivationCode / ResellerCode), redeem on TV | ✅ | ✅ | ✅ |
| Code usage history (assign, IP) | ✅ | — | — |
| Reseller logo + notification shown in app | — | ✅ | ✅ (via PLATFORM_KEY) |
| Credit packages (credits → duration), credit price packages (price → credits), reseller packages | ✅ | ✅ | ✅ |
| Activation pricing: 1 credit = 1 year, 2 credits = lifetime | ✅ | ✅ | ✅ |

→ New: **one central reseller identity, one wallet (ledger) usable in all apps**.

## 8. Payments

| Provider | ibo | bob | cr | Callback route(s) |
|---|---|---|---|---|
| PayPal (device + reseller) | ✅ | ✅ | ✅ | `/paypal/order/create`, `/capture/:id`, `/paypal/resellerOrder*` |
| Stripe | ✅ | ✅ | ✅ | `/stripe/success`, `/stripe/cancel` |
| Paymob | ✅ | ✅ | ✅ | `/api/paymob_webhook` |
| PaySky | ✅ | ✅ | ✅ | `/generatePayskyTransactionID`, `/checkPayskyTransaction` |
| Opay / Opay1 | ✅ | ✅ | ✅ | `/api/opaySuccessCallback` |
| MDLS / Mimo Store | ✅ | ✅ | ✅ | `/api/mimoStoreCallback` |
| Telr | ✅ | ✅ | — | `/activation/telr/*`, `/api/telrSuccessCallback` |
| PayEG | ✅ | ✅ | — | `/api/payegSuccessCallback` |
| Geidea | ✅ | ✅ | — | `/api/geideaSuccessCallback` |
| Cowpay | ✅ | settings only | — | `/cowpay/checkout/...`, `/api/cowpaySuccessCallback`, `/api/cowpayReturnUrl` |
| Cashcall | — | ✅ | — | `/api/cashcallSuccessCallback` |
| CoinPayments (crypto) | ✅ | ✅ | ✅ | `/api/crypto-ipn-url/:id`, `/activation/crypto/*` |
| Paymentwall | ✅ | (x) | ✅ | `/api/paymentwall_callback` |
| Apple IAP | — | — | ✅ | `ios/v4/apple_purchase` |
| `app_purchase` (trusts client) / `google_pay` (stub) | ✅ | ✅ | ✅ | **do not rebuild as-is**: replace by verified Google Play / disable |
| Shared: payment status page, currency conversion EUR→EGP (one job), payment visibility toggles | ✅ | ✅ | ✅ | |

Payment purposes: device activation, plan purchase (cr), coupon/credit purchase, reseller package purchase.

## 9. Admin (becomes Admin API for a new SPA)

Dashboard stats · devices list/detail/edit/activate · playlists · transactions (+crypto) · CMS (terms, privacy, news, FAQ, activation/reseller page content, SEO, contact/social) · i18n editor (languages, words, translations) · app config (themes/backgrounds, demo URL, trial days, price, notification + interval) · payment provider settings & visibility · currency API key · plans (cr) · reseller packages, credit packages, credit price packages · resellers CRUD · coupons CRUD + activity + deactivate device · contact inbox · Android apps / app versions / update settings · old-API toggles (ibo) · fake-device review + IP review (→ abuse review) · audit log (new).

## 10. Abuse protection (rebuild per PLAN §6)

Old: ASN block (`cf-asn`, default 62513), per-IP request limit (50/min → 4h block), unique-MACs-per-IP (6–35) → Cloudflare permanent block + **device deletion**, sequential-MAC detection, admin-path probing block, LG/Samsung review IP allowlist, maintenance mode.
New: Redis rate limits, pending devices + TTL, quarantine, Cloudflare IP Lists with expiry, admin review — never deletion.

## 11. Background jobs

Captcha cleanup · settings/translations cache refresh · currency rates · old device cleanup (→ replaced) · domain-migration cache refresh (cr) · counter resets (→ Redis TTL) · Cloudflare block push (→ abuse module) · pending-transaction cleanup · recovery `pending_deletion` purge (missing today).

## 12. App updates & content delivered to apps

AndroidApp (per `package_id`) + AppVersion + global Android update settings → `check_update`, `app/version` · notification popup (global / per reseller) · themes · languages/translations · `app_info` branding (Roku, hardcoded → config) · hosted LG/Samsung TV web bundle (bob `public/app_src_min`, loaded by TVs by URL → **static paths are a contract**).

## 13. Not rebuilt (test, debug, one-off, unsafe)

PHP import/wipe routes (`*FromPHP`, `getPlaylistsFromPhp`), `clearLanguageWord`, `saveCountryCode`, `removeDuplicatedMacAddress`, `convertAllMacToLowerCase`, `fixPaymentTime`, `create-reseller-coupon`, `activateOpayDevices`, `/test`, `/email-test`, `*-test` pages, `get_ip_request_count`, `test-block-ip/:ip`, `get_non_mac_addresses`, `get-samsung-active-users`, hardcoded test-MAC wipes, dead `*Old` handlers, root mongosh scripts, `clean_android_fake.js`, `seed*.js`, cPanel `iboplayer/` folder.
