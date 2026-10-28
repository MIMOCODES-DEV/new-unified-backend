# Devices

Who the device is, and how it registers and logs in. Module `src/modules/devices` (collections `trialDevices`,
`devices`, `captchas`: [SCHEMA.md](../SCHEMA.md) §2, §3, §6).

Rules only; what is built and when is in [ROADMAP.md](../ROADMAP.md).

| Feature | Task |
|---|---|
| Register an unknown device with a trial | DEV-1 |
| 6-digit device key for website login | DEV-5 |
| u_id identity + captcha registration (V4) | DEV-4 |
| UID-recovery captcha when the u_id does not match | DEV-4 |
| MAC switch: move a license to a new MAC | DEV-7 |
| Parent PIN | DEV-5 |
| Random MAC from app_device_id | DEV-2 |
| Merge rows stored under the wrong app type | DEV-3 |
| One device shared by IBO Player, Pro and TV | DEV-3 |
| V4 lock: a V4 device is refused by old routes | DEV-6 |
| Store-review build override | DEV-6 |
| Fallback MACs treated as "no MAC" | DEV-2 |

Brand config it reads: `trial.days` (default 7), `review.builds` (empty by default), `macSwitch.maxPerDevice`
(default 1).

## One MAC, one device (UNQ)

A MAC can be in only one of `trialDevices` or `devices`: one TV is one device. An index cannot do that across
two collections, so `DeviceIdentity` (`src/modules/devices/application/device-identity.ts`) does it. Create,
move and change a MAC only through it; never write to `trialDevices` / `devices` directly for those. The device
key is not unique, so it needs nothing here.

- Only `trialDevices` and `devices`; no extra collection (decided 25 Oct).
- `DeviceIdentity` takes the Redis lock for the MAC (`device:<brand>:<mac>`, see below), then:
  - **create:** looks in both collections, and inserts into `trialDevices` only if the MAC is in neither;
  - **move to paid:** writes the row to `devices` (same id, MAC and device key), then deletes it from
    `trialDevices`;
  - **MAC switch:** under the lock for both MACs; a paid device on the new MAC refuses it, a trial device there
    is absorbed (DEV-7), and the old MAC keeps an ended trial device.
- Lookups always check `devices` first, so a device caught halfway through a move is still found as paid. A
  move that stopped halfway is finished by running it again.
- A device that already exists is only read, without the lock: if Redis is down, existing TVs keep working; only
  new TVs, payments and MAC switches wait until Redis is back.

Tested by: parallel sign-ups with the same MAC create exactly one device; a moved device is in exactly one
collection afterwards, and a move stopped halfway and run again ends in `devices` only; with Redis down an
existing device is still found and creating a new one is refused with a clear error.

### Redis lock (LOCK)

`RedisLock.withLock(key, { ttlMs }, fn)` in `src/shared/redis/redis-lock.ts` makes sure two servers never change
the same device at the same time. It takes the lock with `SET NX PX` and a random token, and releases it with a
script that deletes the key only if the token is still ours.

- A second caller cannot take a lock that is held; different keys run in parallel.
- A lock expires after its TTL and is released when the work throws.
- A late release never deletes someone else's lock.
- If Redis is down, the lock is refused (fails closed).

## DEV-1 Register and find a device

- An unknown MAC creates a `trialDevices` row: new UUID, new 6-digit device key, `trialStartedAt` now,
  `trialEndsAt` = end of day UTC after `trial.days` from brand config.
- A device whose trial ended stays in `trialDevices` and never gets a second trial.
- `lastSeenAt`, `ip`, `appVersion` and `apiVersion` are updated on each visit.

## DEV-2 Devices without a usable MAC

- No MAC: one is made from `appDeviceId`, and the device is found again by `appDeviceId`.
- The fallback MACs `52:54:00:12:34:57`, `…:58`, `…:59` and the Windows fallback never create or match a shared
  device; such devices are found by `appDeviceId` or `uid`. A test for each.
  (Open: [DISCUSSIONS.md #2](../DISCUSSIONS.md#2-what-is-the-windows-fallback-mac).)

## DEV-3 One device for IBO Player, Pro and TV; wrong app type

- The three IBO apps with the same MAC get the same device; `appVersion` records the last caller.
- Two rows for one device under different platforms are merged, keeping the paid one.
  (Open: [DISCUSSIONS.md #3](../DISCUSSIONS.md#3-dev-3-merge-rows-under-different-platforms-runtime-or-data-move).)

## DEV-4 u_id and captcha registration (V4)

- Uses the `captchas` collection: unanswered captchas expire; solved ones are kept for their MAC.
- A captcha is issued, expires if unanswered, and can be answered once.
- A solved captcha lets the device skip the next one. CRPlayer-type apps send the same solved code on every
  start, and it keeps working.
- A u_id that does not match asks for the recovery captcha; solving it updates `uid`.
  (Open: [DISCUSSIONS.md #4](../DISCUSSIONS.md#4-v4-login-old-devices-and-devices-without-a-real-mac).)

## DEV-5 Device key and parent PIN

- A new device key is 6 random digits; it does not have to be unique, because it is always checked together
  with the MAC.
- The key can be changed; the old one stops working.
- `parentPin` can be set and changed and is returned as entered.

## DEV-6 V4 lock and store-review builds

- A device with `apiVersion` v4 is refused by the old entry points.
- ibo and bob reply "lifetime" to a Samsung / LG review build when a hard-coded testing flag is on. Replace the
  flag with a per-brand list of review builds (platform + version) in brand config `review.builds`, empty by
  default.
  (Open: [DISCUSSIONS.md #5](../DISCUSSIONS.md#5-the-ibo-store-review-flag-is-on-for-ibo-player-tv-on-samsung):
  the flag is on today for IBO Player TV on Samsung.)

## DEV-7 MAC switch

Needs Licensing, so it is built after it.

- The device moves to the new MAC, keeping its id, license and playlists; `switch` records from, to and when.
- Refused when the current license has `multiActivate`, and when the new MAC belongs to a paid device.
- Decided 27 Oct, to match the old backends (checked side by side against the old ibo `switch-mac-address`):
  - The new MAC must already be registered (the app installed on the new TV), so a typo never sends a license to
    a stranger. Its trial device is absorbed: its playlists move to the paid device (a clashing name becomes
    "Name (2)", a playlist it already has is dropped), then it is deleted.
  - The old MAC keeps an ended trial device, so the old TV gets no new trial.
  - Only a running license switches (not expired, not revoked). A yearly license switches only when the caller
    allows it (old `allow_one_year`); lifetime always can.
  - How many switches a device may make is brand config `macSwitch.maxPerDevice`, set by the admin in the
    database, 1 by default (old: "you can only switch once"); 0 turns switching off. `switch.count` counts them
    and `switch.originMac` keeps the first MAC.
  - Differs from the old backends on purpose: a paid device on the new MAC refuses the switch (the old one
    overwrote that device's license), and switching to the MAC the device already has is refused (the old one
    disabled the device).
