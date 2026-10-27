# Tasks

> Team: **Ali** (device side) and **Omar** (money and people side). A separate team builds the websites and the
> admin / reseller apps against our APIs.
> Current work: **Phase 1, the device core**. Its full task list, acceptance criteria, schema and guide are in
> [phase-1/README.md](phase-1/README.md); the same plan with tick boxes is
> [phase-1/implementation-plan.html](phase-1/implementation-plan.html). Task ids here match both.

## How the work flows

```
Initial tasks  →  Features (one branch each)  →  Merge points (merge and test together)  →  Done
```

- **Initial tasks** are finished before any feature starts.
- **Features** are one branch each, started when the features they need are merged.
- **Merge points:** both of us merge to `master` and run the agreed test together before going on.
- No dates or sprints; the order comes from what each task needs.
- A task is done when its code, tests and docs are merged with green CI and reviewed by the other developer.
  The checks to run are in [phase-1/TESTS.md](phase-1/TESTS.md).

## Phase 1: device core

| Id | Task | Who | Feature / branch |
|---|---|---|---|
| SCH-1 | Create the Phase 1 collections | Ali | Initial tasks · `feat/schema-device-core` |
| SCH-2 | Data access for the Phase 1 collections | Ali | Initial tasks · `feat/device-core-repositories` |
| LOCK | Redis lock helper | Ali | Initial tasks · `feat/redis-lock` |
| UNQ | One MAC, one device | Ali | Initial tasks · `feat/device-identity-unique` |
| DEV-1 | Register and find a device | Omar | Devices · `feature/devices` |
| DEV-2 | Devices without a usable MAC | Omar | Devices |
| DEV-3 | One device for IBO Player, Pro and TV; wrong app type | Omar | Devices |
| DEV-4 | u_id and captcha registration (V4) | Omar | Devices |
| DEV-5 | Device key and parent PIN | Omar | Devices |
| DEV-6 | V4 lock and store-review builds | Omar | Devices |
| LIC-1 | License rules | Omar | Licensing · `feature/licensing` |
| LIC-2 | Activate from any source | Omar | Licensing |
| LIC-3 | Revoke, expiry and history | Omar | Licensing |
| PL-1 | Playlist kinds and storage | Ali | Playlists · `feature/playlists` |
| PL-2 | Add, edit, delete and bulk sync | Ali | Playlists |
| PL-3 | PIN protection per playlist | Ali | Playlists |
| PL-4 | Reply shaping, demo playlist and provider branding | Ali | Playlists |
| PL-5 | Backup URLs | Ali | Playlists |
| PL-6 | Add without login and by MAC only | Ali | Playlists |
| PL-7 | Playlist status sync and code playlists | Ali | Playlists |
| PL-8 | Bulk provider domain rewrite | Ali | Playlists |
| DEV-7 | MAC switch | Ali | MAC switch · `feature/mac-switch` |
| LIC-4 | Expiry and cleanup of old devices | Omar | Expiry and cleanup · `feature/license-cleanup` |
| REC-1 | Recovery code | Ali | Recovery · `feature/recovery` |
| REC-2 | Apply the code on a new TV | Ali | Recovery |
| REC-3 | Retire what is left after recovery | Ali | Recovery |
| DOM-1 | Learn provider host moves | Ali | Provider domain moves · `feature/domain-moves` |
| DOM-2 | Approve a move before it is served | Ali | Provider domain moves |
| CORE | Device core end to end | Both | Device core done |

Merge points: **Devices and licenses work** (Devices, Licensing) and **Device core works** (Playlists, MAC switch,
Expiry and cleanup, Recovery, Provider domain moves).

## Later phases

Not planned in detail yet; each gets its own folder like `phase-1/` when it starts. In the order the earlier plan
had them:

- **Old apps:** the legacy, V4, signed TV/Android, Roku and iOS routes, byte for byte (Ali).
- **Staff, resellers, wallet, codes and coupons** (Omar), with the money tables designed first.
- **Payments:** every provider behind one interface (Omar).
- **Store and transfers, partners** (Ali).
- **Content, translations, app updates** (Omar).
- **Protection and jobs:** rate limits, quarantine, cleanup (Ali).
- **Website, admin and reseller APIs** with the frontend team.
- **Data move** from the three old backends, then **launch** (load and security checks, monitoring, runbook).
- **Account plans** and the **v5 device API** last.

The feature catalogue these come from is [FEATURES.md](FEATURES.md); the architecture is [ARCHITECTURE.md](ARCHITECTURE.md).
