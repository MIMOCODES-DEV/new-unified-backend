# Device Registration (pending → paid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `devices` module that registers-or-gets a device by MAC in the current brand's database (new devices go to `pendingDevices` on a 7-day trial and are never removed) and moves a device into `devices` only when it pays.

**Architecture:** New clean-architecture module `src/modules/devices/`, modelled on `src/modules/_template/`: pure domain (`Device` entity with state `pending | paid`, `AppType`), application (ports + `RegisterOrGetDeviceUseCase` + `ActivateDeviceUseCase`), infrastructure (one Mongo repository over two collections via `TenantDb`, a MongoDB transaction for the move, random key generator, tenant migration). Exposed through `index.ts`, wired into `CliModule`, tried with two CLI commands. No HTTP route.

**Tech Stack:** Node 24, TypeScript strict (ESM, `.js` import suffixes), NestJS 12 DI, MongoDB native driver 7 (transactions on the local replica set), Vitest 5, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-10-19-device-registration-design.md` · Diagrams: `docs/diagrams/device-registration.md`

## Global Constraints

- Collections in the brand DB only, through `TenantDb` (`src/shared/tenancy/tenant-db.ts`): `pendingDevices` (not paid) and `devices` (paid only). No other collection.
- A device is written to `devices` only by `ActivateDeviceUseCase`. Nothing is ever deleted from `pendingDevices` except by that move. No TTL index.
- Trial length 7 days (`TRIAL_DAYS` in `src/modules/devices/domain/device.policy.ts`), `trialExpiresAt = now + 7 × 24 h`, UTC instant.
- Device key: 6 digits, integer `100000`–`999999` inclusive, stored as a string, unique across **both** collections of a brand; max 5 attempts per registration.
- MAC normalized with `MacAddress.parse` (`src/shared/kernel/mac-address.ts`); unique per collection; lookups check `devices` first, then `pendingDevices`.
- App type: trimmed, lowercased, `^[a-z0-9_]{1,32}$`.
- Domain/application code never calls `new Date()`; time comes from the injected `Clock` (`src/shared/kernel/clock.ts`).
- Indexes only via tenant migration id `0001-devices-indexes`, appended to `tenantMigrations` in `src/migrations.ts`.
- Other code imports the module only through `src/modules/devices/index.ts`; `index.ts` exports only what something imports (knip).
- Error codes: `kernel.invalid_mac_address` (existing), `devices.invalid_app_type`, `devices.not_found`.
- Branch `feat/device-registration`; never stage `.gitignore`, `eslint.config.js` or `playground/`.

## Review Focus

1. Two concurrent first requests for the same MAC → exactly one `pendingDevices` document; both callers get the same device id. (Task 3 integration.)
2. The same MAC written differently (`AA-BB-CC-DD-EE-FF`, `aabb.ccdd.eeff`, `aabbccddeeff`) → one device. (Task 2 unit.)
3. Two concurrent activations of the same MAC → one `devices` document, `pendingDevices` empty for that MAC, one caller gets `activated`, the other `already_paid`. (Task 3 integration.)
4. A new trial device must not get a device key already used by a paid device (keys are freed from `pendingDevices` when a device moves). (Task 2 unit, Task 3 integration.)
5. A returning device whose trial expired gets its old record back unchanged (same key, same `trialExpiresAt`, `isTrialExpired === true`), never a new trial. (Task 2 unit.)

---

### Task 1: Domain — `Device`, `AppType`, policy, errors

**Files:**
- Create: `src/modules/devices/domain/device.policy.ts`
- Create: `src/modules/devices/domain/device.errors.ts`
- Create: `src/modules/devices/domain/app-type.ts`
- Create: `src/modules/devices/domain/device.entity.ts`
- Test: `src/modules/devices/domain/app-type.spec.ts`, `src/modules/devices/domain/device.entity.spec.ts`

**Interfaces:**
- Consumes: `MacAddress`, `Result/ok/err`, `DomainError` from `src/shared/kernel/`.
- Produces:
  ```ts
  // device.policy.ts
  export const TRIAL_DAYS = 7;
  export function addDays(date: Date, days: number): Date; // + days × 86_400_000 ms

  // device.errors.ts
  export class InvalidAppTypeError extends DomainError { readonly code = 'devices.invalid_app_type' }
  export class DeviceNotFoundError extends DomainError { readonly code = 'devices.not_found' }

  // app-type.ts
  export class AppType { readonly value: string; static parse(input: string): Result<AppType, InvalidAppTypeError> }

  // device.entity.ts
  export type DeviceState = 'pending' | 'paid';
  export interface DeviceProps {
    id: string; macAddress: MacAddress; appType: AppType; deviceKey: string; state: DeviceState;
    trialExpiresAt: Date; createdAt: Date; lastSeenAt: Date; activatedAt: Date | null;
  }
  export class Device {
    static registerTrial(input: { id: string; macAddress: MacAddress; appType: AppType; deviceKey: string; now: Date }): Device;
    static restore(props: DeviceProps): Device;
    // getters for every prop, plus:
    get isPaid(): boolean;
    isTrialExpired(now: Date): boolean;  // trialExpiresAt <= now
    recordVisit(now: Date): void;        // lastSeenAt = now
    activate(now: Date): boolean;        // pending → paid, activatedAt = now; false (no change) if already paid
  }
  ```

- [ ] **Step 1: Create the branch**

Run: `git switch -c feat/device-registration`
Expected: `Switched to a new branch 'feat/device-registration'`

- [ ] **Step 2: Write the failing tests**

`app-type.spec.ts`:
- `AppType.parse('  Fire_TV ')` → ok, `value === 'fire_tv'`.
- each of `''`, `'   '`, `'a'.repeat(33)`, `'fire-tv'`, `'lg tv'`, `'ios!'` → not ok, `error.code === 'devices.invalid_app_type'`.

`device.entity.spec.ts` (`mac = MacAddress.parse('AA:BB:CC:DD:EE:01')`, `app = AppType.parse('samsung')`, `now = new Date('2026-10-19T10:00:00Z')`):
- `registerTrial` → `state === 'pending'`, `isPaid === false`, `trialExpiresAt` = `2026-10-26T10:00:00Z`, `createdAt` and `lastSeenAt` = `now`, `activatedAt === null`, `isTrialExpired(now) === false`, `isTrialExpired(new Date('2026-10-26T10:00:00Z')) === true`.
- `recordVisit(later)` → `lastSeenAt === later`, `trialExpiresAt` unchanged.
- `activate(later)` → returns `true`, `state === 'paid'`, `activatedAt === later`, `id`, `deviceKey`, `trialExpiresAt` unchanged.
- `activate` on a paid device → returns `false`, `activatedAt` unchanged.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/modules/devices/domain`
Expected: FAIL (modules not found)

- [ ] **Step 4: Implement the four domain files** with the interfaces above.

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `pnpm vitest run src/modules/devices/domain && pnpm typecheck && pnpm lint`
Expected: PASS, no errors

- [ ] **Step 6: Commit**

```bash
git add src/modules/devices/domain
git commit -m "feat(devices): add device entity with trial and paid states"
```

---

### Task 2: Application — ports and use cases

**Files:**
- Create: `src/modules/devices/application/ports/device.repository.ts`
- Create: `src/modules/devices/application/ports/device-key.generator.ts`
- Create: `src/modules/devices/application/use-cases/register-or-get-device.use-case.ts`
- Create: `src/modules/devices/application/use-cases/activate-device.use-case.ts`
- Create: `test/support/in-memory-device.repository.ts`
- Test: `src/modules/devices/application/use-cases/register-or-get-device.use-case.spec.ts`, `src/modules/devices/application/use-cases/activate-device.use-case.spec.ts`

**Interfaces:**
- Consumes: everything Task 1 produces; `Clock`, `FixedClock`.
- Produces:
  ```ts
  // ports (abstract classes, used as Nest tokens)
  export type InsertResult = 'inserted' | 'mac_taken' | 'key_taken';
  export type MoveResult = 'moved' | 'not_pending';
  export abstract class DeviceRepository {
    abstract findPaidByMac(mac: MacAddress): Promise<Device | null>;      // devices
    abstract findPendingByMac(mac: MacAddress): Promise<Device | null>;   // pendingDevices
    /** Inserts into pendingDevices. 'key_taken' if the key exists in EITHER collection. */
    abstract insertPending(device: Device): Promise<InsertResult>;
    /** Saves lastSeenAt in whichever collection holds the device. */
    abstract touch(device: Device): Promise<void>;
    /** Atomically: insert the (already activated) device into devices and delete it from pendingDevices.
     *  'not_pending' if it was no longer in pendingDevices or its MAC is already in devices. */
    abstract moveToPaid(device: Device): Promise<MoveResult>;
  }
  export abstract class DeviceKeyGenerator { abstract next(): string }

  // use cases (@Injectable)
  export type RegisterOutcome = 'created' | 'existing';
  export class RegisterOrGetDeviceUseCase {
    constructor(devices: DeviceRepository, keys: DeviceKeyGenerator, clock: Clock);
    execute(input: { macAddress: string; appType: string }):
      Promise<Result<{ device: Device; outcome: RegisterOutcome }, InvalidMacAddressError | InvalidAppTypeError>>;
  }
  export type ActivateOutcome = 'activated' | 'already_paid';
  export class ActivateDeviceUseCase {
    constructor(devices: DeviceRepository, clock: Clock);
    execute(input: { macAddress: string }):
      Promise<Result<{ device: Device; outcome: ActivateOutcome }, InvalidMacAddressError | DeviceNotFoundError>>;
  }

  // test/support/in-memory-device.repository.ts
  export class InMemoryDeviceRepository extends DeviceRepository {
    readonly pending: Map<string, Device>; readonly paid: Map<string, Device>; // keyed by id
    beforeNextWrite?: () => void; // runs once at the start of the next insertPending/moveToPaid, to simulate a race
  }
  export class SequenceKeyGenerator extends DeviceKeyGenerator { constructor(keys: string[]) }
  ```

`RegisterOrGetDeviceUseCase.execute`:
```
parse MAC, then app type (return the first error)
now = clock.now()
existing = findPaidByMac(mac) ?? findPendingByMac(mac)
if existing: existing.recordVisit(now); touch(existing); return { device: existing, outcome: 'existing' }
repeat up to 5 times:
  device = Device.registerTrial({ id: randomUUID(), macAddress, appType, deviceKey: keys.next(), now })
  switch insertPending(device):
    'inserted'  → return { device, outcome: 'created' }
    'mac_taken' → winner = findPendingByMac(mac); winner.recordVisit(now); touch(winner); return { device: winner, outcome: 'existing' }
    'key_taken' → continue
throw new Error('Could not generate a unique device key after 5 attempts')
```

`ActivateDeviceUseCase.execute`:
```
parse MAC
paid = findPaidByMac(mac) → if found return { device: paid, outcome: 'already_paid' }
pending = findPendingByMac(mac) → if null return err(DeviceNotFoundError('No device with this MAC', { macAddress }))
pending.activate(clock.now())
moveToPaid(pending): 'moved' → { device: pending, outcome: 'activated' }
                     'not_pending' → { device: await findPaidByMac(mac), outcome: 'already_paid' }
                       (only the move deletes pending records, so this is non-null; throw an Error if it is null)
```

- [ ] **Step 1: Write the fake** `InMemoryDeviceRepository` (enforces unique MAC per map and unique key across both maps like the Mongo adapter; `moveToPaid` returns `'not_pending'` if the id is not in `pending` or the MAC is in `paid`).

- [ ] **Step 2: Write the failing tests** (`FixedClock(new Date('2026-10-19T10:00:00Z'))`, keys `['111111', '222222', '333333']`)

`register-or-get-device.use-case.spec.ts`:
- `creates a trial device in pendingDevices` → outcome `'created'`, `state 'pending'`, key `'111111'`, `trialExpiresAt` `2026-10-26T10:00:00Z`, `repo.pending.size === 1`, `repo.paid.size === 0`.
- `finds the same device for any MAC spelling` → `'AA-BB-CC-DD-EE-01'`, then `'aabb.ccdd.ee01'`, `'aabbccddee01'` → outcomes `'existing'`, same id, `pending.size === 1`.
- `returns the paid device before looking in pending` → seed a paid device for the MAC → outcome `'existing'`, `isPaid === true`, `pending.size === 0`.
- `returns an expired trial unchanged and never starts a new one` → register; set clock to `2026-11-01T00:00:00Z`; register again → same id and key, `trialExpiresAt` still `2026-10-26T10:00:00Z`, `isTrialExpired(clock.now()) === true`, `lastSeenAt` = `2026-11-01T00:00:00Z`.
- `returns the winner when it loses a creation race` → `beforeNextWrite` stores a pending device with the same MAC and id `'winner'` → `device.id === 'winner'`, outcome `'existing'`, `pending.size === 1`.
- `skips a key already used by a paid device` → seed a paid device with key `'111111'` (other MAC) → new device key `'222222'`.
- `fails after 5 key collisions` → generator yields `'111111'` six times, `'111111'` taken → `rejects.toThrow('unique device key')`.
- `rejects an invalid MAC or app type without saving` → `'nope'` → `kernel.invalid_mac_address`; app `'lg tv'` → `devices.invalid_app_type`; both maps empty.

`activate-device.use-case.spec.ts`:
- `moves a trial device to devices` → register then activate → outcome `'activated'`, `isPaid`, same id and key, `activatedAt` = clock now, `pending.size === 0`, `paid.size === 1`.
- `activates an expired trial` → trial past `trialExpiresAt` → outcome `'activated'`.
- `returns already_paid for a paid device` → activate twice → second outcome `'already_paid'`, `paid.size === 1`.
- `returns already_paid when another activation won the race` → `beforeNextWrite` moves the device first → outcome `'already_paid'`, `paid.size === 1`, `pending.size === 0`.
- `returns devices.not_found for an unknown MAC` and `kernel.invalid_mac_address` for `'nope'`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/modules/devices/application`
Expected: FAIL (use cases not found)

- [ ] **Step 4: Implement the two ports and two use cases** (`randomUUID` from `node:crypto`).

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `pnpm vitest run src/modules/devices && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/devices/application test/support/in-memory-device.repository.ts
git commit -m "feat(devices): add register-or-get and activate use cases"
```

---

### Task 3: Infrastructure — Mongo repository, transaction, indexes, module

**Files:**
- Create: `src/modules/devices/infrastructure/mongo-device.repository.ts`
- Create: `src/modules/devices/infrastructure/random-device-key.generator.ts`
- Create: `src/modules/devices/infrastructure/devices.migrations.ts`
- Create: `src/modules/devices/devices.module.ts`
- Create: `src/modules/devices/index.ts`
- Modify: `src/migrations.ts` (append `...devicesMigrations` to `tenantMigrations`)
- Test: `src/modules/devices/infrastructure/random-device-key.generator.spec.ts`, `test/integration/devices.int-spec.ts`

**Interfaces:**
- Consumes: Task 1–2 types; `TenantDb`, `TenantContext`; `Migration`, `runMigrations` (`src/shared/database/migrations/`).
- Produces:
  - `PENDING_DEVICES_COLLECTION = 'pendingDevices'`, `DEVICES_COLLECTION = 'devices'`.
  - Document (both collections): `{ _id: string, macAddress: string, appType: string, deviceKey: string, trialExpiresAt: Date, createdAt: Date, updatedAt: Date, lastSeenAt: Date }`; `devices` documents also have `activatedAt: Date`. State is implied by the collection.
  - `devicesMigrations: readonly Migration[]` = one migration `{ id: '0001-devices-indexes' }` creating, on **each** of `pendingDevices` and `devices`: `{ macAddress: 1 }` unique `mac_unique`, `{ deviceKey: 1 }` unique `device_key_unique`. No TTL index.
  - `MongoDeviceRepository` (injects `TenantDb`; calls `tenantDb.collection(...)` in every method):
    - `insertPending`: first `devices.findOne({ deviceKey })` → `'key_taken'` if found; then `insertOne`; MongoDB error code `11000` → `'mac_taken'` when `keyPattern.macAddress`, `'key_taken'` when `keyPattern.deviceKey`; rethrow anything else.
    - `touch`: `updateOne({ _id }, { $set: { lastSeenAt, updatedAt } })` on `devices` if `device.isPaid`, else `pendingDevices`.
    - `moveToPaid`: `(await tenantDb.db()).client.withSession(s => s.withTransaction(...))`: `deleteOne({ _id }, { session })` on `pendingDevices` — if `deletedCount === 0` abort and return `'not_pending'`; then `insertOne(doc with activatedAt, { session })` on `devices` — duplicate key on `macAddress` → abort, `'not_pending'`. Commit → `'moved'`.
  - `RandomDeviceKeyGenerator.next()` = `String(randomInt(100_000, 1_000_000))` (`node:crypto`).
  - `DevicesModule`: providers `RegisterOrGetDeviceUseCase`, `ActivateDeviceUseCase`, `{ provide: DeviceRepository, useClass: MongoDeviceRepository }`, `{ provide: DeviceKeyGenerator, useClass: RandomDeviceKeyGenerator }`, `{ provide: Clock, useClass: SystemClock }`; exports both use cases.
  - `index.ts` exports `DevicesModule`, `RegisterOrGetDeviceUseCase`, `ActivateDeviceUseCase`, `devicesMigrations`.

- [ ] **Step 1: Write the failing tests**

`random-device-key.generator.spec.ts`: 1,000 calls all match `/^[1-9]\d{5}$/`.

`test/integration/devices.int-spec.ts` (pattern: `test/integration/tenant-db.int-spec.ts`; `startInfrastructure()`, `TenantDb` built the same way, `runMigrations(db, devicesMigrations)` on brand DBs `a` and `b`, use cases built with `MongoDeviceRepository`, `RandomDeviceKeyGenerator` and `FixedClock('2026-10-19T10:00:00Z')`, all calls inside `context.run(brand('a'), …)`):
- `creates the indexes` → both collections list `mac_unique` and `device_key_unique` (unique); no index with `expireAfterSeconds`.
- `stores one pending device for two concurrent first requests` → `Promise.all` of two `register({ macAddress: 'AA:BB:CC:00:00:01', appType: 'samsung' })` → same `device.id`, `pendingDevices.countDocuments() === 1`, `devices.countDocuments() === 0`.
- `keeps brands apart` → same MAC in `a` and `b` → one pending document in each, different ids.
- `moves a device to devices on activation` → register, activate → `pendingDevices` has 0 documents for the MAC, `devices` has 1 with the same `_id` and `deviceKey` and an `activatedAt`.
- `activates once under concurrent activations` → register, `Promise.all` of two activations → outcomes sorted `['activated', 'already_paid']`, `devices.countDocuments() === 1`, `pendingDevices.countDocuments() === 0`.
- `never gives a new trial device a paid device's key` → insert a `devices` document with key `'123456'` by hand; `insertPending` of a device with key `'123456'` → `'key_taken'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/modules/devices/infrastructure && pnpm test:int -- devices`
Expected: FAIL (modules not found)

- [ ] **Step 3: Implement the infrastructure files, `devices.module.ts`, `index.ts`, and the `src/migrations.ts` change.**

- [ ] **Step 4: Run the full suite** (Docker running)

Run: `pnpm test && pnpm test:int && pnpm typecheck && pnpm lint && pnpm knip`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/devices src/migrations.ts test/integration/devices.int-spec.ts
git commit -m "feat(devices): store pending and paid devices per brand"
```

---

### Task 4: CLI commands and docs

**Files:**
- Modify: `src/cli.module.ts` (import `DevicesModule` from `./modules/devices/index.js`)
- Modify: `src/main.cli.ts` (two commands)
- Modify: `README.md` (scripts table: rows for `device:register` and `device:activate`)
- Modify: `docs/diagrams/README.md` (device-registration status → "Built")

**Interfaces:**
- Consumes: `ListTenantsUseCase` (tenants index), `TenantContext`, `RegisterOrGetDeviceUseCase`, `ActivateDeviceUseCase` (devices index).
- Produces, sharing one helper that finds the tenant by slug and runs a callback inside `app.get(TenantContext).run({ id, slug, name, dbName }, fn)`; unknown slug → `logger.error('Unknown tenant: <slug>')`, `process.exitCode = 1`; a `Result` error → `logger.error('<code>: <message>')`, `process.exitCode = 1`:
  - `'device:register' [slug, mac, appType]` → log `<outcome> <slug> <mac> · key <deviceKey> · <pending|paid> · trial until <ISO trialExpiresAt><' (expired)' if isTrialExpired(now)>`.
  - `'device:activate' [slug, mac]` → log `<outcome> <slug> <mac> · key <deviceKey> · paid since <ISO activatedAt>`.

- [ ] **Step 1: Implement the commands, the module import and the two doc edits.**

- [ ] **Step 2: Verify by hand against local MongoDB** (`docker compose up -d`, `.env` present)

Run: `pnpm cli migrate:tenants cr7` → Expected: `cr7 (cr7): 0001-devices-indexes`
Run: `pnpm cli device:register cr7 AA-BB-CC-00-00-99 samsung` → Expected: starts `created cr7 aa:bb:cc:00:00:99 · key ` and contains `· pending · trial until`
Run the same command again → Expected: starts `existing cr7 aa:bb:cc:00:00:99`, same key
Run: `pnpm cli device:activate cr7 aa:bb:cc:00:00:99` → Expected: starts `activated cr7 aa:bb:cc:00:00:99`, same key
Run it again → Expected: starts `already_paid`
Run: `pnpm cli device:register cr7 AA:BB:CC:00:00:99 samsung` → Expected: contains `· paid ·`
Run: `pnpm cli device:activate cr7 aa:bb:cc:00:00:98` → Expected: `devices.not_found: No device with this MAC`, exit code 1
Run: `pnpm cli device:register nobrand AA:BB:CC:00:00:99 samsung` → Expected: `Unknown tenant: nobrand`, exit code 1

- [ ] **Step 3: Full check**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip && pnpm test`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli.module.ts src/main.cli.ts README.md docs/diagrams docs/superpowers
git commit -m "feat(devices): add device:register and device:activate CLI commands"
```
