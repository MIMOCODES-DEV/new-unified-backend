# Phase 6 · Website API

Branch `phase/6-website-api` · built on: `phase/5-accounts-and-staff` · status: **in progress** (Omar)

The brand site's API for TVs: a TV logs in on the site with its MAC, its device key and a captcha, then manages
its playlists, device key, parental PIN, MAC switch and recovery code; plus the public tools that need no login.
These replace the old cr `/frontend/device/*` routes; the old paths are not kept (D15), so the site's calls change.
Customer accounts are Phase 5 (`/customer/*`).

## Routes

Errors are `{ error: { code, message } }` with 400, 401, 403, 404, 409 or 429. The brand comes from the host. A
device session is `Authorization: Bearer <token>`, 24 hours, and works on its own brand's host only.

| Route | Access | What |
|---|---|---|
| `GET /site/captcha` | public | `{ token, svg }`: a 5-character picture; 60 per 10 minutes per IP |
| `POST /device/login` | public | `{ mac, deviceKey, captcha: { token, answer } }` → `{ token, device }`. A captcha is used up on every try; 10 tries per 15 minutes per IP and per MAC; an unknown MAC and a wrong key get the same 401 |
| `POST /device/logout` | device | ends this session |
| `GET /device` | device | `{ device, license, playlists }` |
| `PATCH /device/key` | device | `{ key }`: 6 digits, or `null` for a random one |
| `PATCH /device/parent-pin` | device | `{ pin }`: 4 digits turn parental control on, `null` off |
| `POST /device/switch-mac` | device | `{ newMac }`: moves a lifetime license to a TV that opened the app once (DEV-7) |
| `POST /device/recovery-code` | device | `{ code, expiresAt }` for a paid device (REC-1) |
| `GET /device/playlists` | device | a protected playlist shows only its name (`hidden: true`) |
| `POST /device/playlists` | device | `{ name, source, epgUrl?, pin? }`; `source` is `{kind: link, url}`, `{kind: xtream, server, username, password}`, `{kind: stalker, portalUrl, …}` or `{kind: code, code}` |
| `PATCH /device/playlists/:id` | device | only what is sent changes; a protected one needs `pin`; `newPin` protects, changes or (`null`) removes the PIN |
| `DELETE /device/playlists/:id` | device | body `{ pin }` for a protected one |
| `POST /device/playlists/:id/unlock` | device | `{ pin }` → the protected playlist's link, login or portal |
| `POST /site/device-status` | public | `{ mac, captcha }` → paid, license, playlist count (before paying) |
| `POST /site/playlists` | public | `{ mac, name, source, … }`: add by MAC alone (QR code, quick form); limited per IP |
| `POST /site/playlists/delete-all` | public | `{ mac }`: deletes by MAC alone, keeps protected ones |
| `PATCH /device/uid` | device | `{ uid }`: the uid a reinstalled V4 app shows (6 letters or digits), so its next login skips the uid captcha |
| `POST /site/check-playlist` | public | `{ server, username, password }` or `{ url }` (a `get.php` link) → `{ account: { username, status, expiresAt, activeConnections, maxConnections, message } }`. The server asks the provider's `player_api.php`: only http or https, only public addresses (loopback, private, link-local and other reserved ranges are refused, and the checked address is the one connected to), no redirects, 10 seconds, 256 KB; 20 per 10 minutes per IP |
| `POST /site/contact` | public | `{ name?, email, subject?, message }`: kept in the brand's `contactMessages` (migration `0011-contact-messages`); 5 per hour per IP |
| `GET /admin/contact-messages` | staff `contact.view` | the brand's messages (the host), newest first; `?limit=` up to 500 |
| `PATCH /customer/devices/:id` | customer | `{ name }`: a name for a linked TV, kept on the customer (`deviceNames`); empty or `null` removes it; unlinking forgets it |
| `POST /customer/devices/:id/uid` | customer | `{ uid }` for one of the account's TVs |
| `POST /customer/devices/:id/recovery-code` | customer | a recovery code for one of the account's paid TVs |

### Added for the cr site (28 Oct)

| Route or change | What |
|---|---|
| `POST /customer/devices/:id/session` | a customer opens one of their TVs: a device session for it, so the site manages it with the `/device` routes (the old "select device") |
| `POST /customer/sign-up` without `password` | the cr site's sign-up form: the email is a **set-password link** (24 hours) instead of a verify link; choosing the password also verifies the email |
| Email links | set-password and reset links open the site's `/set-password/<token>` page; a verify link opens `/verify-email?token=` |
| `GET /customer/devices` | each TV now has `license: { state, endsAt }` |
| `GET /device` | the device also has `uid`, its own `recovery` code and the `lastSwitch` |
| CORS | allows the `x-client-origin` and `x-site-key` headers the cr site sends |

The site itself (`cr-unified-frontend`, branch `new-backend`) translates its old calls in `src/api/newBackend.js`; test
steps in `E:\Revamp\TESTING-WEBSITE-ON-NEW-BACKEND.md`. Checked in a headless browser: 30 old calls through the
site's own HTTP client, and its login page, TV dashboard, account page and customer device list, no page errors.

## Old cr frontend → new routes

For `cr-unified-frontend` (branch `improvement/cleanup-and-multi-tenant`), which still calls the old routes.

| Old (`/frontend/…`) | New |
|---|---|
| `GET captcha/generate` | `GET /site/captcha` |
| `POST device/login` (`mac_address`, `device_key`, `captcha`, `token`) | `POST /device/login` (`mac`, `deviceKey`, `captcha: {token, answer}`) |
| `GET device`, `POST device/playlists` | `GET /device`, `GET /device/playlists` |
| `POST device/savePlaylist` (add; field names `playlist_url`, `xml_url`, `protect`) | `POST /device/playlists` |
| `POST device/editPlaylist/:id` / `savePlaylist` (edit; `url`, `epg_url`, `is_protected`, `currentPin`) | `PATCH /device/playlists/:id` |
| `DELETE device/deletePlayListUrl/:id` | `DELETE /device/playlists/:id` |
| `POST device/verify-playlist-pin`, `GET device/fetch-playlist/:id` | `POST /device/playlists/:id/unlock` |
| `POST device/saveDeviceKey` | `PATCH /device/key` |
| `POST device/saveParentPin` | `PATCH /device/parent-pin` |
| `POST device/switchMacAddress` | `POST /device/switch-mac` |
| `POST device/generateRecoveryCode` | `POST /device/recovery-code` |
| `POST device/logout` | `POST /device/logout` |
| `POST device/checkMacValidByMac` | `POST /site/device-status` |
| `POST device/savePlaylistByMacOnly` | `POST /site/playlists` |
| `POST device/deletePlaylistsByMacOnly` | `POST /site/playlists/delete-all` |
| `user/*` (accounts) | Phase 5 `/customer/*` |
| `POST check-playlist` (`playlistType`, `playlistURL`, `host`, `username`, `password`; the raw provider reply) | `POST /site/check-playlist` (`{server, username, password}` or `{url}`; only the account fields: `user_info.status` → `account.status`, `exp_date` → `expiresAt`, `active_cons` → `activeConnections`, `max_connections` → `maxConnections`) |
| `POST sendUserQuestion` | `POST /site/contact` |
| `PATCH user/change-device-name` (`newDeviceName`, `device_id`) | `PATCH /customer/devices/:id` (`name`) |
| `POST user/reset-uid` (`uid`, `device_id`) | `POST /customer/devices/:id/uid` (`uid`), or `PATCH /device/uid` for a device session |
| `POST user/generate-recovery-code` | `POST /customer/devices/:id/recovery-code` |
| Not built (later phases) | `user/plans`, `user/assign-device-plan`, `order-package-plan`, `paypal/*` |

## Tests

| Where | What |
|---|---|
| `tools/dev/e2e-site.mjs` (`pnpm e2e:site`) | 48 checks: captcha used up on every try, wrong key and unknown MAC alike, session on another brand refused, playlists with and without PIN, unlock, device key, parental PIN, recovery code, MAC switch (yearly refused, lifetime moves), public tools, logout; the device uid; check playlist refuses local and private addresses; the contact form and the staff inbox on its own brand only; the account's TVs: rename, uid, recovery code, another account's TV not found, unlink forgets the name |
| `src/shared/auth/access.guard.spec.ts` | a device session works on its own brand only, and only on device routes |
| `src/interfaces/http/site/xtream-account-check.spec.ts` | 5 checks: asks `player_api.php` and returns only the account fields; never calls loopback or private addresses; refuses other schemes; does not follow redirects; refuses a reply that is not an account or is too big |
| Playground, **Website (device)** tab | driven in a headless browser: 11 steps (login, dashboard, playlists, uid, recovery code, device status, check playlist, contact, logout), no page errors; the Customer and Staff tabs still pass (26 steps) |

Result 28 Oct 2026: format, lint, typecheck, knip green; unit **598/598**; integration **59/59**; build OK; e2e site
**48/48**, and no change to v4, devices, playlists, licenses, moves, accounts.