# Licensing

What the device is allowed to do, and until when. Module `src/modules/licensing` (collection `licenses`:
[SCHEMA.md](../SCHEMA.md) §4).

Rules only; what is built and when is in [ROADMAP.md](../ROADMAP.md).

| Feature | Task |
|---|---|
| License states: trial, yearly, lifetime, expired, revoked | LIC-1 |
| Activate from any source: reseller, code, coupon, payment, store, admin | LIC-2 |
| Multi-activate flag and credit count | LIC-1, LIC-2 |
| Activation history with who did it | LIC-3 |
| Expiry and cleanup of old devices | LIC-4 |

## LIC-1 License rules

- The state (trial, yearly, lifetime, expired, revoked) is worked out from `trialEndsAt` or the current license.
- Stacking: a yearly license bought early adds its year to the current end date; lifetime has no `expiresAt`.
  (Open: [DISCUSSIONS.md #6](../DISCUSSIONS.md#6-stacking-yearly-licenses-and-what-a-revoke-takes-away). LIC-1
  and LIC-3 change once it is decided.)
- `creditCost` is 1 for yearly and 2 for lifetime; `multiActivate` is stored.
- A unit test for every rule.

## LIC-2 Activate from any source

- One use case for every source: reseller, code, coupon, payment, store, transfer, admin, plan. The sources
  themselves come in later phases; here the source is only recorded.
- Writes a `licenses` row (`type`, `expiresAt`, `activatedBy`, `creditCost`, `multiActivate`, `sourceId`).
- A trial device moves to `devices` (`DeviceIdentity`, [devices.md](devices.md#one-mac-one-device-unq));
  `currentLicenseId` and `activatedAt` are set.
- The same `sourceId` twice does nothing the second time. Runs under the Redis lock for the device.

## LIC-3 Revoke, expiry and history

- Revoke sets `revoked` and `revokedAt`; the device stays in `devices` with no valid license.
- Expired is worked out from `expiresAt`, never stored.
- A device's full license history is listed with `activatedBy`.

## LIC-4 Expiry and cleanup of old devices

Needs Licensing and Playlists.

- The rule for trial devices that ended and never added a playlist (`playlistCount` 0) is agreed and written
  here. To agree: which ended trials are removed, and after how long. Suggested: ended trial + `playlistCount` 0
  + not seen for N days, dry run first.
- `devices` are never deleted. A cleaned trial device takes its playlists with it (by `deviceId`), so no new
  orphans appear.
- The job has a dry-run mode, writes a report, and runs once across all servers.
- Done when a dry run on sample data gives a report both of us agree with.
- Built (`CleanUpTrialDevicesUseCase`), with the suggested rule until we agree on it
  ([DISCUSSIONS.md #7](../DISCUSSIONS.md#7-phase-4-choices-to-confirm)):
  - Stale = the trial ended, `playlistCount` 0, and not seen for N days (default **180**, the old ibo cleanup).
  - A dry run is the default; it reports how many, the rule as dates, and the first 20 devices.
  - Each device is checked again under the lock for its MAC just before it goes, so one that came back or paid
    meanwhile is kept (reported as skipped). Its playlists are deleted first, even if the counter says 0.
  - At most `--limit` devices per brand per run (default 10 000); the report says when more are left.
  - One run per brand at a time (a Redis lock), whichever server starts it. It is a command, not a scheduled job,
    until the rule is agreed.
  - A removed device that comes back registers as new, with a new trial (as with the old cleanups).

```sh
pnpm cli devices:cleanup [--days N] [--limit N] [slug...]            # dry run: report only
pnpm cli devices:cleanup --apply [--days N] [--limit N] [slug...]    # deletes
```

Dev route (dry run only): `GET /dev/licenses/cleanup?days=N`.
