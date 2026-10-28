# Recovery

Getting a paid device back on a new TV. No collection of its own: it uses `devices.recovery`
([SCHEMA.md](../SCHEMA.md) §3). It lives in the licensing module next to the MAC switch, because it is the same
move started by a code: `CreateRecoveryCodeUseCase` and `RecoverWithCodeUseCase` in
`src/modules/licensing`, with the devices side in `RecoverDeviceUseCase` (`src/modules/devices`).

Rules only; what is built and when is in [ROADMAP.md](../ROADMAP.md).

Done when: a code made on the website moves a paid device to a new TV with its license and playlists, and nothing
is left behind. Needs Licensing.

| Feature | Task |
|---|---|
| Generate a recovery code on the website | REC-1 |
| Apply the code on a new device | REC-2 |
| Retire the old device after recovery (no purge today) | REC-3 |

## REC-1 Recovery code

- Only a device in `devices` (paid) gets a code. It is stored in `recovery { code, expiresAt, enabled }` and lasts
  30 minutes.
- A new code replaces the old one; a trial device is refused.
- Built:
  - The license must be running (not expired, not revoked), as on the old ibo and cr websites: an expired
    device has nothing to recover.
  - A code is 8 characters from `ABCDEFGHJKLMNPQRTUVWXYZ23456789` (no I, O, S, 0 or 1), as the old backends
    made them. One code belongs to one device (index `recovery_code_unique`); a clash draws a new code.
  - `enabled` is kept as it was (cr set it when a V4 app logged in; the website showed the option from it).

## REC-2 Apply the code on a new TV

- The paid device takes the new TV's MAC and keeps its id, license and playlists.
- `recovery` records `recoveredFrom` (the old MAC) and `recoveredAt`.
- A code works once; an expired or wrong code is refused. Runs under the Redis lock for both MACs.
- Built:
  - The code is read in any case, with spaces around it.
  - The new MAC must be registered (the app installed on the new TV, as cr required) and a real MAC (not a
    fallback MAC). A paid device on the new MAC refuses the recovery (the old ibo backend pushed that device off
    the MAC). The device's own MAC is refused.
  - The license must still be running when the code is used.
  - Two TVs sending the same code at once: one gets the device, the other is told the code is wrong. The check
    runs again under the license lock for the device.
  - A recovery does not count as a MAC switch (`macSwitch.maxPerDevice`).

## REC-3 Retire what is left after recovery

- The old backends never purged after a recovery.
- The new TV's own trial row, if it had one, is removed with its playlists (by `deviceId`).
- After a recovery each MAC belongs to exactly one device; a test proves there are no leftovers.
- Built: the old MAC keeps an ended trial device with nothing on it (as after a MAC switch), so the old TV gets
  no new trial. To confirm: [DISCUSSIONS.md #7](../DISCUSSIONS.md#7-phase-4-choices-to-confirm).

## Where to try it

- Dev routes: `POST /dev/licenses/:mac/recovery-code`, `POST /dev/licenses/recover { code, newMac }`.
- Playground: the **License, switch, recovery** tab.
- `pnpm e2e:moves`.
- The old apps' route (`POST /api/:appType/v4/apply_recovery`) and the website's
  (`/frontend/user/generate-recovery-code`) come with the later old-app and website phases.
