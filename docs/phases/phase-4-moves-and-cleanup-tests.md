# Phase 4 · Moves and cleanup: tests

The tests this phase added, what each one proves, how to run them, and the result on this branch. The phase page
is [phase-4-moves-and-cleanup.md](phase-4-moves-and-cleanup.md); the tests of Phases 1 to 3
([1](phase-1-foundation-tests.md), [2](phase-2-database-tests.md), [3](phase-3-core-features-tests.md)) still run
here. The full checklist, local setup and run log are in [TESTING.md](../TESTING.md).

## The checks

```mermaid
flowchart LR
  S[format · lint · typecheck · knip] --> U[unit] --> I[integration] --> B[build] --> E["end to end<br/>5 scripts"] --> P["playground<br/>in a browser"]
```

## Unit tests added or grown (8 files)

| File | Cases | Proves | Task |
|---|---|---|---|
| `src/modules/licensing/application/use-cases/switch-mac.use-case.spec.ts` | 12 | the device moves with its id, license and playlists; the new TV's trial is absorbed ("Name (2)", duplicates dropped); the old MAC keeps an ended trial; refused: multiActivate, yearly without allow, not running, paid device on the new MAC, unregistered, same MAC, fallback MAC; the brand's switch limit | DEV-7 |
| `src/modules/licensing/application/use-cases/recovery.use-cases.spec.ts` | 17 | an 8-character code for 30 minutes; a new code replaces the old; a clash draws again; trial, revoked and unknown devices refused; the code in any case moves the device; works once; two TVs at once → one wins; wrong, expired and no-longer-running refused; bad new MACs refused and the code stays usable; not a MAC switch; the new TV's trial and its playlists removed; each MAC has one device after | REC-1, 2, 3 |
| `src/modules/licensing/application/use-cases/clean-up-trial-devices.use-case.spec.ts` | 6 | a dry run reports and deletes nothing; a real run removes only ended trials with no playlist not seen for the days given; stray playlists go with the device; a device seen again meanwhile is kept; the limit; a bad rule refused | LIC-4 |
| `src/modules/domain-migrations/domain/host-move.spec.ts` | 4 | only a host change is a move; hosts lowercase, port only when not the default; new login values allowed | DOM-1 |
| `src/modules/domain-migrations/application/use-cases/host-moves.use-cases.spec.ts` | 11 | the first report creates a pending move; later ones add confirmations; IP stored as a hash; trial devices ignored; one per IP and per device; 3 IPs → awaiting, not served; reports at once all count; approve and block with who and when; blocked never served; unknown move refused; a decision reaches this server at once and others within a minute | DOM-1, 2 |
| `src/modules/playlists/application/use-cases/playlist-reply.use-case.spec.ts` | 16 → 21 | an approved move is served on the new host with the old host first in the backups; xc moves the server; a move to https; own backups kept after; stored playlists and other hosts untouched | DOM-2 |
| `src/modules/playlists/application/use-cases/playlist.use-cases.spec.ts` | 39 → 41 | an edit of the link reports a possible move with its IP; a name change, a change of kind or an edit without an IP reports nothing | DOM-1 |
| `src/modules/devices/infrastructure/device.document.spec.ts` | 4 → 5 | a switch record saved before the count reads as one switch | DEV-7 |

## Integration tests added (1 file)

| File | Cases | Proves | Tasks |
|---|---|---|---|
| `test/integration/device-moves.int-spec.ts` | 8 | a recovery code is set on a device with no record yet, replaces the old one, belongs to one device (`recovery_code_unique`), finds its device; stale trial devices listed by the rule, longest ended first; one deleted under its MAC lock only while the rule holds; the first move confirmation creates the move, later ones in one write, the same IP or device counts once, five sent at once all count | REC-1, 2 · LIC-4 · DOM-1 |

## End-to-end script

`pnpm e2e:moves`, 32 checks on a running API:

| Part | Checks |
|---|---|
| DEV-7 MAC switch | lifetime switches to a registered MAC; same id on the new MAC; the new TV's playlist absorbed as "News (2)"; old MAC keeps an ended trial; second switch refused; yearly refused without allow and allowed with it; multiActivate refused; paid device on the new MAC refuses it |
| REC-1 recovery code | trial and revoked devices get no code; 8 characters for 30 minutes; a new code replaces the old |
| REC-2/3 recovery | wrong code refused; the code (any case) moves the device; it keeps its id and license; it keeps its playlists and the new TV's are gone; the new TV's trial device removed; old MAC keeps one ended trial; the code works once |
| DOM-1/2 provider moves | a trial device does not report; the first report is pending and the same IP counts once; two IPs not yet up for approval; three IPs up for approval; not served before approval; approve records who; served on the new host with the old as first backup; stored playlist unchanged; blocked not served; unknown move refused |
| LIC-4 cleanup | the dry-run report deletes nothing; a bad rule refused |

Scenarios covered:

| Id | Scenario | Checked by |
|---|---|---|
| E2E-S1 | A paid device switches MAC | `e2e:moves`, `switch-mac.use-case.spec.ts` |
| E2E-R1 | A recovery code moves a paid device to a new TV | `e2e:moves`, `recovery.use-cases.spec.ts` |
| E2E-M1 | Three paid devices on different IPs report a move; staff approves | `e2e:moves`, `host-moves.use-cases.spec.ts` |
| E2E-C1 | Cleanup dry run and real run | `e2e:moves` (dry run), `clean-up-trial-devices.use-case.spec.ts` |
| E2E-X1 | The whole flow on brand A, then B | CORE, at the merge point |

## How to run them

```sh
pnpm test && pnpm test:int                 # see Phase 1 for running without Docker
pnpm cli migrate:tenants                   # migration 0008 on an existing dev database
pnpm dev:api
pnpm e2e:moves && pnpm e2e:devices && pnpm e2e:playlists && pnpm e2e:licenses && pnpm e2e:v4
pnpm cli devices:cleanup                   # dry run of the cleanup on every brand
pnpm cli domain-moves:list approved
```

In the playground (`/dev/playground`): **License, switch, recovery** makes a code, a new TV and recovers it;
**Provider moves** reports a move from 3 paid devices, then approves or blocks it.

## Result on this branch

| Date | Static | Unit | Integration | Build | End to end | Playground |
|---|---|---|---|---|---|---|
| 27 Oct 2026 | format, lint, typecheck, knip green | **513/513** | **51/51** | OK | moves 32/32, devices 46/46, playlists 24/24, licenses 19/19, v4 21/21 | recovery and provider moves driven in a headless browser, no page errors |
| 28 Oct 2026 (Phase 3 app routes merged in) | format, lint, typecheck, knip green | **530/530** | **51/51** | OK | moves 32/32, devices 46/46, playlists 24/24, licenses 19/19, v4 49/49 | not rerun |
