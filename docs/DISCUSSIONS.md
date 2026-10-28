# Discussions

Open questions between Omar and Ali. Each point says the problem, the options, a recommendation and
what we need to decide. When a point is settled, write the decision under it and mark it **decided**.

| # | Point | Status |
|---|---|---|
| 1 | [How a module reads the brand config](#1-how-a-module-reads-the-brand-config) | open |
| 2 | [What is "the Windows fallback" MAC?](#2-what-is-the-windows-fallback-mac) | open |
| 3 | [DEV-3 "merge rows under different platforms": runtime or data move?](#3-dev-3-merge-rows-under-different-platforms-runtime-or-data-move) | open |
| 4 | [V4 login: old devices and devices without a real MAC](#4-v4-login-old-devices-and-devices-without-a-real-mac) | open (B decided) |
| 5 | [The IBO store-review flag is on for IBO Player TV on Samsung](#5-the-ibo-store-review-flag-is-on-for-ibo-player-tv-on-samsung) | open |
| 6 | [Stacking yearly licenses, and what a revoke takes away](#6-stacking-yearly-licenses-and-what-a-revoke-takes-away) | open |
| 7 | [Phase 4 choices to confirm](#7-phase-4-choices-to-confirm) | open |
| 8 | [What is left before Phase 4 is done](#8-what-is-left-before-phase-4-is-done) | open |
| 9 | [Phase 5 questions to settle before it starts](#9-phase-5-questions-to-settle-before-it-starts) | answered (Ali to confirm) |
| 10 | [New backend vs old backends, side by side (27 Oct)](#10-new-backend-vs-old-backends-side-by-side-27-oct) | open (10.1–10.5 fixed, 10.7 kept) |
| 11 | [Phase 4 review findings (28 Oct)](#11-phase-4-review-findings-28-oct) | open |

---

## 1. How a module reads the brand config

Status: **open**. Omar to Ali, 26 Oct 2026. Raised while building DEV-1.

### The problem

DEV-1 needs `trial.days`: how long a new device's trial lasts. That value lives in the brand config
(`tenantConfig`), which belongs to the **tenants** module.

But our lint rule says **a module may not import another module**. So the devices module cannot
call `GetTenantConfigUseCase` directly.

Licensing, playlists and later modules will hit the same problem, so whatever we pick now becomes
the pattern for every module.

### Option A: each module asks through its own port (what is on `feature/devices` now)

1. The devices module declares what it needs, in its own words:

   ```ts
   // src/modules/devices/application/ports/device-settings.ts
   export abstract class DeviceSettings {
     abstract trialDays(): Promise<number>;
   }
   ```

2. The devices code only uses `DeviceSettings`. It does not know where the value comes from.

3. One file at the top of the app connects the port to the tenants module. Top-level files are
   allowed to import every module:

   ```ts
   // src/module-settings.ts
   export const DevicesWithBrandConfig = DevicesModule.forRootAsync({
     imports: [TenantsModule],
     settings: {
       inject: [GetTenantConfigUseCase, TenantContext],
       useFactory: (getConfig, context) => ({
         trialDays: async () => (await getConfig.execute(context.current)).trial.days,
       }),
     },
   });
   ```

4. `ApiModule` and `CliModule` import `DevicesWithBrandConfig` instead of `DevicesModule`.

This is the same shape NestJS's own libraries use, for example
`TypeOrmModule.forRootAsync({ imports, inject, useFactory })`.

**Good**

- Modules stay fully separate. The lint rule does not change.
- A module sees only the settings it asked for, not the whole brand config.
- Tests are easy. A fake is one small class, for example `trialDays() { return 7 }`.
- The config is read only when a rule needs it.

**Not so good**

- Every module that needs config adds a port and a few lines in `src/module-settings.ts`.
- It is a new pattern; nothing else in the code does this yet.

### Option B: put the brand config on the request context

The tenant middleware already loads the brand and its `TenantSettings` (the feature flags) into
`TenantContext`. We would load the business config there as well, once per request, from the
cache we already have. Any module then reads it directly:

```ts
const days = this.context.current.config.trial.days;
```

**Good**

- No port and no wiring per module.
- It matches how `TenantSettings` already works.

**Not so good**

- The config type moves into `src/shared`, so every module can see every other module's settings.
- The config is loaded on every request, even ones that do not need it. It comes from the cache,
  so the cost is small but real.
- Tests need a fake tenant context with a full config, not a one-line fake.
- CLI commands and jobs must also load the config when they pick a brand with `run()`.

### Side by side

| | A: port per module | B: config on the context |
|---|---|---|
| Modules stay separate | yes | less (shared config type) |
| Extra code per module | one port and one root binding | none |
| Testing | very easy | needs a fake context |
| Matches existing code | new pattern | like `TenantSettings` |
| Config loaded | only when needed | every request |

### Recommendation

**Option A.** It keeps the modules separate, which is the reason we have the lint rule, and the
extra code is small.

Choose B if we care more about matching `TenantSettings` and want less wiring per module.
Switching now is cheap: one port (`DeviceSettings`) and one file (`src/module-settings.ts`).
Switching later, after several modules copy the pattern, costs more.

### What we need from Ali

Pick A or B before Licensing or Playlists start reading brand config.

---

## 2. What is "the Windows fallback" MAC?

Status: **open**. Omar to Ali, 26 Oct 2026. Raised while building DEV-2.

### The problem

DEV-2 says: the fallback MACs `52:54:00:12:34:57`, `…:58`, `…:59` **and the Windows fallback** never
create or match a shared device.

I could not find a separate Windows MAC in the old code. In the old apps (`login_operation.js` in
iboplayer, bobplayer and crplayer):

- Every app starts with `mac_address = "52:54:00:12:34:57"`.
- On each platform the app then tries to read the real MAC and overwrites it.
- On **Windows** nothing overwrites it. The app only logs `"Windows test mac address"` and keeps
  `52:54:00:12:34:57`.
- The apps also treat `00:00:00:00:00:00` as "no MAC".

So as far as I can see, the Windows fallback **is** `52:54:00:12:34:57`.

### What is on `feature/devices` now

`src/modules/devices/domain/device-mac.ts` treats these as "no MAC":

- `52:54:00:12:34:57` (also what Windows sends)
- `52:54:00:12:34:58`
- `52:54:00:12:34:59`
- `00:00:00:00:00:00`

A device that sends one of them is found by its app device id or uid. If it is new, it gets a MAC
made from that id.

### What we need from Ali

- Did you mean a different value by "the Windows fallback"? If yes, which one, and where did you
  see it? Adding it is one line in `FALLBACK_MACS`.
- Is it fine to also treat `00:00:00:00:00:00` as "no MAC"?

---

## 3. DEV-3 "merge rows under different platforms": runtime or data move?

Status: **open**. Omar to Ali, 26 Oct 2026. Raised while building DEV-3.

### The problem

DEV-3 says: two rows for one device under different platforms are merged, keeping the paid one.

In the old IBO backend this happened **while the app was calling**. The old lookup used MAC +
app type, so a row saved under the wrong app type was not found, and a second row was created next
to it. Later, `resolveV4DeviceByMac` noticed the two rows and merged them
(`iboplayer-backend/controllers/ApiController.js`, around line 6186).

In the new schema this cannot happen any more:

- A MAC is unique per brand across `trialDevices` and `devices` (D18), with a unique index and the
  Redis lock.
- Lookups use the MAC only, never MAC + platform.

So the backend can never hold two rows for one MAC, and there is nothing to merge while apps call.
The only place two rows can still exist is **the old data**, when we move it into the new database.
`PLAN.md` already describes that merge ("Duplicate MACs found during migration"): pick the survivor
by best license, move playlists, keep the losers' ids in `legacy.mergedFrom`, and send hard cases to
manual review. The data move is a later phase.

### What is on `feature/devices` now

The part of DEV-3 that still matters while apps call:

- Every app on one MAC (IBO Player, Pro, TV, …) gets the same device. `appVersion` records the last
  caller.
- Called as another platform, a device that is **not V4 yet** takes the caller's platform, because
  old routes often stored it badly. An old row with no platform (`unknown`) also takes it.
- A **V4** device keeps its own platform, and a call as another platform is refused
  (`devices.platform_mismatch`). This is the same rule as the old `canV4AdoptAppType`.

No merge code was written.

### What we need from Ali

- Agree that the merge belongs to the data move (later phase), not to DEV-3. If yes, the DEV-3 line
  in [modules/devices.md](modules/devices.md#dev-3-one-device-for-ibo-player-pro-and-tv-wrong-app-type) should say so.
- Agree with the platform rule above, especially refusing a V4 device called as another platform.

---

## 4. V4 login: old devices and devices without a real MAC

Status: **open**. Omar to Ali, 26 Oct 2026. Raised while building DEV-4.

### What is on `feature/devices` now

- A MAC that never solved a V4 captcha must solve one to log in. Once solved, it is kept for that
  MAC and the device skips the captcha on every later login.
- A captcha can be answered **once**. A wrong answer uses it up too, so nobody can guess the same
  captcha many times. The app asks for a new one.
- An unanswered captcha expires after **5 minutes** (the old token lifetime).
- If the stored uid differs, the app must solve the uid recovery captcha, which shows the stored
  uid (same as the old cr backend). Then the new uid is stored.
- V4 login needs a **real MAC**. A fallback MAC (`52:54:00:12:34:57`, ...) is refused.

### Question A: do old devices skip the V4 captcha?

The old backends did not agree:

- **cr** asks every device for the captcha until it has `recaptcha_verified`, old devices too.
- **ibo** lets an old device skip it. A device that never used V4 (no `api_version`, or `V1`-`V3`)
  is a "genuine old user" and is not asked (`isLegacyV4Device`, `iboplayer-backend/controllers/ApiController.js`).

The new code does what **cr** does: no solved captcha for the MAC = captcha required. The data move
only creates a solved captcha for old devices that had `recaptcha_code` + `recaptcha_verified`.

So an IBO customer whose TV updates to the V4 app will see a captcha once, which they did not see
before.

Options:

1. Keep it: every device solves the captcha once. Simple, one rule for all brands.
2. Copy ibo: in the data move, also create a solved captcha for every old ibo device that never used
   V4. Their first V4 login then skips the captcha.
3. A brand setting (`v4.skipCaptchaForOldDevices`) checked at login.

**Recommendation:** option 2. It keeps ibo's behaviour, needs no rule in the login code, and only
touches the data move.

### Question B: what about V4 devices without a real MAC?

**Decided** (Omar, 26 Oct 2026): no V4 app runs without a real MAC. V4 login keeps refusing a
fallback MAC (`devices.usable_mac_required`); nothing else is needed.

---

## 5. The IBO store-review flag is on for IBO Player TV on Samsung

Status: **open**. Omar to Ali, 26 Oct 2026. Found while preparing DEV-6.

### The problem

The DEV-6 spec ([modules/devices.md](modules/devices.md#dev-6-v4-lock-and-store-review-builds)) said the old store-review flag "is off today". In the old IBO backend
it is **not fully off**.

`iboplayer-backend/controllers/ApiController.js`, around line 1076:

```js
var samsung_test=false, lg_test=false, vidaa_test=false, windows_test=false;
var samsung_prev_version='1.1.4', lg_prev_version='1.1.6', ...;
if (from === 'ibo_player_tv') {
    samsung_test = true;          // <- switched on for IBO Player TV
    samsung_prev_version = '1.0.5';
    ...
}
```

and around line 1240:

```js
if (app_type === 'samsung' && samsung_test && version > samsung_prev_version)
    expired = false;   // then expire_date = '2438-11-01', is_trial = 2 (lifetime)
```

So today **every IBO Player TV app on Samsung with a version above `1.0.5` is answered as
lifetime**, even when its trial has ended and it never paid. It looks like a store-review build
that was never switched off.

Also, `version > samsung_prev_version` compares the versions as text, so for example `1.0.10` is
smaller than `1.0.5`.

### What the new code does (DEV-6)

The hard-coded flags are replaced by a per-brand list of exact review builds (platform + version)
in the brand config, **empty by default**. Only a build on that list is answered as lifetime, and
staff remove it when the review is done. Nothing is answered as lifetime by default.

### What we need from Ali

- Confirm this is a leftover and not on purpose.
- After the switch, IBO Player TV Samsung users above `1.0.5` who never paid will see their trial
  as ended. Do we warn anyone (support, the IBO owner) before we go live?
- Should the old backend be fixed now, before the new one goes live, to stop the leak?

---

## 6. Stacking yearly licenses, and what a revoke takes away

Status: **open**. Omar, 26 Oct 2026. Raised while testing LIC-2 and LIC-3 in the playground.

### What is on `feature/licensing` now

- **Stacking (LIC-1, as written in the plan):** a year bought while a trial or year is running starts
  where it ends, like the old backends' `max(today, expire_date) + 1 year`. A device can pay three
  times in a row and run three years ahead.
- **Revoke (LIC-3):** revokes the device's current license only (the newest one). The device then
  stops completely (`revoked`, old `is_trial` 1), like the old backends.

### The problem

The two rules do not fit together. Example:

- payment 1: a year, ending 2 Nov 2027;
- payment 2: another year, stacked, ending 2 Nov 2028 (now the current license);
- payment 2 is refunded, so the current license is revoked.

The device stops working, although payment 1 was never refunded and should still cover it until
2 Nov 2027.

### Proposal: one running year at a time, lifetime as the upgrade

Omar's idea: do not stack years. While a year is running, refuse another year and offer lifetime
instead. Then a device has at most one running license, and a refund takes back exactly that one.

The cost: a customer could no longer renew early. Today (and in all three old backends) a customer
whose year ends on 2 Nov can pay on 20 Oct and lose nothing. With "refuse while a year runs" they
must wait until it ends, have a gap, then pay. Resellers renew early all the time.

A middle way, keeping the idea but allowing a short renewal window:

| The device has | A year | Lifetime |
|---|---|---|
| a trial | ✅ starts now (keep the trial days left, or not: see question 2) | ✅ |
| a year with **more than 30 days** left | ❌ "already active; you can upgrade to lifetime" | ✅ upgrade |
| a year with **30 days or less** left | ✅ renew: starts when the current year ends | ✅ upgrade |
| an expired or revoked license | ✅ starts now | ✅ |
| lifetime | ❌ | ❌ |

At most two years can then overlap (the running one and its renewal).

### And what a revoke does

| | A revoke means | After revoking payment 2 in the example |
|---|---|---|
| **A. Now** (as the old backends) | the device stops | revoked, cannot play |
| **B. Fall back** | only that payment's time is taken away; the device runs on its newest license that is not revoked and still running | runs on payment 1 until 2 Nov 2027 |
| **C. Revoke everything** | every license of the device is revoked (abuse, chargeback fraud) | revoked, cannot play |

**Recommendation:** B as the normal revoke, C as a separate "revoke all".

### What we need to decide

1. Stacking as now, **no second year while one runs**, or the **30-day renewal window**?
2. When a trial device pays: keep the trial days left (as now), or start the year today?
3. Upgrading to lifetime in the middle of a year: the months left are lost (as the old backends
   did). Is that fine?
4. Revoke: A (as now), or B with C as an extra "revoke all"?

LIC-1 and LIC-3 change once this is decided; the stacking rule in [modules/licensing.md](modules/licensing.md) and [SCHEMA.md](SCHEMA.md) §4 changes with it.

---

## 7. Phase 4 choices to confirm

Status: **open**. Ali to Omar, 27 Oct 2026. Made while building Recovery, Provider domain moves and Expiry and
cleanup ([ROADMAP.md](ROADMAP.md), Phase 4 · Moves and cleanup). Each is built as written; say if one should change.

### Recovery (REC-1 to REC-3)

1. **The old MAC keeps an ended trial device** after a recovery, as after a MAC switch, so the old TV cannot start
   a new trial. The test scenario E2E-R1 said "old MAC free"; the old backends kept a device there too (ibo: the
   orphan, cr: the old device with its trial ended today).
2. **A paid device on the new MAC refuses the recovery.** ibo pushed that device off the MAC (and marked it for
   deletion); cr refused only when it had a longer subscription. Refusing keeps "one MAC, one device" simple.
3. **The license must be running** to make a code and to use it (cr checked; ibo checked only for the code).
4. **A recovery does not count as a MAC switch**, so a device that switched once can still be recovered.

### Provider domain moves (DOM-1, DOM-2)

5. **Learned only from a paid device editing its own playlist** (host-only change). cr also learned "mirrors" from
   backup hosts; the bulk sync (`update_playlist`) does not report. Both can be added later.
6. **One confirmation per IP and per device**, so one device on changing IPs counts once.
7. **Served as a swap, with the old host kept as the first backup link.** cr never swapped: it only added the new
   host as a backup. The swap is what DOM-2 asks for; the backup keeps a wrong approval from breaking playlists.
8. **Each server caches the approved list for a minute.** An approval reaches other servers within a minute.

### Expiry and cleanup (LIC-4)

9. **Rule: trial ended, `playlistCount` 0, not seen for 180 days**, dry run by default. The old backends used 6
   months (ibo), 120 days (bob) and 400 days (cr). It is a command for now, not a scheduled job.
10. **A removed device that comes back gets a new trial.** The alternative is to never delete trial devices
    (they are small) and only use the cleanup for devices from the data move.

### What we need to decide

Agree or change 1–10. 9 is the one the LIC-4 task itself asks us to agree before a real run.

---

## 8. What is left before Phase 4 is done

Status: **open**. Ali, 27 Oct 2026. Every Phase 4 feature is built and tested (unit 513, integration 51, every
end-to-end script green; [phases/phase-4-moves-and-cleanup-tests.md](phases/phase-4-moves-and-cleanup-tests.md)).
What is left is checking it together and agreeing on decisions. Tick each item when it is done.

| # | Item | Who | What "done" means |
|---|---|---|---|
| 8.1 | **Merge point "Device core works"** | Ali, then both | on one brand: add and sync playlists, switch the MAC of a paid device, recover it on a new TV, approve a provider move, dry-run the cleanup; each step shows the right state and replies |
| 8.2 | **CORE: the whole device core on two brands** | both | register, add playlists, activate, extend, switch MAC, recover, revoke; a provider move reported, approved and served; then the same on a second brand, and nothing from the first is visible in the second. Today the end-to-end scripts use the `ibo` brand only; isolation is proven by the integration tests, not by a full run. A script for this (`pnpm e2e:core`) is still to write |
| 8.3 | **Confirm the ten Phase 4 choices** | both | each point of [#7](#7-phase-4-choices-to-confirm) agreed or changed; code and specs follow any change |
| 8.4 | **Agree the cleanup rule (LIC-4)** | both | the rule written in [modules/licensing.md](modules/licensing.md#lic-4-expiry-and-cleanup-of-old-devices) is agreed (now: trial ended, no playlist, not seen for 180 days); a dry run on real-looking data gives a report we both accept. No real cleanup runs before this |
| 8.5 | **Omar reviews Phase 4** | Omar | the branch `phase/4-moves-and-cleanup` reviewed, most of all Expiry and cleanup, which was his task and Ali built |
| 8.6 | **CI and Docker** | Ali | a pull request for each phase branch so GitHub runs CI (it runs only on `master` and pull requests); the Docker build (`docker build -t unified-backend:ci .`), CI's last step, green. Not run yet |
| 8.7 | **Phase 3 discussions #1–#6** | both | settled; #6 (yearly stacking and what a revoke takes away) can change the license rules MAC switch and recovery rely on (a running license) |
| 8.8 | **The playground on the Phase 3 branch** | Ali | decide whether `phase/3-core-features` gets the new playground design (its own features only; the old page still says "Phase 1 device rules"), or stays as Omar built it |

Not part of Phase 4, on purpose: the old apps' recovery route (`/api/:appType/v4/apply_recovery`) and the website's
recovery-code route come with the later old-app and website phases.

### What we need to decide

Who does 8.1, 8.2 and 8.6 and when; then work through 8.3, 8.4 and 8.7 together; 8.5 by Omar; 8.8 by Ali.

---

## 9. Phase 5 questions to settle before it starts

Status: **open**. Ali, 27 Oct 2026. Phase 5 · Accounts and staff (customers, staff users, roles, permissions) is
planned, not started: [phases/phase-5-accounts-and-staff.md](phases/phase-5-accounts-and-staff.md), and the tests it
must add in [phases/phase-5-accounts-and-staff-tests.md](phases/phase-5-accounts-and-staff-tests.md).

1. **Sessions:** signed tokens (JWT) with a short life and a refresh token, or server sessions in Redis (a disabled
   staff member is cut off at once)?
2. **Two-factor login for staff** (PLAN M5): in Phase 5 or later?
3. **Email:** which service sends verification and reset links, and with which sender per brand?
4. **Old customer passwords:** are cr `User` passwords bcrypt hashes we can verify as they are? (cr admins use
   bcrypt.)
5. **Day-one roles:** only `super_admin`, or also Support, Billing and Content editor from a seed?
6. **Linking a TV to a customer:** by MAC + device key (as the old site logs in), or only through recovery and
   payments?
7. **Who builds what** in Phase 5, and the task ids (ACC-, CUS-, PRM-, STF- are proposals).

### What we need to decide

Answers to 1–7, written under each, before the branch `phase/5-accounts-and-staff` is made.

### Answers (Omar, 28 Oct; Ali to confirm at the meeting)

1. **Sessions:** server sessions in Redis: an opaque session id, looked up on each request. Disabling a staff
   member or changing a password cuts the sessions off at once.
2. **Two-factor login for staff:** in Phase 5, with authenticator-app codes (TOTP).
3. **Email:** SMTP per brand, like the old backends (nodemailer): host, user and password in the brand's secrets, the
   sender address in its config. A provider (SES, Resend, …) can replace it later behind the same port.
4. **Old customer passwords:** yes, cr `User` passwords are bcrypt (cost 10): `bcrypt.hash` on sign-up and reset,
   `bcrypt.compare` at login (`cr-unified-backend/controllers/FrontendController.js` around 5050, 5232, 5354). They
   are moved as they are and verified as they are; no reset needed.
5. **Day-one roles:** `super_admin` (locked) plus Support, Billing and Content editor, seeded with their permissions.
6. **Linking a TV to a customer:** by MAC + device key, as the old websites did; payments and recovery link it too.
7. **Who builds what:** Omar builds all of Phase 5 (ACC, CUS, PRM, STF, keeping the proposed task ids); Ali reviews.

---

## 10. New backend vs old backends, side by side (27 Oct)

Status: **open**. Ali, 27 Oct 2026. Compared live on the Phase 4 branch before pushing it. All three old backends
(iboplayer, bobplayer, cr-unified with brand cr7) ran locally next to the new one, sandboxed: no outbound network,
throwaway databases, the same device token key as the new backend. The same requests, in the apps' own encoding,
went to both sides; each answer was compared field by field. bob and cr could not install their own packages here
(npm timed out), so they ran on ibo's installed packages, with mongoose 6's query default restored for cr; their
recorded traffic (`test/fixtures/legacy/http`) gives the same answers, which confirms the setup.

### What matches

| Area | Scenarios | Result |
|---|---|---|
| V4 login (ibo, bob, cr) | recaptcha for a new MAC; login without captcha; wrong captcha; right captcha; recaptcha again (`already_verified`); login again without captcha; another uid (`uid_mismatch_captcha`) | same status and the **same messages, word for word** |
| V4 device_info (ibo, bob, cr) | trial device; no token (401, "Device login token is required"); forged token; after paying a year | same status, `is_trial`, `expire_date` (trial), `device_key`, `has_own_playlist`, `mac_registered`, `trial_days`, `is_expired` |
| Device token | the same algorithm and key (base64 of the XOR of "id,mac") | same format; the token text differs only because the device id inside differs (see 10.1) |
| MAC switch (DEV-7) vs `switch-mac-address` (ibo, bob, cr) | lifetime to a registered MAC; yearly without and with `allow_one_year`; multi-device order; trial device; a second switch | **same decision in every case**; the old messages are kept by the old-app route when it is built |
| Recovery (REC-2) vs `apply_recovery` (ibo, bob, cr) | a lifetime device recovered on a new TV with an 8-character code, any case | all move the device; the new TV ends up paid (`is_trial` 2 on the old ones, a paid device here) |
| Xtream link in replies | the server goes out as `http://host:port/` | the same as old bob's own recording |
| cr `edit_playlist` on another device's playlist | the playlist id of another device | refused on both |

### What differs

| # | Difference | Where | Impact | Proposal |
|---|---|---|---|---|
| 10.1 | **A token issued by an old backend is refused by the new one.** The token carries the old Mongo `_id`; the new backend looks the device up by its new UUID only, so after the data move every logged-in V4 app gets 403 on `device_info` once | V4 routes (Phase 3) | at the data move only; the app then logs in again (its solved captcha is moved, so no new captcha) | look the token's id up in `legacy.id` as well (a small change in the V4 controller + a test) |
| 10.2 | `notification_interval`: old bob sends `"1000000"` (text, from its settings); the new backend sends `300` (a number) | V4 device_info (Phase 3) | an app that reads it as text, or relies on the long interval, behaves differently | per-brand value from brand config, sent as text like the old backends |
| 10.3 | `origin_type` is missing from playlist entries (old ibo and bob send it, e.g. `"general"`) | V4 device_info (Phase 3) | apps that read it get `undefined` | add it (already in the compatibility list for Omar) |
| 10.4 | cr's `rasp_enforce: false` is missing | V4 device_info (Phase 3) | none if the app treats missing as false | add it for cr brands |
| 10.5 | Extra keys the old backend did not send: `stalker_enabled`, `real_time_notification` (all three), `parent_pin` (ibo, cr; bob sends it), `notification` and `notification_interval` (cr) | V4 device_info (Phase 3) | usually none (apps ignore unknown keys) | keep, or send per brand exactly what each old backend sent |
| 10.6 | The demo playlist: old bob sends its demo link; the new backend sends an empty link for bob | brand config | the bob demo is empty until `app.demoUrl` is set for bob | set `app.demoUrl` per brand in the data move (config, not code) |
| 10.7 | cr `PUT /api/edit_playlist`: old cr answers the whole playlist (`status: "Active"`, url, name, …); the new one answers `{status: "success", msg, id}` | legacy route (Phase 3) | only if CRPlayer reads the reply (to check) | answer like cr if the app reads it |
| 10.8 | An unknown app type in the path: old answers an HTML 404, the new one a JSON 404 | V4 routes | none (apps never call it) | keep |
| 10.9 | After a recovery, ibo moves the new TV's own device onto the old MAC and marks it for deletion; the new backend removes it with its playlists and leaves an ended trial on the old MAC | REC-3 (Phase 4) | intended (REC-3); see #7 point 1 | confirm in #7 |

Not compared: routes the new backend does not have yet (legacy `playlist_info`, `update_playlist`,
`changeParentPin`, V4 `manage/*`, store routes): they come with the later old-app phases.

### What we need to decide

Fix 10.1–10.4 and 10.7 now on the Phase 3 branch (then merge up), or with the old-app phase; confirm 10.5, 10.6,
10.8, 10.9.

### Decided (Omar, 28 Oct)

Fixed on `phase/3-core-features` (commit `5f531df`) and merged up into this branch:

| # | Fix |
|---|---|
| 10.1 | A V4 token's device id is looked up as a device id, then as an old `_id` (`legacy.id`), in both device collections (`FindDeviceByTokenIdUseCase`); the MAC check still applies |
| 10.2 | `notification_interval` is sent as text from the brand setting `legacy.notificationInterval` (default `"300"`; bob's old value is `"1000000"`) |
| 10.3 | `origin_type` is sent with every playlist entry: `general` for a link (M3U or Xtream), `stalker`, `code` |
| 10.4 | `rasp_enforce` is sent when the brand setting `legacy.raspEnforce` is not null (cr brands: `false`), in every device_info answer, errors included |
| 10.5 | `stalker_enabled` is no longer sent; the notification fields only when `legacy.notificationFields` is on (ibo, bob; off for cr). `parent_pin` stays for every brand: the IBO app reads it and warns when it is missing |
| 10.7 | Not changed: CRPlayer only logs the `edit_playlist` reply |

The defaults match ibo and bob. Each cr brand needs `legacy.raspEnforce false` and
`legacy.notificationFields false` (the data move sets them; locally `pnpm cli tenant:set <slug> legacy.raspEnforce false`).
Still to confirm: 10.6, 10.8, 10.9.

---

## 11. Phase 4 review findings (28 Oct)

Status: **open**. Omar to Ali, 28 Oct 2026. A code review of `phase/3-core-features...phase/4-moves-and-cleanup`
(docs skipped), plus the full end-to-end run (`e2e:moves`, `devices`, `playlists`, `licenses`, `v4`: 142/142 on a
throwaway database) and a `devices:cleanup` dry run. Nothing below is changed yet; one Node check confirmed finding 1,
the others come from reading the code.

| # | Where | Finding | Example |
|---|---|---|---|
| 1 | `playlists/domain/served-host-move.ts:30` | `url.host = move.toHost` keeps the link's old port when `toHost` has none | move `line.example:8080` → `line2.example` serves `http://line2.example:8080/…` |
| 2 | `served-host-move.ts:24` | moves match on `url.host` only and `toScheme` overwrites the scheme | an `https://cdn.example/…` link is served as `http://cdn2.example/…` when the move was learned from http |
| 3 | `domain-migrations/…/decide-host-move.use-case.ts:49` | approve/block writes back the whole document (`replaceOne`), so confirmations added meanwhile are lost | `$set` only status, decidedBy, decidedAt, updatedAt |
| 4 | `playlists/…/playlist-reply.use-case.ts:52` | the reply waits on `hostMoves.approved()` (central DB) with no fallback | a slow or down central DB breaks every playlist reply; fall back to `[]` or the last list |
| 5 | `devices/application/ended-trial.ts:32` | the ended trial left on the old MAC after a switch or recovery matches the LIC-4 rule | 180 days later the cleanup deletes it and the old TV gets a fresh trial; mark it so the cleanup skips it |
| 6 | `devices/application/device-identity.ts:242` | in `changeLockedMac` the irreversible steps (absorb, delete the trial) run before the paid device is updated, with no undo | a crash after deleting the new TV's trial and playlists leaves that MAC with nothing while the paid device keeps the old MAC |
| 7 | `licensing/domain/recovery-code.ts:13` | only 8-character codes from the new alphabet are accepted | a 6-digit code made on the old website just before the switch-over never works |
| 8 | `playlists/…/edit-playlist.use-case.ts:129` | for Xtream the reported link is the bare server, so any server change counts as a provider move | users leaving provider A for B "confirm" a move A → B; approving it redirects every A user |
| 9 | `domain-migrations/…/report-host-move.use-case.ts:77` | the move report adds two central-DB round trips plus a brand read inside the playlist edit request | have `confirm` return the updated row, and do not await the report |
| 10 | `src/main.cli.ts:57` | a flag with no value (`--days` last) is taken as a brand slug | `devices:cleanup --apply mybrand --days` runs on `['mybrand','--days']` instead of printing usage |

### What we need to decide

Which of these to fix in Phase 4 before it is done (#8), and who fixes them. 1, 3, 5 and 8 change what users get.

