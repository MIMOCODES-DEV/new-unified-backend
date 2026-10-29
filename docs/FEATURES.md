# Feature Catalogue (merged from the 3 old backends)

> Sources: survey of `iboplayer-backend` (ibo), `bobplayer-backend` (bob), `cr-unified-backend` (cr) on 2026-10-13; the 14 October code audit (*Combined Backend Features* slides); every row where the two disagreed was re-checked in the code on 2026-10-14.
> Purpose: the list of **features** the new backend must provide. Each feature is rebuilt cleanly from its intent — the old code is a reference for *what* it does, never for *how*.
> Legend for the ibo / bob / cr columns: ✅ yes · (x) partial / broken · — no. † = taken from the 14 October audit, not re-checked.
> **New backend** column (as of 29 Oct 2026, branch `phase/6-website-api`): ✅ done · ◐ part done · ⏳ not yet · 🚫 not rebuilt. Ids in brackets (DEV-1, PL-2, …) are the tasks in [`phases/`](phases/).
> Store and payment contracts in detail: [`inventory/store-contract.md`](inventory/store-contract.md), [`inventory/payment-contracts.md`](inventory/payment-contracts.md). Endpoint catalogue: [`inventory/endpoints.md`](inventory/endpoints.md).
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

| Feature | ibo | bob | cr | Notes for rebuild | New backend |
|---|---|---|---|---|---|
| Brands served | 1 brand, 7 domains (+ `iboproplayertv.com`, seen in the IBO website and TV bundles) | 1 brand | ~13 brands | | ✅ done: 24 brands |
| Host → app resolution | (x) host-gated routes | — | (x) substring + hardcoded rules; unknown host → cr7 | Exact host list per tenant in central registry; unknown host rejected | ✅ done: exact host, unknown host 421 |
| One DB per app | — | — | ✅ | Central DB + tenant DB | ✅ done: central DB + one DB per brand |
| Per-app behaviour switches | (x) settings `*_android_enabled`, `enable_old_only_samsung` | — | (x) `if (tenant === ...)` branches | Typed tenant config / feature flags, never slug checks | ✅ done: typed brand settings (`legacy.dialect`, `features.*`) |
| Settings key/value store | ✅ | ✅ | ✅ | Typed `tenantConfig` doc + encrypted `tenantSecrets` | ✅ done: `tenantConfig` + encrypted `tenantSecrets` |
| Settings/languages cache | (x) per worker | (x) per worker | (x) per worker | Redis cache + pub/sub invalidation | ◐ part: brand settings cached, Redis pub/sub refresh; languages come with Content |
| CORS allow-list | — (open to all; list commented out) | — (open to all) | (x) hardcoded list | Per-tenant config | ◐ part: open to all (`*`); the per-brand `corsOrigins` list is stored, not applied yet |
| Admin panel can be switched off per instance (`ADMIN_ENABLED`) | ✅ | — | — | Admin is a separate SPA; not needed | 🚫 not rebuilt: not needed |
| Maintenance mode page | ✅ | ✅ | ✅ | Per-tenant flag returning a maintenance response | ◐ part: `features.maintenance` flag stored, not enforced yet |

## 2. Device identity & licensing (core domain)

| Feature | ibo | bob | cr | New backend |
|---|---|---|---|---|
| Auto-register unknown MAC with trial (`trial_days`) | ✅ | ✅ | ✅ | ✅ done (DEV-1) |
| Device key (6-digit) for website login, regenerate | ✅ | ✅ | ✅ | ✅ done (DEV-5) |
| `u_id` identity (6 chars) + captcha-gated registration (V4) | ✅ | ✅ | ✅ | ✅ done (DEV-4) |
| UID-recovery captcha when `u_id` mismatches | ✅ | ✅ | ✅ | ✅ done (DEV-4) |
| License states: trial / yearly / lifetime / expired / revoked (old `is_trial` 0–3) | ✅ | ✅ | ✅ | ✅ done (LIC-1) |
| Multi-activate flag, credit count | ✅ | ✅ | ✅ | ✅ done (LIC-1) |
| MAC switch (move license to another MAC; `switched_from/to`) | ✅ | ✅ | ✅ | ✅ done (DEV-7) |
| Recovery code (generate on site, apply on new MAC; old MAC `pending_deletion` 30d) | ✅ | (x) apply only | ✅ | ✅ done (REC-1 to REC-3; the old MAC keeps an ended trial, no `pending_deletion`) |
| Parent PIN (set/change) + PIN-protected playlists | ✅ | ✅ | ✅ | ✅ done (DEV-5) |
| Random MAC from `app_device_id` (devices with no MAC) | ✅ | ✅ | ✅ | ✅ done (DEV-2) |
| Adopt/dedupe device rows stored under wrong `app_type` | ✅ | ✅ | ✅ | ✅ done (DEV-3) |
| One device row shared by several apps (IBO Player, Pro, TV) † | ✅ | — | — | ✅ done (DEV-3) |
| "V4 lock" — device that used V4 is refused by legacy routes | ✅ | (x) 4 routes † | ✅ | ✅ done (DEV-6) |
| Store-review bypass (lifetime for a specific test build on Samsung/LG/Vidaa/Windows) | ✅ | ✅ | (x) dead flags | ✅ done (DEV-6, brand config `review.builds`) |
| Old/expired device cleanup | (x) 6 months | (x) 120 days | (x) 400 days | ◐ part: `devices:cleanup` CLI (LIC-4) removes old trials (trialDevices); not a scheduled job yet |
| Suspect-device quarantine / restore | ✅ | — | — | → replaced by pending/quarantine design | ⏳ not yet: Protection |

## 3. Playlists

| Feature | ibo | bob | cr | New backend |
|---|---|---|---|---|
| Kinds: general M3U, Xtream (host/user/pass), Stalker portal (+ portal MAC, fallback portal), code | ✅ | ✅ | ✅ | ✅ done (PL-1) |
| CRUD from app / website / store / admin | ✅ | ✅ | ✅ | ◐ part: app and website done; store and admin not yet |
| Bulk upsert by MAC (`update_playlist`) | ✅ | ✅ | ✅ | ✅ done (PL-2) |
| PIN protection per playlist | ✅ | ✅ | ✅ | ✅ done (PL-3) |
| Provider branding (logo, contact, whatsapp, email) | ✅ | ✅ | ✅ | ◐ part: stored and sent to apps; the website forms do not save it yet |
| Response shaping: Xtream-parsed vs general vs raw (per app/version/tenant) | ✅ | ✅ | ✅ | ✅ done (PL-4) |
| Demo playlist when none | ✅ | ✅ | ✅ | ✅ done (PL-4) |
| Backup DNS / `backup_urls[]` (≤8) | — | — | ✅ | ◐ part: apps get them (PL-5); the website forms do not save them yet |
| Learned domain migrations (≥3 distinct devices confirm host move, 90d expiry, ≤3 hops) | — | — | ✅ | ✅ done (DOM-1, DOM-2; a move is served only after approval) |
| Bulk domain rewrite for a provider (store) + count | ✅ | ✅ | ✅ | ◐ part: the rule is built (PL-8), reachable only by a dev route; the store and admin routes not yet |
| Add playlist without login (captcha) | ✅ QR code | — | ✅ Stalker form † | ✅ done (PL-6, `/site/playlists`) |
| Add / delete playlists by MAC only (no login) | — | — | ✅ | ✅ done (`/site/playlists`, `/site/playlists/delete-all`) |
| `PUT /api/edit_playlist` (playlist status sync, plain form) | — | — (**called by BobPlayer, missing**) | ✅ used by CRPlayer | ✅ done (PL-7) |
| Check a playlist URL (`/frontend/check-playlist`, server-side fetch) | — | — | ✅ (SSRF — add guard) | ✅ done (`/site/check-playlist`, with the SSRF guard) |

## 4. Device API protocol families (old apps — wire format must be kept)

| Family | Routes (prefix `/api`) | Wire scheme | ibo | bob | cr | New backend |
|---|---|---|---|---|---|---|
| Legacy TV (Samsung/LG) | `playlist_info`, `update_playlist`, `check-activation-code`, `changeParentPin`, `check_active_status` | obfuscated envelope | ✅ | ✅ | ✅ | ◐ part: all but `check-activation-code` |
| Legacy TV list | `playlist_list` | obfuscated envelope | ✅ | — | — | ✅ done |
| Legacy plain GET | `GET playlist_information/:mac/:app_type?` | plain | ✅ | — | — | ✅ done |
| Legacy Android AES | `POST playlist_information` | AES old key | ✅ host-gated | ✅ | — | ✅ done |
| Signed Android V2 | `/MBBPj5UwlCmTstXGb/android/playlist_information` | AES new + HMAC | ✅ | ✅ | ✅ | ✅ done |
| Signed manage | `/MBBPj5UwlCmTstXGb/manage/{add,update,delete}_playlist` | AES new + HMAC | ✅ | — | ✅ | ✅ done |
| Signed TV alias | `/Mxcvfghytrhjsjj/tv/playlist_information` | AES new + HMAC | — | ✅ | — | ✅ done |
| Signed TV V3 | `/MBBPj5UwlCmTstXGb/tv/v3/playlist_information` | AES V3 + HMAC + `u_id` HMAC-SHA1 | ✅ `u_id` check | (x) other keys † | — | ✅ done |
| Signed Android V3 | `/MBBPj5UwlCmTstXGb/android/v3/playlist_information` | AES V3 + HMAC | (x) always fails today (decrypt bug) † | — | — | ✅ done: kept as it was (never answers with data) |
| Legacy add/remove playlist | `add_playlist`, `remove_playlist` | envelope (plain form for ibostb/macplayer) | — | — | ✅ used by CRPlayer | ✅ done |
| Legacy activation code (CRPlayer) | `change-code` | envelope | — | — | — **called by CRPlayer, missing in every backend** | ⏳ not yet |
| Smart TV | `device_info` | envelope | — | — | ✅ | ✅ done |
| TV V4 | `tv/v4/playlist_info` | static bearer `TV_KEY_V4` | — | — | ✅ | ✅ done |
| Roku | `device_login`, `register_device`, `validate_status`, `activate_free_trial`, `playlist`, `languages`, `translations`, `app_info` | plain JSON + XOR token | ✅ | ✅ | ✅ | ◐ part: `languages`, `translations`, `app_info` come with Content |
| iOS v2 | `/ios/v2/{device_login,reset_uid,validate_status,playlist,languages,translations}` | XOR token | ✅ | ✅ | — | ◐ part: `languages`, `translations` come with Content |
| Android v2 | `/android/v2/…` (same set) | XOR token | ✅ | — | ✅ | ◐ part: `languages`, `translations` come with Content |
| iOS v3 / Android v3 | same set + `generate_captcha`, `delete-playlist` | XOR token | — | — | ✅ (uneven sets †) | ◐ part: `languages`, `translations`, `delete-playlist` not yet |
| V4 any-device | `/{type}/v4/{recaptcha,device_login,device_info,manage/*,check_update,apply_recovery,device/add}` | envelope + XOR bearer | ✅ 12 types | ✅ 12 types | ✅ 13 types | ◐ part: all but `check_update` (Content) |
| V4 extras | `/{type}/v4/sportsdb`, `ios/v4/apple_purchase` | envelope + XOR bearer | — | — | ✅ | ⏳ not yet: Content and Payments |
| Recovery V3 | `tv/v3/recover-summary`, `recover-my-device` | — | — | — | ✅ | ✅ done (Phase 4) |
| Health | `status_check` | plain | ✅ | ✅ | ✅ | ✅ done |
| App setting | `get_app_setting/:mac` | plain | — (commented out) | (x) stub | (x) stub | ✅ done |
| App version | `app/version` | plain | — | — | ✅ | ⏳ not yet: Content |
| Public activation check | `device/check-activate` | captcha | ✅ | — | — | ⏳ not yet |
| Global captcha | `v4/recaptcha` | plain | ✅ | — | ✅ | ✅ done |

## 5. Store & partner integrations

| Feature | ibo | bob | cr | New backend |
|---|---|---|---|---|
| Store API (`token` header): `validate-mac-address`, `save-device-activation`, `save-play-list`, `delete-playlist`, `delete-playlist-by-id`(cr), `reset-playlist`, `update-domain`, `count-domain-updates`, `switch-mac-address` | ✅ | ✅ | ✅ | ⏳ not yet |
| License transfer protocol (via `save-device-activation`: `create_if_missing`, `migrated_from/to_app`) | — | — | ✅ (checked in code, CAP-05) | ⏳ not yet |
| Mimo Store / MDLS order + signed callback | ✅ | ✅ | (x) HMAC computed, not compared | ⏳ not yet |
| `PLATFORM_KEY` API: `transfer-device-app` (cross-app transfer) | — | — | ✅ | ⏳ not yet |
| Cross-app import of paying devices (HTTP polling) | — | ✅ asks ibo | ✅ asks ibo + bob | → internal lookup via central `deviceRegistry` | ⏳ not yet |
| Old partner API with hardcoded token: `checkDeviceStatusFromExternal` | ✅ | ✅ | (x) not routed | ⏳ not yet |
| Admin-token external links: `get-available-connections/:id/:token`, `activate/:mac/:credits/:id/:token` | — (commented out) | ✅ | ✅ | ⏳ not yet |
| StarArcs device registration proxy (`/{type}/v4/device/add`) | ✅ | ✅ | ✅ | ✅ done |
| SportsDB v2 mirror with cache | — | — | ✅ | ⏳ not yet: Content |
| Apple IAP (App Store Server API) | — | — | ✅ | ⏳ not yet: Payments |

## 6. Customer website (replaced by one unified frontend — D15)

The rows below are the **union of features** the new customer API must offer the unified frontend. The old `/frontend/*` paths, field names and quirks are not kept.

| Feature | ibo | bob | cr | New backend |
|---|---|---|---|---|
| Device login (MAC + device key + captcha) | ✅ JWT | ✅ cookie session | ✅ JWT | ✅ done (`POST /device/login`) |
| Manage playlists, device key, UID, parent PIN, MAC switch, recovery code | ✅ | ✅ | ✅ | ✅ done (`/device/*`) |
| Pay to activate device (choose provider) | ✅ | ✅ | ✅ | ⏳ not yet: Payments |
| Public device-status check `/checkDeviceStatus` (no captcha) | ✅ | ✅ | ✅ | ✅ done (`POST /site/device-status`, with a captcha) |
| MAC validity check `checkMacValid` | ✅ | ✅ | ✅ | ✅ done (`POST /site/device-status`) |
| reCAPTCHA verify `/recaptcha/verify` | ✅ | ✅ | ✅ | ✅ done: own captcha (`GET /site/captcha`) |
| Customer accounts: signup, verify email, login, password reset, change password | — | — | ✅ | ✅ done (Phase 5, `/customer/*`) |
| Plans: buy multi-device plan, assign/remove/select devices, rename device | — | — | ✅ | ◐ part: link, unlink, name devices done; buying plans not yet |
| Public content: news, FAQ, terms, privacy, contact form, SEO meta | ✅ | ✅ | ✅ | ◐ part: contact form done (`POST /site/contact`); news, FAQ, terms, SEO with Content |

## 7. Payments

| Provider | ibo | bob | cr | Confirmation today | Callback route(s) | New backend |
|---|---|---|---|---|---|---|
| PayPal | ✅ | ✅ | ✅ | capture, no status/amount check | `/paypal/order/create`, `/capture/:id` | ⏳ not yet |
| Stripe | ✅ | ✅ | ✅ | never activates | `/stripe/success`, `/stripe/cancel` | ⏳ not yet |
| Paymob | ✅ | ✅ | ✅ | unsigned webhook | `/api/paymob_webhook` | ⏳ not yet |
| PaySky | ✅ | ✅ | ✅ | check commented out | `/generatePayskyTransactionID`, `/checkPayskyTransaction` | ⏳ not yet |
| Opay / Opay1 | ✅ | ✅ | ✅ | unsigned callback | `/api/opaySuccessCallback` | ⏳ not yet |
| MDLS / Mimo Store | ✅ | ✅ | ✅ | HMAC (cr skips the compare) | `/api/mimoStoreCallback` | ⏳ not yet |
| Telr | ✅ | ✅ | — | callback unsigned | `/activation/telr/*`, `/api/telrSuccessCallback` | ⏳ not yet |
| PayEG | ✅ | ✅ | — | HMAC | `/api/payegSuccessCallback` | ⏳ not yet |
| Geidea | ✅ | ✅ | — | HMAC | `/api/geideaSuccessCallback` | ⏳ not yet |
| Cowpay | ✅ | (x) settings only | — | unsigned | `/cowpay/checkout/...`, `/api/cowpaySuccessCallback`, `/api/cowpayReturnUrl` | ⏳ not yet |
| Cashcall | — | ✅ | — | trusts `?success=true` | `/api/cashcallSuccessCallback` | ⏳ not yet |
| CoinPayments (crypto) | ✅ | ✅ | ✅ | IPN HMAC; redirect unverified | `/api/crypto-ipn-url/:id`, `/activation/crypto/*` | ⏳ not yet |
| Paymentwall | ✅ | (x) | ✅ | validates its own signature only | `/api/paymentwall_callback` | ⏳ not yet |
| Apple IAP | — | — | ✅ | properly verified | `ios/v4/apple_purchase` | ⏳ not yet |
| `app_purchase` | ✅ | ✅ | ✅ | trusts the app | `/api/app_purchase` — **do not rebuild as-is**: verified Google Play (PAY-09) | ⏳ not yet |
| `google_pay` | (x) empty stub | (x) empty stub | — (commented out) | — | `/api/google_pay` | ⏳ not yet |
| Currency conversion EUR→EGP | (x) per worker | (x) per worker | (x) leader only | every 3 min | → one job | ⏳ not yet |
| Shared: payment status page, payment visibility toggles | ✅ | ✅ | ✅ | | | ⏳ not yet |

Payment purposes: device activation, plan purchase (cr). Only Apple purchases are verified end to end today.

## 8. Admin (becomes Admin API for a new SPA)

| Feature | ibo | bob | cr | New backend |
|---|---|---|---|---|
| Dashboard, devices (list/detail/edit/activate), playlists, transactions | ✅ | ✅ | ✅ | ◐ part: device view and activate (`/admin/devices/:mac`); the rest not yet |
| CMS pages (terms, privacy, news, FAQ, activation content) and SEO | ✅ | ✅ | ✅ | ⏳ not yet |
| Translation editor (languages, words, translations) | ✅ | ✅ | ✅ | ⏳ not yet |
| App config (themes, demo URL, trial days, price, notification) | ✅ | ✅ | ✅ | ⏳ not yet: brand settings are set by CLI today |
| Payment provider settings, visibility, currency API key | ✅ | ✅ | ✅ | ⏳ not yet |
| Plans | — | — | ✅ | ⏳ not yet |
| Contact inbox | ✅ | ✅ | ✅ | ✅ done (`GET /admin/contact-messages`) |
| Android apps, app versions, update settings | ✅ | ✅ | ✅ | ⏳ not yet |
| Old-API toggles per domain | ✅ | — | — | ⏳ not yet |
| Fake-device and IP review | ✅ | — | — | ⏳ not yet: Protection (abuse review) |

New: one admin API for all brands, plus an audit log; fake-device/IP review becomes abuse review. Built so far (Phase 5): staff login with 2FA, staff, roles and permissions with per-brand access (`/admin/staff`, `/admin/roles`, `/admin/permissions`).

## 9. Abuse protection (rebuild per PLAN §6)

| Old feature | ibo | bob | cr | New backend |
|---|---|---|---|---|
| Blocked network (ASN) list (`cf-asn`, default 62513) | ✅ | ✅ | — | ⏳ not yet |
| Per-IP request limit (50/min → 4h block) | ✅ | ✅ | (x) 2 routes | ◐ part: website, login and by-MAC routes limited; app routes not yet |
| Too many MACs per IP → Cloudflare permanent ban + **device deletion** | ✅ | ✅ | — | ⏳ not yet: never deletes devices |
| Sequential / same-prefix MAC detection | ✅ | ✅ | — | ⏳ not yet |
| Admin-path probing → permanent block | ✅ | — | — | ⏳ not yet |
| Global limit 30 req/s per IP | — | ✅ | — | ⏳ not yet |
| Client IP read from spoofable headers | ✅ | ✅ | ✅ | ⏳ not yet |

New: Redis rate limits, trial devices kept apart from paid ones (one safe cleanup job), quarantine, Cloudflare IP Lists with expiry, admin review — never deletion, IP trusted only from Cloudflare.

## 10. Background jobs

| Job | ibo | bob | cr | New backend |
|---|---|---|---|---|
| Captcha cleanup | ✅ | ✅ | ✅ | ✅ done: a TTL index removes them |
| Settings / translations refresh | ✅ | ✅ | ✅ | ✅ done: brand settings refresh through Redis pub/sub; translations with Content |
| Currency rates | ✅ | ✅ | ✅ | ⏳ not yet: Payments |
| Old devices + pending payments cleanup | ✅ | ✅ | ✅ not all brands | ◐ part: `devices:cleanup` CLI (LIC-4), not a scheduled job yet |
| Domain-migration cache refresh | — | — | ✅ | ✅ done: approved moves cached in memory |
| Push IP blocks to Cloudflare | ✅ | ✅ | — | ⏳ not yet: Protection |
| Hardcoded test-MAC playlist wipe | ✅ | ✅ | ✅ | 🚫 not rebuilt: dropped |
| Purge devices pending deletion | — | — | — | 🚫 not rebuilt: not needed: a recovery leaves nothing pending (REC-3) |

Most jobs run once per worker process today (up to 24× in ibo and bob). New: BullMQ, once per schedule; the pending-deletion purge is added; test-MAC wipes are dropped.

## 11. App updates & content delivered to apps

| Feature | ibo | bob | cr | New backend |
|---|---|---|---|---|
| Android app updates per `package_id` (`check_update`) | ✅ | ✅ | ✅ | ⏳ not yet: Content |
| AppVersion records (`app/version`) | — | — | ✅ | ⏳ not yet: Content |
| Notification popup in apps (global) | ✅ | ✅ | ✅ | ⏳ not yet: Content |
| Themes served by URL (`/images/upload`) | ✅ | ✅ | ✅ | ⏳ not yet: Content |
| APK download path (`/upload/…apk`) † | ✅ | ✅ | — | ⏳ not yet: Content |
| Hosted LG / webOS TV app (`/app_src_min`) | — | ✅ | — | ⏳ not yet: Content |
| Languages and translations | ✅ | ✅ | ✅ | ⏳ not yet: Content |
| `app_info` branding (Roku, hardcoded → config) | ✅ | ✅ | ✅ | ⏳ not yet: Content |

Apps load these files by URL, so **the static paths are a contract** that must keep working.

## 12. Not rebuilt (test, debug, one-off, unsafe, already dead)

PHP import/wipe routes (`*FromPHP`, `getPlaylistsFromPhp`), `clearLanguageWord`, `saveCountryCode`, `removeDuplicatedMacAddress`, `convertAllMacToLowerCase`, `fixPaymentTime`, `activateOpayDevices`, `/test`, `/email-test`, `*-test` pages, `get_ip_request_count`, `test-block-ip/:ip`, `get_non_mac_addresses`, `get-samsung-active-users`, hardcoded test-MAC wipes, dead `*Old` and unrouted `*Android` handlers, `tv/youtube-player` (commented out in ibo), root mongosh scripts, `clean_android_fake.js`, `seed*.js`, cPanel `iboplayer/` folder.

Full list of unreachable code: [`inventory/old-backends-unused.md`](inventory/old-backends-unused.md). Rule: when unsure whether an app uses a **live** route, keep it — nothing client-facing is dropped without traffic evidence.
