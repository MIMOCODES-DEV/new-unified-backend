# DEV-01 — Device and License rules

> The rules for the `Device` entity and the `License` value object, in plain English.
> Taken from the three old backends (file:line evidence was checked on 2026-10-19), PLAN §5.3 and the CAP-06 data profiles.
> **Your job:** turn each rule into a test, watch it fail, write the code that makes it pass. No database, no HTTP in DEV-01.

## How to work

1. Copy `src/modules/_template` to `src/modules/devices`; rename `Example` → `Device`.
2. Create `domain/license.ts` and `domain/license.spec.ts` first (License has no dependencies), then `domain/device.entity.ts` + `device.entity.spec.ts`.
3. Run `pnpm test:watch` — tests rerun on every save.
4. One rule → one `it('…')`. The test names below are suggestions; copy them.
5. Never call `new Date()` inside the domain. Pass `now` in (see `src/shared/kernel/clock.ts`), so tests can pick any date.
6. Business failures return `Result` errors (see `src/shared/kernel/result.ts`); never throw for them.
7. Rules marked **⚖ Decide** are open: agree on an answer together (or ask), write it here, then test it.

---

## Part 1 — `License` (value object)

A license says *what* the device paid for and *until when*. It is immutable: every change returns a **new** License.

| Old `is_trial` | Meaning | New `License` |
|---|---|---|
| 0 | free trial | `type: 'trial'` |
| 1 | revoked/deactivated (also used as trial or timed code in a few old paths) | `revoked: true` (migration decides per case — not your problem in DEV-01) |
| 2 | lifetime | `type: 'lifetime'`, `expiresAt: null` |
| 3 | one year | `type: 'yearly'` |

"Expired" was never stored in the old code — it is calculated from the date. Keep it that way: **status is computed, not saved.**

### L1 — Trial
- A trial starts now and ends after `trialDays` days (the brand's setting; old default **7**).
- `trialDays` must be a whole number from 1 to 365; anything else is refused.
- Old code stored the date only (`YYYY-MM-DD`) and the device stayed valid **through the whole last day**. Keep that: `expiresAt` = end of that day (23:59:59.999).
- ⚖ **Decide — timezone of "end of day":** old code used the server's local time (a bug: it changed with the server). Proposal: **UTC**.

```
it('starts a trial that ends at the end of the day, trialDays from now')
it('refuses trialDays of 0, negative, fractional or above 365')
```

### L2 — Is it active?
- `isActive(now)`: not revoked **and** (lifetime **or** `now <= expiresAt`).
- `status(now)` returns one of: `'trial' | 'active' | 'expired' | 'revoked'`.
  - revoked → `'revoked'` (checked first)
  - lifetime → `'active'`
  - past `expiresAt` → `'expired'`
  - otherwise → `'trial'` for a trial, `'active'` for yearly

```
it('is active until the last millisecond of the expiry day, expired one millisecond later')
it('a lifetime license is always active')
it('a revoked license is never active, even with a future date')
it('reports trial / active / expired / revoked status')
```

### L3 — Add one year (`extendYearly(now)`)
- Old rule (same in all 3 backends — coupons, admin, reseller): **stacking**.
  New end = (current end if still in the future, otherwise now) **+ 1 year**, end of day.
- The license becomes `type: 'yearly'` (a trial that gets a year becomes yearly).
- A revoked license can be extended again: it restarts from **now** and is no longer revoked.
- Extending a **lifetime** license is refused (`licenses.already_lifetime`).
- ⚖ **Decide — trial days left over:** old code stacks on top of the trial too (7-day trial + 1 year = 1 year 7 days). Keep (proposal) or start from now?

```
it('adds one year to a license that is still running (stacking)')
it('adds one year from now to an expired license')
it('turns a trial into a yearly license')
it('restarts a revoked license from now')
it('refuses to add a year to a lifetime license')
```

### L4 — Lifetime (`makeLifetime()`)
- Becomes `type: 'lifetime'`, `expiresAt: null` (old code faked it with "+5000 months" or `2438-07-06`; we don't).
- Making a lifetime license lifetime again is refused (`licenses.already_lifetime`). Old code refused this in coupons, codes and reseller paths but not in admin/payment paths — **we refuse everywhere**; a payment use case can decide to refund.
- A revoked license can become lifetime (no longer revoked).

```
it('makes a license lifetime with no expiry date')
it('refuses to make a lifetime license lifetime again')
it('a revoked license can become lifetime')
```

### L5 — Revoke (`revoke()`)
- Any license that is not already revoked can be revoked. The dates are kept (so history shows what was there).
- Revoking twice is refused (`licenses.already_revoked`).
- Old code revoked by setting the date to "yesterday" and `is_trial = 1`; we use a real `revoked` flag.

```
it('revokes an active license and keeps its dates')
it('refuses to revoke an already revoked license')
```

### L6 — Credit cost
- Resellers pay in credits: **yearly = 1 credit, lifetime = 2 credits**, trial = 0. (Old `credit_count`.)
- The License only *tells* the cost (`creditCost`); spending credits is IDN work, not DEV-01.

```
it('costs 1 credit for yearly, 2 for lifetime, 0 for a trial')
```

---

## Part 2 — `Device` (entity)

A device is one TV/phone of one brand, identified by its MAC address.

### D1 — Register (`Device.register(...)`)
- Needs a valid `MacAddress` (already exists: `src/shared/kernel/mac-address.ts` — it normalizes `AA-BB-…`, `aabb…` to `aa:bb:…`).
- Needs an `appType` from a fixed list, **lowercase** — the values the old V4 routes and controllers use:
  `android, android_tv, fire_tv, samsung, lg, vidaa, zeasn, philips, titanos, vegaos, windows, macos, linux, ios, tvos, roku`, plus `unknown` (for migrated rows with no app type — 683 in the bob sample).
  Anything else → refused. The old data mixes case (`iOS`, `tvOS`, `macOS`): lowercase first, then check, so `iOS` → `ios` is accepted.
- ⚖ **Decide:** old code also spells `androidtv` (no underscore) in a few places. Proposal: accept it and store `android_tv`.
- Starts with a **trial license** (L1) and a **new device key** (D2).
- Starts in state `'pending'` (a registration that has not shown real use yet — promotion is DEV-04).
- Remembers `createdAt = now` (old data has a creation date on only 0.2% of devices).

```
it('registers a device with a normalized MAC, a trial and a 6-digit key')
it('accepts app types in any case and stores them lowercase')
it('refuses an unknown app type')
it('starts as pending')
```

### D2 — Device key
- 6 digits, `100000`–`999999`, **stored as a string** (old data: 0.1% are not numeric and must keep working — only *new* keys follow this format).
- The domain must not use `Math.random()` directly: take a generator function as input, so tests are predictable.
- `regenerateKey()` gives a new key that is **different** from the current one. (No old backend had per-device regenerate; this is new — DEV-07 builds the use case.)

```
it('creates a 6-digit key from the generator')
it('regenerates a key different from the current one')
```

### D3 — Licensing a device
- `device.extendYearly(now)`, `device.makeLifetime()`, `device.revoke()` call the License rules and return the same errors.
- A **paid** license (yearly or lifetime) moves a `'pending'` device to `'active'` (a paying device is real use).
- `device.isActive(now)` = `license.isActive(now)`.

```
it('a pending device becomes active when it gets a paid license')
it('passes license errors through (lifetime twice is refused)')
```

### D4 — Restore from storage
- `Device.restore(props)` rebuilds a device without running the rules (same pattern as `Tenant.restore`). Only repositories call it.

---

## Not in DEV-01 (later tasks — don't build yet)

| Rule | Task |
|---|---|
| Unique MAC per brand, indexes, saving | DEV-02 |
| Register-or-get use case, trial days from brand config, random MAC from `app_device_id` | DEV-03 |
| Pending → active promotion rules, trial history (no second trial) | DEV-04 |
| `u_id` (6 letters/digits, uppercase) + captcha | DEV-06 |
| Parent PIN (exactly 4 digits, **hashed**; old code stored it in plain text) | DEV-07 |
| MAC switch (once, lifetime only; blocked by `multiActivate`) | DEV-08 |
| Recovery code, old MAC pending deletion 30 days | DEV-09 |

## Old bugs we must NOT copy

- Dates as strings compared alphabetically; some written unpadded (`2026-1-5`) so the comparison breaks.
- "Now" frozen when the server started (`const currentDate = new Date()` at the top of the file).
- Lifetime faked as "+5000 months"; 23,185 "lifetime" devices in the bob sample have a date in the past.
- Device keys with no uniqueness check; parent PINs stored in plain text.
- A typo field `exprie_date` written by one payment path.
