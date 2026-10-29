# Phase 7 · Store

The store (the IBO Dev store panel, a separate Laravel app where resellers sell) calls the backend to check a
device, activate or cancel it, manage its playlists, move a provider's host and switch a MAC. Phase 7 rebuilds
these 9 routes with the **same paths, fields and replies** as the old backends, so the store does not change.
Contract: [`inventory/store-contract.md`](../inventory/store-contract.md).

Resellers live in the store, so reseller sales and cancels reach the TVs through these routes. The decision that the
new backend has no reseller work (28 Oct 2026) does not remove them.

## Routes

All `POST`, JSON or form. The store picks the brand by the host it calls and sends the brand's store key in a
`token` header. What differs between the old backends follows the brand's `legacy.dialect` (`cr` or not).

| Route | What | Uses |
|---|---|---|
| `/api/validate-mac-address` | `{macAddress}` → the device and its playlists; a paid running license answers `warning` + `already_activated` | DEV, LIC-3 |
| `/api/save-device-activation` | a sale or a cancel (below) | LIC-2, LIC-3 |
| `/api/save-play-list` | `current_playlist_url_id` `-1` adds, an id edits that device's playlist | PL-1, PL-2, PL-3 |
| `/api/delete-playlist` | the first playlist of `playlist_type`; ibo/bob need `device_key`, cr `playlist_code` | PL-2 |
| `/api/delete-playlist-by-id` | `{mac_address, id}` | PL-2 |
| `/api/reset-playlist` | every playlist of the device (`mac_address` + `device_key`) | PL-2 |
| `/api/update-domain` | a provider moved: `is_admin: true` the whole brand, `false` + `activated_macs` those devices; `limit` for a gradual move | PL-8 |
| `/api/count-domain-updates` | how many playlists that move would touch | PL-8 |
| `/api/switch-mac-address` | `{current_mac_address, mac_address, allow_one_year}`; refusals are HTTP 302 with the old `message` | DEV-7 |

### A sale or a cancel (`save-device-activation`)

The store sets the end date itself (`expire_date`), so:

| Store sends | Backend does |
|---|---|
| `is_trial: 2` | a lifetime license; a lifetime sold again on a running lifetime changes nothing |
| a future `expire_date` (`is_trial` 3) | a license **until that day** (end of the day, UTC), whatever runs now: the new `endsOn` of LIC-2 |
| `is_trial` 0 or 1, or a past `expire_date` | a **cancel**: the current license is revoked (LIC-3); a device that never paid has nothing to end |
| `reseller_id` | recorded as who activated it (`activatedBy: {source: store, actorId}`) and as the device's reseller |
| `multi_activate: 1` | the license refuses a MAC switch |
| `create_if_missing` (cr only) | an unknown MAC is registered first; the reply has `device_created` |

## Configuration

```sh
pnpm cli tenant:set-secret <slug> store.key <the key the store sends>   # per brand; no key = every call refused
# The old backends had one STORE_API_KEY each, shared by all their brands: set it on all of them at once.
# The value is read from stdin only (never typed on the command line).
pnpm cli tenants:set-secret store.key --dialect cr  < cr-store-key.txt    # every cr brand
pnpm cli tenants:set-secret store.key ibo           < ibo-store-key.txt   # or named brands
pnpm cli tenant:config:set <slug> currency.eurToEgp 52.5               # euro_to_egp in validate-mac-address
```

## Playground

**Tools → 7 Store → Store routes** (`/dev/playground`): set the brand's store key (dev route `POST /dev/store/key`,
`{ key? }`, 404 in production), then call each store route for the MAC at the top: validate, activate until a date,
lifetime, cancel, add a playlist, delete all, count and move a provider host, switch MAC. Every call shows in the
request log with its old reply.

## Changed on purpose

- **No key, no access.** The old backends let a call with no `token` in when their key was unset; a brand with no
  `store.key` now refuses every call. The key is compared in constant time.
- **A playlist id is checked against the device.** The old `save-play-list` edit and `delete-playlist-by-id` took
  any playlist id; now only the named device's playlist (its id, or its old id after the data move).
- **Hosts are plain text.** `update-domain` used `current_domain` as a regex; it is now a host (a scheme or path
  sent with it is dropped), and only that host matches (PL-8).
- **Codes keep leading zeros** (`delete-playlist` on cr parsed `"0123"` as `123`).
- **Errors answer.** Inputs that made the old handlers hang (a missing `macAddress`, a database error) get a reply.
- **No debug data.** cr's `delete-playlist` 404 listed three random devices; it doesn't.
- **`validate-mac-address` warns only for a paid running license**, not for a running trial.
- **PINs are never sent back** in the playlist objects.

## Also in this phase: playlist shapes of four cr brands

The old cr backend shaped playlists by brand name for four brands; the new backend uses two brand settings instead:

| Setting | What | Set on |
|---|---|---|
| `playlistProfileMobile` (`xc`, `general` or null) | the phone apps' shape (Android, iOS, Android TV) when it differs from `playlistProfile`: one `get.php` link on phones, `xc` parts on TVs | `ibosol`, `king4k` |
| `features.rawPlaylists` | every app gets the links exactly as typed | `mac`, `ibostb` |

```sh
pnpm cli tenant:set ibosol playlistProfileMobile general
pnpm cli tenant:set mac features.rawPlaylists true
```

The phone shape is checked first, then raw playlists, then Android `44*`, as the old code did.

## Not in this phase

- The payment row ibo/bob wrote for every activation (`source`, `amount`): with the payments phase.
- cr's `migrated_from_app` / `migrated_to_app` bookkeeping and the one-call `transfer-device-app`.
- Keeping `euro_to_egp` current: set by hand until the payments phase adds the rate job.

## Tests

| What | Result |
|---|---|
| Unit | 636 passed (new: `endsOn` on activation, counting a host move by the old host alone, store access in the guard) |
| `pnpm e2e:store` (new) | 51 passed |
| `pnpm e2e:legacy`, `e2e:v4`, `e2e:playlists`, `e2e:licenses` | 82, 47, 24, 19 passed |
