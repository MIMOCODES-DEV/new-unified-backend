# Provider domain moves

Following IPTV providers when they move their server. Module `src/modules/domain-migrations` (central collection
`domainMigrations`: [SCHEMA.md](../SCHEMA.md) §7).

Rules only; what is built and when is in [ROADMAP.md](../ROADMAP.md).

Done when: a move reported by paid devices on different IPs is served only after it is approved. Needs Licensing
and Playlists.

| Feature | Task |
|---|---|
| Learn provider host moves from devices | DOM-1 |
| Admin approves a move before it is served | DOM-2 |

## DOM-1 Learn provider host moves

- The first report of `fromHost` → `toHost` creates a `pending` row; later reports add confirmations.
- Only paid devices count, and only one confirmation per IP (`ipHash`); trial devices are ignored.
- After 3 confirmations from different IPs the move shows up for approval; it is not served yet.
- Hosts are stored lowercase with the port; a test per rule.
- Built:
  - A report is a paid device editing its **own** playlist's link (M3U link or Xtream server) so that only the
    host changed: same path, same query parameter names (their values may change, because a provider that moves
    often reissues logins). This is the rule the old cr backend used. Anything else is not a move.
  - The port is stored only when it is not the scheme's default (`line.example.com:8080`, `line.example.com`).
  - One confirmation per IP **and** per device, so one device on changing IPs counts once.
  - The IP is stored only as a SHA-256 hash.
  - Reports sent at the same time all count (one atomic write each; a race between two first reports is retried).
  - A failed report never fails the person's edit; it is logged.
  - Not learned (cr did): moves from the bulk sync (`update_playlist`), and "mirrors" from backup hosts. To
    confirm: [DISCUSSIONS.md #7](../DISCUSSIONS.md#7-phase-4-choices-to-confirm).

## DOM-2 Approve a move before it is served

- Approve and block set `status`, `decidedBy` and `decidedAt` (a CLI command until the admin API exists).
- Playlist replies swap `fromHost` for `toHost` only for approved moves; stored playlists are not changed.
- A blocked move is never served, however many confirmations it gets.
- Built:
  - The reply's link (or Xtream server) goes out on the new host, path and login unchanged, and the **old host
    is added as the first backup link**, so an app that cannot reach the new host still tries the old one.
  - Only M3U and Xtream links move (the kinds a move is learned from); Stalker portals and codes do not.
  - Each server keeps the approved list in memory for a minute: a decision reaches that server's replies at
    once and the other servers' within a minute.
  - A decision can be changed later (approve a blocked move, or block an approved one).

## Commands and routes

```sh
pnpm cli domain-moves:list [awaiting|pending|approved|blocked]   # default: awaiting approval
pnpm cli domain-moves:approve <id> <who>
pnpm cli domain-moves:block <id> <who>
```

- Dev routes: `GET /dev/domain-moves?filter=…`, `POST /dev/domain-moves/:id/approve|block { by }`; the dev edit
  route `POST /dev/playlists/:mac/:id/edit` takes an `ip` to stand in for different devices.
- Playground: the **Provider moves** tab.
- `pnpm e2e:moves`.
