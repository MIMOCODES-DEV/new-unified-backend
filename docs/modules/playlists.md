# Playlists

The lists of channels each device plays. Module `src/modules/playlists` (collection `playlists`:
[SCHEMA.md](../SCHEMA.md) §5).

Rules only; what is built and when is in [ROADMAP.md](../ROADMAP.md).

| Feature | Task |
|---|---|
| Kinds: M3U, Xtream, Stalker portal, code | PL-1 |
| Add, edit, delete from app, website, store, admin | PL-2 |
| Bulk sync by MAC (update_playlist) | PL-2 |
| PIN protection per playlist | PL-3 |
| Provider branding: logo, contacts | PL-4 |
| Response shaping: Xtream, general or raw, per brand and app | PL-4 |
| Demo playlist when the device has none | PL-4 |
| Backup URLs (up to 8) | PL-5 |
| Add without login: QR code, Stalker form | PL-6 |
| Add or delete by MAC only | PL-6 |
| Playlist status sync (edit_playlist) | PL-7 |
| Bulk provider domain rewrite | PL-8 |

Brand config it reads: `app.demoUrl`, and brand settings `playlistProfile` (`xc` | `general`),
`rawPlaylistsForAndroid44`. The PIN key comes from brand secrets.

## PL-1 Playlist kinds and storage

- An Xtream link is parsed once into `xtream { server, username, password }`; `url` is kept as typed.
- Each type fills only its own part; a test per type. `url` and the Xtream password are plain text.

## PL-2 Add, edit, delete and bulk sync

- Add, edit, delete and list by device; `addedBy` records app, website, store or admin.
- A playlist name is unique per device, case does not matter (decided 26 Oct).
- Bulk sync by MAC (update_playlist):
  - adds new playlists and returns their new ids next to the app's origin ids;
  - removes `remove_ids`;
  - only touches the calling device's playlists.
- `playlistCount` and `firstPlaylistAt` on `trialDevices` follow add and delete. No limit per device.

## PL-3 PIN protection per playlist

- `protected` + `pinEnc` set and changed; `pinEnc` uses the brand key from secrets.
- Opening or changing a protected playlist without the PIN is refused.

## PL-4 Reply shaping, demo playlist and provider branding

- One URL parser replaces the old ones, with tests.
- The reply follows the brand's `playlistProfile` (xc or general); Android 4.4 gets raw playlists when
  `rawPlaylistsForAndroid44` is on.
- A device with no playlist of its own gets the demo playlist from `app.demoUrl`.
- `provider { name, logo, whatsapp, email }` is returned with the playlist.

## PL-5 Backup URLs

- `backup { enabled, hosts[] }`, up to 8 hosts; turning it off keeps the hosts.
- Replies include them in the shape cr gives today.

## PL-6 Add without login and by MAC only

- Add by QR code and by the Stalker form for a known MAC without a login.
- Add and delete by MAC only as on cr, rate limited per IP.

## PL-7 Playlist status sync and code playlists

- The status sync changes only `account` (status, expiry), for any playlist type; any other field sent is
  ignored, with a test.

## PL-8 Bulk provider domain rewrite

- Touches only the calling brand; the domain is plain text, not a pattern.
- Reports how many playlists changed; a count-only mode changes nothing.
