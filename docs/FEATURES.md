# Feature Catalogue (merged from the 3 old backends)

> Sources: survey of `iboplayer-backend` (ibo), `bobplayer-backend` (bob), `cr-unified-backend` (cr) on 2026-10-13; the 14 October code audit (*Combined Backend Features* slides); every row where the two disagreed was re-checked in the code on 2026-10-14.
> Purpose: the list of **features** the new backend must provide. Each feature is rebuilt cleanly from its intent — the old code is a reference for *what* it does, never for *how*.
> Legend: ✅ yes · (x) partial / broken · — no. † = taken from the 14 October audit, not re-checked.
> Which routes real clients (website, BobPlayer, CRPlayer) call: [`inventory/client-usage.md`](inventory/client-usage.md).
> Code that nothing can reach (dead handlers, commented-out routes, unused packages) is listed in [`inventory/old-backends-unused.md`](inventory/old-backends-unused.md).

---

## 0. Size of the old backends

| | ibo | bob | cr |
|---|---|---|---|
| Server JavaScript, lines (no views, no static files) | 21k | 16k | 26k |
| …including EJS views | 32k | 26k | 37k |
| Route definitions in code: live / commented out | 283 / 16 | 261 / 4 | 304 / 8 |
| Live URLs, with V4 routes counted once per app type | 393 (12 types) | 371 (12) | 460 (13) |

The V4 routes are written once in a loop over the app types, so 10 lines of code become ~120 URLs. "Live URLs" is the number that matters for "what must the new backend answer". Views are not rebuilt (the backend becomes API-only).

## 1. Tenancy & platform

| Feature | ibo | bob | cr | Notes for rebuild |
|---|---|---|---|---|
| Brands served | 1 brand, 7 domains (+ `iboproplayertv.com`, seen in the IBO website and TV bundles) | 1 brand | ~13 brands | |
| Host → app resolution | (x) host-gated routes | — | (x) substring + hardcoded rules; unknown host → cr7 | Exact host list per tenant in central registry; unknown host rejected |
| One DB per app | — | — | ✅ | Central DB + tenant DB |
| Per-app behaviour switches | (x) settings `*_android_enabled`, `enable_old_only_samsung` | — | (x) `if (tenant === ...)` branches | Typed tenant config / feature flags, never slug checks |
| Settings key/value store | ✅ | ✅ | ✅ | Typed `tenantConfig` doc + encrypted `tenantSecrets` |
| Settings/languages cache | (x) per worker | (x) per worker | (x) per worker | Redis cache + pub/sub invalidation |
| CORS allow-list | — (open to all; list commented out) | — (open to all) | (x) hardcoded list | Per-tenant config |
| Admin panel can be switched off per instance (`ADMIN_ENABLED`) | ✅ | — | — | Admin is a separate SPA; not needed |
| Maintenance mode page | ✅ | ✅ | ✅ | Per-tenant flag returning a maintenance response |

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
| Recovery code (generate on site, apply on new MAC; old MAC `pending_deletion` 30d) | ✅ | (x) apply only | ✅ |
| Parent PIN (set/change) + PIN-protected playlists | ✅ | ✅ | ✅ |
| Random MAC from `app_device_id` (devices with no MAC) | ✅ | ✅ | ✅ |
| Adopt/dedupe device rows stored under wrong `app_type` | ✅ | ✅ | ✅ |
| One device row shared by several apps (IBO Player, Pro, TV) † | ✅ | — | — |
| "V4 lock" — device that used V4 is refused by legacy routes | ✅ | (x) 4 routes † | ✅ |
| Store-review bypass (lifetime for a specific test build on Samsung/LG/Vidaa/Windows) | ✅ | ✅ | (x) dead flags |
| Old/expired device cleanup | (x) 6 months | (x) 120 days | (x) 400 days | → replaced by pending-devices TTL + correct cleanup |
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
| Add playlist without login (captcha) | ✅ QR code | — | ✅ Stalker form † |
| Add / delete playlists by MAC only (no login) | — | — | ✅ |
| `PUT /api/edit_playlist` (playlist status sync, plain form) | — | — (**called by BobPlayer, missing**) | ✅ used by CRPlayer |
| Check a playlist URL (`/frontend/check-playlist`, server-side fetch) | — | — | ✅ (SSRF — add guard) |

## 4. Device API protocol families (old apps — wire format must be kept)

| Family | Routes (prefix `/api`) | Wire scheme | ibo | bob | cr |
|---|---|---|---|---|---|
| Legacy TV (Samsung/LG) | `playlist_info`, `update_playlist`, `check-activation-code`, `changeParentPin`, `check_active_status` | obfuscated envelope | ✅ | ✅ | ✅ |
| Legacy TV list | `playlist_list` | obfuscated envelope | ✅ | — | — |
| Legacy plain GET | `GET playlist_information/:mac/:app_type?` | plain | ✅ | — | — |
| Legacy Android AES | `POST playlist_information` | AES old key | ✅ host-gated | ✅ | — |
| Signed Android V2 | `/MBBPj5UwlCmTstXGb/android/playlist_information` | AES new + HMAC | ✅ | ✅ | ✅ |
| Signed manage | `/MBBPj5UwlCmTstXGb/manage/{add,update,delete}_playlist` | AES new + HMAC | ✅ | — | ✅ |
| Signed TV alias | `/Mxcvfghytrhjsjj/tv/playlist_information` | AES new + HMAC | — | ✅ | — |
| Signed TV V3 | `/MBBPj5UwlCmTstXGb/tv/v3/playlist_information` | AES V3 + HMAC + `u_id` HMAC-SHA1 | ✅ `u_id` check | (x) other keys † | — |
| Signed Android V3 | `/MBBPj5UwlCmTstXGb/android/v3/playlist_information` | AES V3 + HMAC | (x) always fails today (decrypt bug) † | — | — |
| Legacy add/remove playlist | `add_playlist`, `remove_playlist` | envelope (plain form for ibostb/macplayer) | — | — | ✅ used by CRPlayer |
| Legacy activation code (CRPlayer) | `change-code` | envelope | — | — | — **called by CRPlayer, missing in every backend** |
| Smart TV | `device_info` | envelope | — | — | ✅ |
| TV V4 | `tv/v4/playlist_info` | static bearer `TV_KEY_V4` | — | — | ✅ |
| Roku | `device_login`, `register_device`, `validate_status`, `activate_free_trial`, `playlist`, `languages`, `translations`, `app_info` | plain JSON + XOR token | ✅ | ✅ | ✅ |
| iOS v2 | `/ios/v2/{device_login,reset_uid,validate_status,playlist,languages,translations}` | XOR token | ✅ | ✅ | — |
| Android v2 | `/android/v2/…` (same set) | XOR token | ✅ | — | ✅ |
| iOS v3 / Android v3 | same set + `generate_captcha`, `delete-playlist` | XOR token | — | — | ✅ (uneven sets †) |
| V4 any-device | `/{type}/v4/{recaptcha,device_login,device_info,manage/*,check_update,apply_recovery,device/add}` | envelope + XOR bearer | ✅ 12 types | ✅ 12 types | ✅ 13 types |
| V4 extras | `/{type}/v4/sportsdb`, `ios/v4/apple_purchase` | envelope + XOR bearer | — | — | ✅ |
| Recovery V3 | `tv/v3/recover-summary`, `recover-my-device` | — | — | — | ✅ |
| Reseller notification | `reseller-notification` | envelope | — | (x) broken | — |
| Health | `status_check` | plain | ✅ | ✅ | ✅ |
| App setting | `get_app_setting/:mac` | plain | — (commented out) | (x) stub | (x) stub |
| App version | `app/version` | plain | — | — | ✅ |
| Public activation check | `device/check-activate` | captcha | ✅ | — | — |
| Global captcha | `v4/recaptcha` | plain | ✅ | — | ✅ |

## 5. Store & partner integrations

| Feature | ibo | bob | cr |
|---|---|---|---|
| Store API (`token` header): `validate-mac-address`, `save-device-activation`, `save-play-list`, `delete-playlist`, `delete-playlist-by-id`(cr), `reset-playlist`, `update-domain`, `count-domain-updates`, `switch-mac-address` | ✅ | ✅ | ✅ |
| License transfer protocol (via `save-device-activation`) | (x) branch † | (x) branch † | ✅ |
| Mimo Store / MDLS order + signed callback | ✅ | ✅ | (x) HMAC computed, not compared |
| `PLATFORM_KEY` APIs: reseller notification CRUD, `transfer-device-app` (cross-app transfer) | — | — | ✅ |
| Cross-app import of paying devices (HTTP polling) | — | ✅ asks ibo | ✅ asks ibo + bob | → internal lookup via central `deviceRegistry` |
| Old partner API with hardcoded token: `checkDeviceStatusFromExternal`, `activateWithCouponFromExternal` | ✅ | ✅ | (x) not routed |
| Admin-token external links: `get-available-connections/:id/:token`, `activate/:mac/:credits/:id/:token` | — (commented out) | ✅ | ✅ |
| StarArcs device registration proxy (`/{type}/v4/device/add`) | ✅ | ✅ | ✅ |
| SportsDB v2 mirror with cache | — | — | ✅ |
| Apple IAP (App Store Server API) | — | — | ✅ |

## 6. Customer website (replaced by one unified frontend — D15)

The rows below are the **union of features** the new customer API must offer the unified frontend. The old `/frontend/*` paths, field names and quirks are not kept.

| Feature | ibo | bob | cr |
|---|---|---|---|
| Device login (MAC + device key + captcha) | ✅ JWT | ✅ cookie session | ✅ JWT |
| Manage playlists, device key, UID, parent PIN, MAC switch, recovery code | ✅ | ✅ | ✅ |
| Pay to activate device (choose provider) | ✅ | ✅ | ✅ |
| Public device-status check `/checkDeviceStatus` (no captcha) | ✅ | ✅ | ✅ |
| MAC validity check `checkMacValid` | ✅ | ✅ | ✅ |
| reCAPTCHA verify `/recaptcha/verify` | ✅ | ✅ | ✅ |
| Customer accounts: signup, verify email, login, password reset, change password | — | — | ✅ |
| Plans: buy multi-device plan, assign/remove/select devices, rename device | — | — | ✅ |
| Activation-code portal (customer buys credits, generates codes) | ✅ | — | — |
| Coupons: buy coupon (credits, emailed), activate MAC with coupon | — (commented out) | ✅ | ✅ |
| Become a reseller: buy reseller package → account created + emailed | ✅ | ✅ | ✅ |
| Public content: news, FAQ, terms, privacy, contact form, SEO meta | ✅ | ✅ | ✅ |

## 7. Resellers, credits, codes, coupons

| Feature | ibo | bob | cr |
|---|---|---|---|
| Admin-type resellers (`Admin.is_admin=0`, `max_connections` credits) | ✅ | ✅ | ✅ |
| Sub-resellers (create / list / delete) | ✅ | — (routes commented out) | — (routes commented out) |
| Separate Reseller model + panel (`/reseller`): activate device, activity log | — | ✅ | ✅ |
| Activation codes (ibo ActivationCode / ResellerCode), redeem on TV | ✅ | (x) reusable † | ✅ |
| Code usage history (assign, IP) | ✅ | — | — |
| Reseller logo + notification shown in app | — | (x) logo delivery commented out | ✅ (via PLATFORM_KEY) |
| Credit packages (credits → duration) | ✅ | — | ✅ |
| Credit price packages (price → credits) | ✅ | — | — |
| Reseller packages | ✅ | ✅ | ✅ |
| Activation pricing: 1 credit = 1 year, 2 credits = lifetime | ✅ | ✅ | ✅ |

Credits are computed from device counts today, not recorded. → New: **one central reseller identity, one wallet (ledger) usable in all apps**; the hierarchy (sub-resellers) is rebuilt in IDN-02, not ported.

## 8. Payments

| Provider | ibo | bob | cr | Confirmation today | Callback route(s) |
|---|---|---|---|---|---|
| PayPal (device + reseller) | ✅ | ✅ | ✅ | capture, no status/amount check | `/paypal/order/create`, `/capture/:id`, `/paypal/resellerOrder*` |
| Stripe | ✅ | ✅ | ✅ | never activates | `/stripe/success`, `/stripe/cancel` |
| Paymob | ✅ | ✅ | ✅ | unsigned webhook | `/api/paymob_webhook` |
| PaySky | ✅ | ✅ | ✅ | check commented out | `/generatePayskyTransactionID`, `/checkPayskyTransaction` |
| Opay / Opay1 | ✅ | ✅ | ✅ | unsigned callback | `/api/opaySuccessCallback` |
| MDLS / Mimo Store | ✅ | ✅ | ✅ | HMAC (cr skips the compare) | `/api/mimoStoreCallback` |
| Telr | ✅ | ✅ | — | callback unsigned | `/activation/telr/*`, `/api/telrSuccessCallback` |
| PayEG | ✅ | ✅ | — | HMAC | `/api/payegSuccessCallback` |
| Geidea | ✅ | ✅ | — | HMAC | `/api/geideaSuccessCallback` |
| Cowpay | ✅ | (x) settings only | — | unsigned | `/cowpay/checkout/...`, `/api/cowpaySuccessCallback`, `/api/cowpayReturnUrl` |
| Cashcall | — | ✅ | — | trusts `?success=true` | `/api/cashcallSuccessCallback` |
| CoinPayments (crypto) | ✅ | ✅ | ✅ | IPN HMAC; redirect unverified | `/api/crypto-ipn-url/:id`, `/activation/crypto/*` |
| Paymentwall | ✅ | (x) | ✅ | validates its own signature only | `/api/paymentwall_callback` |
| Apple IAP | — | — | ✅ | properly verified | `ios/v4/apple_purchase` |
| `app_purchase` | ✅ | ✅ | ✅ | trusts the app | `/api/app_purchase` — **do not rebuild as-is**: verified Google Play (PAY-09) |
| `google_pay` | (x) empty stub | (x) empty stub | — (commented out) | — | `/api/google_pay` |
| Currency conversion EUR→EGP | (x) per worker | (x) per worker | (x) leader only | every 3 min | → one job |
| Shared: payment status page, payment visibility toggles | ✅ | ✅ | ✅ | | |

Payment purposes: device activation, plan purchase (cr), coupon/credit purchase, reseller package purchase. Only Apple purchases are verified end to end today.

## 9. Admin (becomes Admin API for a new SPA)

| Feature | ibo | bob | cr |
|---|---|---|---|
| Dashboard, devices (list/detail/edit/activate), playlists, transactions | ✅ | ✅ | ✅ |
| CMS pages (terms, privacy, news, FAQ, activation/reseller content) and SEO | ✅ | ✅ | ✅ |
| Translation editor (languages, words, translations) | ✅ | ✅ | ✅ |
| App config (themes, demo URL, trial days, price, notification) | ✅ | ✅ | ✅ |
| Payment provider settings, visibility, currency API key | ✅ | ✅ | ✅ |
| Plans | — | — | ✅ |
| Resellers, coupons (+ activity), packages | ✅ | ✅ | ✅ |
| Contact inbox | ✅ | ✅ | ✅ |
| Android apps, app versions, update settings | ✅ | ✅ | ✅ |
| Old-API toggles per domain | ✅ | — | — |
| Fake-device and IP review | ✅ | — | — |

New: one admin API for all brands, plus an audit log; fake-device/IP review becomes abuse review.

## 10. Abuse protection (rebuild per PLAN §6)

| Old feature | ibo | bob | cr |
|---|---|---|---|
| Blocked network (ASN) list (`cf-asn`, default 62513) | ✅ | ✅ | — |
| Per-IP request limit (50/min → 4h block) | ✅ | ✅ | (x) 2 routes |
| Too many MACs per IP → Cloudflare permanent ban + **device deletion** | ✅ | ✅ | — |
| Sequential / same-prefix MAC detection | ✅ | ✅ | — |
| Admin-path probing → permanent block | ✅ | — | — |
| Global limit 30 req/s per IP | — | ✅ | — |
| Client IP read from spoofable headers | ✅ | ✅ | ✅ |

New: Redis rate limits, pending devices + TTL, quarantine, Cloudflare IP Lists with expiry, admin review — never deletion, IP trusted only from Cloudflare.

## 11. Background jobs

| Job | ibo | bob | cr |
|---|---|---|---|
| Captcha cleanup | ✅ | ✅ | ✅ |
| Settings / translations refresh | ✅ | ✅ | ✅ |
| Currency rates | ✅ | ✅ | ✅ |
| Old devices + pending payments cleanup | ✅ | ✅ | ✅ not all brands |
| Domain-migration cache refresh | — | — | ✅ |
| Push IP blocks to Cloudflare | ✅ | ✅ | — |
| Hardcoded test-MAC playlist wipe | ✅ | ✅ | ✅ |
| Purge devices pending deletion | — | — | — |

Most jobs run once per worker process today (up to 24× in ibo and bob). New: BullMQ, once per schedule; the pending-deletion purge is added; test-MAC wipes are dropped.

## 12. App updates & content delivered to apps

| Feature | ibo | bob | cr |
|---|---|---|---|
| Android app updates per `package_id` (`check_update`) | ✅ | ✅ | ✅ |
| AppVersion records (`app/version`) | — | — | ✅ |
| Notification popup in apps (global / per reseller) | ✅ | ✅ | ✅ |
| Themes served by URL (`/images/upload`) | ✅ | ✅ | ✅ |
| APK download path (`/upload/…apk`) † | ✅ | ✅ | — |
| Hosted LG / webOS TV app (`/app_src_min`) | — | ✅ | — |
| Languages and translations | ✅ | ✅ | ✅ |
| `app_info` branding (Roku, hardcoded → config) | ✅ | ✅ | ✅ |

Apps load these files by URL, so **the static paths are a contract** that must keep working.

## 13. Not rebuilt (test, debug, one-off, unsafe, already dead)

PHP import/wipe routes (`*FromPHP`, `getPlaylistsFromPhp`), `clearLanguageWord`, `saveCountryCode`, `removeDuplicatedMacAddress`, `convertAllMacToLowerCase`, `fixPaymentTime`, `create-reseller-coupon`, `activateOpayDevices`, `/test`, `/email-test`, `*-test` pages, `get_ip_request_count`, `test-block-ip/:ip`, `get_non_mac_addresses`, `get-samsung-active-users`, hardcoded test-MAC wipes, dead `*Old` and unrouted `*Android` handlers, `tv/youtube-player` (commented out in ibo), root mongosh scripts, `clean_android_fake.js`, `seed*.js`, cPanel `iboplayer/` folder.

Full list of unreachable code: [`inventory/old-backends-unused.md`](inventory/old-backends-unused.md). Rule: when unsure whether an app uses a **live** route, keep it — nothing client-facing is dropped without traffic evidence.
