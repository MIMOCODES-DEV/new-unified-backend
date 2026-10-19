# What the real clients call

> 2026-10-14 · read-only survey of three clients, cross-checked against the live routes of the old backends.
> Clients: `cr-unified-frontend` (React customer website, all cr brands), `iboplayer-frontend` (React customer website, IBO Player), `TvApps/bobplayer-app` and `TvApps/crplayer-app` (Samsung/LG/webOS TV web apps; production loads `app_src_min`, same routes as `app_src`).
> **Websites vs apps (D15):** all websites are replaced by one unified frontend, so the website sections below describe **features to provide**, not routes to keep — their broken calls and field quirks are not carried over. The **TV app** sections are frozen contracts.
> **Correction 2026-10-19 — app branches.** The TV app sections below were read from each app's `master` branch. The apps' `dev`-line branches already speak a different protocol (checked in both copies, `E:\Revamp\Apps` and `E:\TvApps`):
>
> | App | Branch (commit) | Protocol |
> |---|---|---|
> | CRPlayer | `master` (`6e71d1c`) | TV v4 below: `POST /api/v4/recaptcha` + `POST /api/tv/v4/playlist_info`, static `TV_API_TOKEN`, no `u_id` |
> | CRPlayer | `dev`, `rebrand` (`f6aae2f`, "Changed from CR Player to C7 Player"), `playback-speed` | **full V4, same as BobPlayer**: `/api/{app_type}/v4/recaptcha`, `device_login` (`u_id`), `device_info` (Bearer device token), JSON `{data: <IBO>}`. Added in `1a30aa6` |
> | BobPlayer | `master` (`f485a82`) | full V4 (section below) |
> | BobPlayer | `dev` (`40cf747`) | rewritten on IBOPlayer's code ("kept BOB identity"), **same V4 routes and payloads**; pre-V4 `playlist_information` removed |
>
> **Decision 2026-10-19: the CRPlayer `master` "TV v4" route is NOT rebuilt.** It was an incomplete V4 implementation; the real V4 is the BobPlayer one, which CRPlayer `rebrand` already uses. Confirmed with the app team: the next C7 update ships from `rebrand`, and the other apps (BOB Premium has a `rebrand` branch with full V4; MAC TV Player next) are being unified onto the same V4 by the apps team. The new backend serves V4 only for these apps (the TV v4 door built and tested on 2026-10-19 is kept in git history, commit `e2adeb6`).
> **Confirmed with the team lead (2026-10-19):** apps that cannot be updated stay on the **older endpoints (v1–v3)**; every other app moves to **full V4**. No app relies on the half-done TV v4 route, so it is not rebuilt. The legacy door therefore needs: full V4 (built) + the v1–v3 families (LEG-02…LEG-07).
> Open risk for the app team: the TV shell falls back to the **assets packaged in the store build** when the remote assets are slow or fail (`host.js`, `FALLBACK_TIME`). Those fallback launches call the older endpoints, so they are served by the v1–v3 doors.
> `tv/v3/playlist_information` (AES + signature) still appears in CRPlayer `rebrand`: dead fallback code (only used if `v4_auth` is missing) and the device-key login page (`device_key_login_page.js:55`). It is the IBO app's live protocol, so it is built with the IBO door.
> Local dev switches: CRPlayer `rebrand` and BobPlayer `dev` have `DEVELOPMENT_MODE` + `DEVELOPMENT_BACKEND_URL` in `constants.js` (pins every server call); BobPlayer `master` only has `v4_auth.FORCED_BASE`.

> This is the first **usage evidence** we have: an app route listed here is a contract; a route no client here calls is not automatically dead (other apps, other brands' builds and emails exist), but it moves down the priority list.

## Summary

| Client | Backend | Calls | Missing on the backend |
|---|---|---|---|
| cr customer website | cr `/frontend/*` + `/api/:type/v4/*` | 46 call sites, 43 endpoints | 3 (PayPal create/capture, contact form) + 1 wrong method |
| IBO customer website | ibo `/frontend/*` + `/api/*` | 24 endpoints | contact form (wrong path, method and body) |
| CRPlayer TV app (`master`, not rebuilt) | cr `/api/*` | 9 endpoints | `POST /api/change-code` |
| CRPlayer TV app (`dev` / `rebrand`) | cr `/api/{app_type}/v4/*` | V4 set, as BobPlayer | — |
| BobPlayer TV app | bob `/api/*` | 10 endpoints | `PUT /api/edit_playlist` |

## Broken today (client calls a route the backend doesn't have)

| Client | Call | What the backend has | Effect |
|---|---|---|---|
| cr website | `POST /frontend/paypal/order/create`, `/frontend/paypal/order/capture/:id` | `/paypal/order/...` without `/frontend`, behind the old session check | PayPal checkout fails (unless a proxy rewrites) |
| cr website | `POST /frontend/sendUserQuestion` | `/sendUserQuestion` | Contact form fails |
| IBO website | `GET /frontend/sendUserQuestion`, fields passed as axios config so **no data is sent** | `POST /sendUserQuestion` | Contact form fails |
| cr website | `GET /frontend/device/playlists` (PayPal client id) | `POST` only | PayPal button never loads |
| CRPlayer | `POST /api/change-code` (activation-code screen) | no such route in any backend (`/check-activation-code` exists) | Activating with a code fails |
| BobPlayer | `PUT /api/edit_playlist` (playlist status sync) | route exists only in cr | 404, ignored by the app |

Fix-forward in the rebuild: implement what the clients actually send.

## cr customer website → cr

The cr site was derived from the IBO site: ibo's backend defines PayPal under both `/paypal/...` and `/frontend/paypal/...`; cr's backend never got the `/frontend` copy, which is why cr's PayPal checkout breaks.

- **Tenant:** one build for 22 brands; the brand is picked from the hostname, the backend tenant from the Host header. Brand → tenant map in `src/brands/index.js` (e.g. crplayer → cr7, smartone → smart, macplayer → mac, uhdplayer → hq). Includes tenants not in our inventory: duplex, family, alltv, virginia, abeplayer, bobpro, ktn, hushplayer, ibovpnplayer, hq.
- **Auth:** JWT in `localStorage.token`, `Authorization: Bearer`; device session (`/device/login`) and user session (`/user/login`) share the key. Own SVG captcha (`/captcha/generate` → `{svg, token}`), consumed per attempt.
- **Encoding:** plain JSON, except `POST /api/:type/v4/device_login` (IBO envelope) and the `?d=` QR blobs (URL-safe IBO).
- **Endpoints used (41 of cr's 48 `/frontend` routes):** session (`device/login`, `user/login`, `user`, `device`, logouts), sign-up and passwords (`user/signup`, `verify-password-token`, `set-password`, `password-reset/*`, `user/changePassword`), user devices and plans (`user/select-device`, `change-device-name`, `assign-device`, `assign-device-user`, `remove-device`, `reset-uid`, `generate-recovery-code`, `plans`, `assign-device-plan`, `switchMacAddress`, `delete-playlists`, `order-package-plan`), device playlists and settings (`device/playlists`, `savePlaylist`, `fetch-playlist/:id`, `editPlaylist/:id`, `deletePlayListUrl/:id`, `verify-playlist-pin`, `saveDeviceKey`, `saveParentPin`, `switchMacAddress`), activation (`device/checkMacValid`, `device/saveActivation`), public (`device/checkMacValidByMac`, `savePlaylistByMacOnly`, `deletePlaylistsByMacOnly`, `check-playlist`), V4 (`recaptcha`, `device_login`).
- **cr `/frontend` routes the website never calls (7):** `device/saveDeviceUid`, `device/add-stalker-playlist`, `paypal/resellerOrderCreate/:plan`, `paypal/resellerOrderCapture/:plan/:id`, `/frontend/saveActivation`, `verify-email/:token`, `device/generateRecoveryCode`.
- **Other calls:** a separate platform API `POST {VITE_APP_PLATFORM_URL}/api/check-code` with a Bearer key **shipped in the JS bundle**; PayPal JS SDK, Cowpay iframe, IBO store redirect (`activation.iboplayer.com/product-purchase/<SKU>/<mac>`), Hoory chat.
- **Field-name drift:** add playlist sends `playlist_url`, `xml_url`, `protect`; edit sends `url`, `epg_url`, `is_protected`, `currentPin`. The new customer API should use one set; this is a new API, not a frozen one.

## IBO customer website → ibo

- **One SPA, three themes by host** (`src/config/sites.js`): iboplayer.com → player, iboplayerpro.com → pro, iboproplayertv.com → protv (**an 8th domain** not in our list); the other IBO domains fall back to `player`. The brand is never sent; the backend infers it from the Host header. All calls are relative (`/frontend`, `/api`).
- **Auth:** JWT in `localStorage.ibo_device_token`, Bearer; on 401 the client clears it and hard-redirects to `/device/login`. Own SVG captcha. Device sessions only — no user accounts, no plans.
- **Encoding:** plain JSON, except `POST /api/:type/v4/device_login` (IBO envelope) and the `/device/verify?d=` blob.
- **Endpoints used (18 of ibo's 20 `/frontend` routes, plus 3 `/api`):** `captcha/generate`, `device/login`, `device`, `device/logout`, `device/playlists[/:pin_code]`, `device/savePlaylist` (create and edit; general, xc, stalker), `device/deletePlayListUrl/:id`, `device/checkPlaylistPinCode/:id/:pin`, `device/switchMacAddress`, `saveParentPin`, `saveDeviceKey`, `saveDeviceUid`, `generateRecoveryCode`, `checkMacValid`, `saveActivation`, `paypal/order/create`, `paypal/order/capture/:id`, `qr/addPlaylist` (general, xc, stalker); `/api/device/check-activate`; V4 `recaptcha`, `device_login`.
- **Never called:** `/frontend/paypal/resellerOrderCreate/:plan`, `/frontend/paypal/resellerOrderCapture/:plan/:id`.
- **Payments offered:** PayPal (SDK, EUR hardcoded), Opay/Opay1, Cowpay, crypto via `saveActivation` redirect, MIMO store link. No Stripe, Paymob, PaySky, Telr or Geidea in the UI.
- **Quirks the new customer API should not inherit:** `protect` sent as the strings `"true"`/`"false"`; save sends `playlist_url`/`xml_url` but reads `url`/`epg_url`; UID sent as `device_uid`, read as `u_id`; unprotected edit requests `/frontend/device/playlists/undefined`; the public activate page calls `/frontend/device` without a token and can bounce anonymous visitors to login.
- **Also in the bundle:** a client-side "kill switch" keyed on a value visible in source; Hoory, GA4 and Ahrefs keys. `public/` ships TV-app bundles (`iboplayer/`, `iboplayerpro/`, `iboplayertv/`, `iboproplayer/`) that call `backend.ibosol.com/api/application-settings/IBOPLAYER` — their device calls are not mapped yet.

## CRPlayer TV app (`master` branch) → cr (legacy + "quasi-V4")

> `dev` / `rebrand` builds use full V4 instead — see the correction at the top.

| Call | Encoding | Auth | Notes |
|---|---|---|---|
| `POST /api/v4/recaptcha` | plain form `mac_address` | `Bearer TV_API_TOKEN` (static) | reads `captcha` only |
| `POST /api/tv/v4/playlist_info` | form `data=IBO({mac_address, app_type, version, recaptcha_code})` + `token` field | `Bearer TV_API_TOKEN` | the only device-info call |
| `POST /api/update_playlist` | `data=IBO({…, playlists, remove_ids})` | none | offline-sync replay; reads array with `id`, `origin_id` |
| `POST /api/add_playlist` | `data=IBO(…)` | none | XC as `get.php` URL, or code playlist |
| `POST /api/remove_playlist` | `data=IBO({mac_address, app_type, id})` | none | |
| `PUT /api/edit_playlist` | plain form | none | stores XC status after a client-side check |
| `POST /api/change-code` | `data=IBO({mac_address, code, app_type, version})` | none | **missing on the backend** |
| `POST /api/changeParentPin` | `data=IBO({mac_address, pin_code})` | none | |
| `GET /api/status_check` | — | — | host health probe |

- Response fields read from `playlist_info`: `expire_date`, `captcha`, `ip_address`, `is_trial` (2 = lifetime), `themes[]`, `notifications[]` (plural), `notification`, `urls[]`, `languages[].code/.words`, `device_key`, `parent_pin`, `has_own_playlist`.
- Hosts: static list replaced at startup by `cdn.jsdelivr.net/gh/mr-akme/app-config@HEAD/crplayer/domain.json`, plus a "Server URLs" screen. Two static entries have a trailing slash (`/api//v4/...`).
- On `master`: no u_id, no per-device token, no recovery. The typed captcha code is stored and **resent on every launch**.

## BobPlayer TV app → bob (V4)

| Call | Encoding | Auth |
|---|---|---|
| `POST /api/{platform}/v4/recaptcha` | plain JSON | none |
| `POST /api/{platform}/v4/device_login` | `{"data": IBO}` → IBO | none |
| `POST /api/{platform}/v4/device_info` | IBO → IBO | `Bearer <device token>` |
| `POST /api/{platform}/v4/manage/{add,update,delete}_playlist` | IBO → plain JSON | Bearer |
| `POST /api/{platform}/v4/device/add` (StarArcs token) | IBO → IBO | Bearer |
| `POST /api/changeParentPin` | form `data=IBO` | none |
| `PUT /api/edit_playlist` | plain form | none — **missing on bob** |
| `GET /api/status_check` | — | — |

- Platforms sent: `lg`, `samsung`, `vidaa`, `titanos`, `zeasn`, `windows` (a subset of bob's 12 V4 types).
- Response fields read from `device_info`: `expire_date`, `device_key`, `ip_address`, `themes[]`, `notification`, `parent_pin`, `tmdb_api_key`, `is_trial`, `mac_registered`, `trial_days`, `urls[]` (`id`, `url`, `playlist_name`, `username`, `password`, `playlist_type`, `is_protected`, status fields). `languages` is **not** read (local locale files).
- **Not called:** V4 `check_update`, `apply_recovery`; legacy `playlist_info` and `/Mxcvfghytrhjsjj/tv/playlist_information` are dead code in the app.
- Website QR verify points at `http://192.168.100.53:5173` — a dev address in the production build.

## Shared wire-format facts (confirmed from the client side)

- IBO envelope: request = 2 locator chars **prepended**; response = 2 locator chars **appended** (the client reads them from the end). Matches PLAN Appendix A.
- Legacy calls are form-urlencoded `data=<IBO>`; bob V4 calls are JSON `{"data": "<IBO>"}`. The legacy adapters must accept both content types.
- Requests may arrive through relays: a smart-proxy (`http://<server>:8080/?mimo_proxy_target_765=…`) and a StarArcs HTTP proxy (`:7650/http-proxy?target_url=`). Client IP from these requests is the relay's — relevant for abuse rules (M9).
- A `Custom-Proxy-Mode: 1` header is sent to the backend on some calls (CORS preflight).

## Findings that change the design

1. **Fallback MACs.** When a TV has no readable MAC, BobPlayer uses `52:54:00:12:34:57` and CRPlayer `52:54:00:12:34:59` (Windows always). Every such device shares one record. This explains cr's "hardcoded test-MAC wipe" job — it is cleaning up a shared fallback MAC. The new device registration must treat these MACs as "no MAC" (identify by `app_device_id` / u_id instead) rather than wiping them.
2. **Per-brand route sets differ by app, not only by backend.** CRPlayer depends on legacy CRUD + `tv/v4/playlist_info`; BobPlayer only on V4. The legacy adapters must cover both families per tenant.
3. **Secrets in clients:** AES passphrase and HMAC secret (bob, dead code), static `TV_API_TOKEN` (cr), StarArcs/TMDB/weather keys, platform API key in the website bundle. All are public already; treat them as identifiers, not authentication (PLAN §6.7).
4. **Missing routes are features clients expect:** `change-code` (CRPlayer activation codes) and `edit_playlist` on bob should exist in the rebuild.
