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
  in the Phase 1 README should say so.
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

The Phase 1 README (DEV-6) says the old store-review flag "is off today". In the old IBO backend
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

LIC-1 and LIC-3 change once this is decided; the stacking rule in the Phase 1 README changes with it.
