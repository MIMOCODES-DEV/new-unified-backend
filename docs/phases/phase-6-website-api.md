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
| Still to build | `check-playlist`, `sendUserQuestion` (contact form), `user/change-device-name`, `user/reset-uid`, `user/generate-recovery-code`, plans and payments |

## Tests

| Where | What |
|---|---|
| `tools/dev/e2e-site.mjs` (`pnpm e2e:site`) | 33 checks: captcha used up on every try, wrong key and unknown MAC alike, session on another brand refused, playlists with and without PIN, unlock, device key, parental PIN, recovery code, MAC switch (yearly refused, lifetime moves), public tools, logout |
| `src/shared/auth/access.guard.spec.ts` | a device session works on its own brand only, and only on device routes |

Result 28 Oct 2026: format, lint, typecheck, knip green; unit **593/593**; build OK; e2e site **33/33**, and no change
to v4, devices, playlists, licenses, moves, accounts.
