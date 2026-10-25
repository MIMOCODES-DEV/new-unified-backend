# Phase 1 tests: check that everything still works

Run these after **any** change, and always before merging a branch. A branch is merged only when
levels 1–3 are green and its end-to-end checks (levels 4–5) pass.

| Level | What | Command | Needs |
|---|---|---|---|
| 1 | Static checks | `pnpm typecheck && pnpm lint && pnpm knip && pnpm format:check` | nothing |
| 2 | Unit tests | `pnpm test` | nothing |
| 3 | Integration tests | `pnpm test:int` | a MongoDB replica set and a Redis you can wipe |
| 4 | End-to-end smoke on the local stack | section 4 | local MongoDB (27018) and Redis (6379) |
| 5 | End-to-end scenarios per feature | section 5 | as level 4; automated as each feature lands |

---

## 1. Local setup without Docker

The backend needs **two servers**: MongoDB as a replica set, and Redis. The `.env` points at them:

```ini
MONGO_URI=mongodb://localhost:27018/?replicaSet=rs0&directConnection=true
MONGO_CENTRAL_DB=unified_central
REDIS_URL=redis://localhost:6379
# Copy it from .env.example. Secrets stored with one key cannot be read with another, so keep it.
TENANT_SECRETS_KEY=<the dev value from .env.example>
```

**MongoDB on 27018** (one-member replica set). This machine already has a MongoDB 8.0.4 server program in
`C:\Users\aliel\.cache\mongodb-binaries\`; its data lives outside the repo:

```sh
mkdir -p ~/.mongodb/unified-27018
~/.cache/mongodb-binaries/mongod-x64-win32-8.0.4.exe --port 27018 --replSet rs0 --ipv6 --bind_ip 127.0.0.1,::1 \
  --dbpath ~/.mongodb/unified-27018 --logpath ~/.mongodb/unified-27018/mongod.log
# first time only, in another terminal:
mongosh "mongodb://localhost:27018/?directConnection=true" --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27018'}]})"
```

Open the same `MONGO_URI` in **MongoDB Compass** to look at the data. Keep `--ipv6 --bind_ip 127.0.0.1,::1`: on Windows
`localhost` resolves to `::1` first, and Compass cannot connect to a server that listens on 127.0.0.1 only.

**Redis on 6379.** Any Redis 6+ works. This machine has the portable Windows build of Redis 8.10.2
(github.com/redis-windows/redis-windows, SHA-256 checked) in `C:\Users\aliel\.redis\Redis-8.10.2-Windows-x64-msys2\`;
nothing is installed system-wide. Without Redis the CLI commands wait and time out: the brand registry uses Redis
for its host cache and change notices, and every device change takes a Redis lock.

```sh
~/.redis/Redis-8.10.2-Windows-x64-msys2/redis-server.exe --port 6379 --bind 127.0.0.1
```

**Prepare the databases and the example data** (safe to run again):

```sh
npm run seed
# = pnpm cli migrate:central      central collections, including domainMigrations
#   pnpm cli tenants:seed --dev   the dev brands from seeds/tenants.seed.json
#   pnpm cli migrate:tenants      trialDevices, devices, licenses, playlists, captchas in every brand
#   pnpm cli seed:examples        an example of everything Phase 1 stores (list in the main README)
```

---

## 2. Levels 1 and 2: static checks and unit tests

```sh
pnpm typecheck && pnpm lint && pnpm knip && pnpm format:check
pnpm test
```

- `lint` includes the architecture rules (domain imports nothing, modules only through `index.ts`).
- `knip` fails on unused exports, so export from a module's `index.ts` only what another file uses.

Phase 1 unit tests:

| File | Proves |
|---|---|
| `src/modules/devices/infrastructure/device.document.spec.ts` | trial and paid devices are stored and read back unchanged; bad MAC, device key, platform, apiVersion are refused; the device key is not unique |
| `src/modules/devices/application/device-identity.spec.ts` | **UNQ:** ten parallel sign-ups for one MAC make one device; a paid MAC never gets a trial; moving to paid keeps id, MAC and key; a half-finished move is finished; MAC change refuses a used MAC and only one of two racers wins; without the lock (Redis down) nothing is created but lookups work |
| `src/modules/licensing/infrastructure/license.document.spec.ts` | yearly needs an end date, lifetime has none; unknown sources and zero cost refused |
| `src/modules/playlists/infrastructure/playlist.document.spec.ts` | each type fills only its own part; url and Xtream password stay plain text; at most 8 backup hosts |
| `src/modules/domain-migrations/infrastructure/domain-migration.document.spec.ts` | hosts are lowercase host[:port]; only pending / approved / blocked |

---

## 3. Level 3: integration tests

They use real MongoDB and Redis. With Docker running they start their own; **without Docker** point them at
servers you are happy to wipe, **never the 27018 dev database**:

```sh
# once: a throwaway MongoDB on 27019 (same program, a temporary data folder) and a throwaway Redis on 6380
~/.cache/mongodb-binaries/mongod-x64-win32-8.0.4.exe --port 27019 --replSet rs0 --bind_ip 127.0.0.1 --dbpath <temp folder>
mongosh "mongodb://localhost:27019/?directConnection=true" --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27019'}]})"
~/.redis/Redis-8.10.2-Windows-x64-msys2/redis-server.exe --port 6380 --bind 127.0.0.1 --save ""

# before every run: the tests leave data behind, so start from empty servers (CI gets fresh containers)
mongosh "mongodb://localhost:27019/?replicaSet=rs0&directConnection=true" --quiet --eval \
  'db.adminCommand({listDatabases:1,nameOnly:true}).databases.map(d=>d.name).filter(n=>!["admin","config","local"].includes(n)).forEach(n=>db.getSiblingDB(n).dropDatabase())'
~/.redis/Redis-8.10.2-Windows-x64-msys2/redis-cli.exe -p 6380 flushall

TEST_MONGO_URI="mongodb://localhost:27019/?replicaSet=rs0&directConnection=true" \
TEST_REDIS_URL=redis://localhost:6380 pnpm test:int
```

A second run on servers that were not wiped fails with duplicate keys; that is the leftover data, not a bug.

Phase 1 integration tests:

| File | Proves |
|---|---|
| `test/integration/redis-lock.int-spec.ts` | **LOCK:** a held lock refuses a second caller; a waiting caller gets in after; different keys run in parallel; released when the work throws; expires after its TTL; a late release never frees the next holder; Redis down → refused (fails closed) |
| `test/integration/seed-examples.int-spec.ts` | `npm run seed`: the examples of every collection are written, a second run changes no counts, no MAC is in both device collections, every paid device points at its license |
| `test/integration/device-core.int-spec.ts` | **SCH-1:** the migrations create the 5 brand collections + `domainMigrations` with their indexes (TTL on captchas) and running again changes nothing; the validator refuses a bad hand-written row; the same playlist cannot be saved twice for a device. **SCH-2:** each brand sees only its own data; nothing works outside a brand; licenses, captchas, provider moves read and write. **UNQ:** ten parallel sign-ups make one device; moving to paid leaves the MAC in one collection; with Redis down existing devices are found and new ones refused |

---

## 4. Level 4: end-to-end smoke on the local stack

After setup (section 1), these must all hold. Run them after any change to migrations, modules or wiring.

| Id | Check | How | Expected |
|---|---|---|---|
| E2E-0 | `npm run seed` succeeds | section 1 | exits 0 in about 30 s; a second run says migrations are up to date and logs the same example counts per brand |
| E2E-1 | Every brand has the Phase 1 collections and indexes | the script below | `OK` for every brand |
| E2E-2 | The central database has `domainMigrations` | Compass or the script below | collection with `hosts_unique` and `status` indexes |
| E2E-3 | The API starts with the new modules | `pnpm dev:api`, then `GET http://localhost:3000/health` and `/ready` | both answer OK; no dependency errors in the log |
| E2E-4 | A hand-written bad row is refused | in Compass insert `{ _id: "x", macAddress: "bad" }` into a brand's `trialDevices` | refused: "Document failed validation" |

E2E-1 and E2E-2 in one script:

```sh
mongosh "mongodb://localhost:27018/?replicaSet=rs0&directConnection=true" --quiet --eval '
const want = { trialDevices: ["mac_unique","app_device_id_unique","trial_cleanup"], devices: ["mac_unique","current_license"],
  licenses: ["device_history","device_source_unique"], playlists: ["device","m3u_once_per_device"], captchas: ["token_unique","expires_ttl"] };
const central = db.getSiblingDB("unified_central");
for (const t of central.tenants.find().toArray()) {
  const b = db.getSiblingDB(t.dbName); const missing = [];
  for (const [c, idx] of Object.entries(want)) {
    const have = b.getCollection(c).getIndexes().map(i => i.name);
    idx.filter(i => !have.includes(i)).forEach(i => missing.push(c + "." + i));
  }
  print(t.slug, missing.length ? "MISSING " + missing.join(", ") : "OK");
}
print("central domainMigrations:", central.domainMigrations.getIndexes().map(i => i.name).join(", "));'
```

---

## 5. Level 5: end-to-end scenarios per feature

Each feature turns its rows into automated tests in `test/e2e/` (through the use cases, on real MongoDB and Redis,
two brands) and changes the status to **automated**. Until a feature is merged its rows are **planned**.

| Id | Scenario | Expected | Task | Status |
|---|---|---|---|---|
| E2E-D1 | A new MAC registers | one `trialDevices` row: 6-digit key, trial ends after `trial.days` | DEV-1 | planned |
| E2E-D2 | The same MAC registers 10 times at once | still one device | DEV-1, UNQ | planned |
| E2E-D3 | A fallback MAC (`52:54:00:12:34:57`, `…:58`, `…:59`) registers from two TVs | two devices, found by appDeviceId / uid | DEV-2 | planned |
| E2E-D4 | A V4 device registers with a captcha, restarts and sends the same solved code | accepted again, no new captcha | DEV-4 | planned |
| E2E-L1 | A trial device is activated (yearly) from a code | moves to `devices` with the same id, MAC, key and playlists; a `licenses` row | LIC-2 | planned |
| E2E-L2 | The same activation is sent twice | one license | LIC-2 | planned |
| E2E-L3 | A yearly is bought before the current one ends | end date + 1 year | LIC-1 | planned |
| E2E-L4 | A license is revoked | device stays in `devices`, state revoked, history shows both rows | LIC-3 | planned |
| E2E-P1 | Playlists added, edited, deleted, bulk synced | only the calling device changes; `playlistCount` follows | PL-2 | planned |
| E2E-P2 | A protected playlist is opened without / with the PIN | refused / served | PL-3 | planned |
| E2E-P3 | The same playlist in `xc` and `general` brands | the reply shape of each profile; demo playlist when none | PL-4 | planned |
| E2E-S1 | A paid device switches MAC | same id, license, playlists; refused for multiActivate | DEV-7 | planned |
| E2E-R1 | A recovery code moves a paid device to a new TV | old MAC free, new TV's trial row and its playlists gone | REC-1..3 | planned |
| E2E-M1 | Three paid devices on different IPs report a provider move; staff approves | pending → shown for approval → served in replies; stored playlists unchanged | DOM-1, DOM-2 | planned |
| E2E-C1 | Cleanup dry run | report only, nothing deleted; real run removes ended unused trials with their playlists | LIC-4 | planned |
| E2E-X1 | The whole flow on brand A, then brand B | nothing from A is visible in B | CORE | planned |
| E2E-X2 | Redis stopped during the flow | existing devices still load; registration, activation, switch refused with a clear error | UNQ | planned |

---

## 6. Run log

Newest first. Write what ran and the result, including what could not run.

| Date | Branch | Result |
|---|---|---|
| 25 Oct 2026, 16:40 | `feat/schema-device-core` (+ `npm run seed`, not committed) | Full CI sequence: format, lint, typecheck, knip green; unit 181/181; **integration 35/35** (7 files, incl. `seed-examples`); build OK (132 files). `npm run seed` on the dev stack: exit 0 in 33 s; every brand gets 5 trial devices, 4 paid, 4 captchas, 5 licenses, 5 playlists, and central 3 provider moves; a brand seeded from scratch in 7 s; checked: no MAC in both collections, every paid device has its license, the stacked yearly runs on from the first. The very first run once stopped at a 5-minute limit and could not be reproduced in four later runs. MongoDB restarted with `--ipv6 --bind_ip 127.0.0.1,::1` so Compass connects. |
| 25 Oct 2026, 15:40 | `feat/schema-device-core` (initial tasks + request-id fix, not committed) | The full CI sequence, locally: format, lint, typecheck, knip green; **unit 181/181**; **integration 33/33** (6 files, on wiped MongoDB 27019 + Redis 6380); build OK (128 files). Level 4 on the dev stack (MongoDB 27018, Redis 6379): E2E-0 `migrate:central` up to date, `tenants:seed --dev` 24 brands, `migrate:tenants` 0001–0005 on all 24 and "up to date" on a second run; E2E-1 24/24 brands have every collection and index; E2E-2 `domainMigrations` has `hosts_unique`, `status`, `legacy_id`; E2E-3 the API answers `/health` (echoing `x-request-id`) and `/ready` (mongo, redis, tenantDbs up), 421 for an unknown host, `bob.localhost` resolves; E2E-4 a bad hand-written row is refused (code 121). Fixed on the way, both already failing on `master`: the request id was never set or echoed under Fastify (now `src/shared/http/fastify-adapter.ts`), and the 404 test did not send a brand host. |
| 25 Oct 2026, 15:10 | `feat/schema-device-core` (initial tasks, not committed) | Level 1: typecheck, lint, knip green. Level 2: 181 unit tests pass (27 files). Level 3: **not run**, no Redis on this machine (Docker not used). Level 4: MongoDB started on 27018; `migrate:central` applied 0001–0004 (incl. `domainMigrations`); `tenants:seed --dev` and `migrate:tenants` **blocked: no Redis on 6379**. The API module wiring was checked once by booting it against MongoDB. |
