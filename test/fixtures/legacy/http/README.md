# Recorded request/response pairs (CAP-01 + CAP-04)

Real HTTP traffic recorded from the **old backends running locally**, encoded and decoded with the TV apps' own functions.

| File | Backend | Records |
|---|---|---|
| `iboplayer.json` | iboplayer-backend on `ibo_cap` (empty copy) | 18 |
| `bobplayer.json` | bobplayer-backend on `BobPlayer_cap` (copy of the 237k-device sample) | 18 |
| `cr-unified.json` | cr-unified-backend on `cr7_cap` (Host `cr7.localhost`) | 25 |

Each record: request (method, path, headers, form or JSON body), response (status, content type, raw body), and the decoded envelope when the body is `{ "data": "<envelope>" }`.

## How it was run (safely)

```sh
bash tools/legacy-capture/start-backends.sh E:/Revamp <logDir>   # CAP-01
node tools/legacy-capture/capture.cjs E:/TvApps test/fixtures/legacy/http   # CAP-04
```

- **Database copies only** (`*_cap`). The old backends run cleanup jobs on startup that delete devices and transactions; bob did exactly that on its copy.
- **`tools/legacy-capture/sandbox-preload.cjs`** is loaded into every process: it blocks all outbound connections except to this machine (it blocked bob's call to `api.currconv.com`; the old code also holds a real Cloudflare key), forces one cluster worker, and swaps `bcrypt` for the pure-JS `bcryptjs` (no Node 24 binary exists for bcrypt 5).
- **Fake keys** everywhere; captcha answers are read from the copy database so the V4 login completes unattended.

## Flows captured

| Flow | ibo | bob | cr |
|---|---|---|---|
| `status_check` | ✓ | ✓ | ✓ |
| Legacy TV `playlist_info`: new device, then same device | ✓ | ✓ | ✓ |
| `changeParentPin` | ✓ | ✓ | ✓ |
| `update_playlist` bulk sync (CRPlayer payload) | error* | error* | ✓ |
| V4: recaptcha → device_login → device_info → add / update / delete playlist | ✓ | ✓ | ✓ |
| V4 `device/add` (StarArcs; no secret configured) | error | error | error |
| V4 `device_info` without token → 401 | ✓ | ✓ | ✓ |
| Store `validate-mac-address`: known MAC, wrong token, unknown MAC | ✓ | ✓ | ✓ |
| CRPlayer: `v4/recaptcha` (static key), `tv/v4/playlist_info`, `add_playlist`, `edit_playlist`, `remove_playlist` | — | — | ✓ |
| Host resolution: unknown host, substring host | — | — | ✓ |
| Crash probe (store request without `macAddress`) | ✓ | ✓ | ✓ |

\* ibo and bob answer `"Sorry, this playlist can't be updated"` to the CRPlayer-shaped `update_playlist` payload: same route name, different expected payload per backend.

## Findings

1. **One malformed store request kills every backend.** `validate-mac-address` without `macAddress` throws on `undefined.toLowerCase()`; the worker dies, ibo and bob never restart it (fork-on-exit is commented out), and the next request gets no answer at all. cr restarts after a delay.
2. **cr serves unknown hosts as cr7.** `unknown.example` and `xibo.example` both answer as a configured brand.
3. **The store contract differs per backend.** cr's `TOKEN_NOT_VALID` error has no `euro_to_egp` field; ibo and bob include it.
4. **A brand-new trial device is reported to the store as** `"status":"warning","mac_valid":1, "This device is activated…"`.
5. **The V4 flow and CRPlayer's flow behave the same across the three backends** (field sets differ slightly, e.g. cr adds `rasp_enforce`, ibo leaves `ip_address` empty).

Responses contain values that change on every run (tokens, ids, envelope positions, captcha SVGs). Contract tests compare **decoded structure and stable fields**, not raw bytes.
