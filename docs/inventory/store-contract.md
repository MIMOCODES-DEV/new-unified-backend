# External Store contract (CAP-05)

> 2026-10-15 · read-only survey of `iboplayer-backend` (ibo), `bobplayer-backend` (bob), `cr-unified-backend` (cr).
> Purpose: everything the **external store** (and the partner/admin links) relies on today, so the rebuild can answer **byte-for-byte**. All paths are under the `/api` mount (ibo `server.js:1046`, bob `server.js:889`, cr `server.js:646`).
> Citations: `ibo:ApiController.js:4228` = `iboplayer-backend/controllers/ApiController.js` line 4228; same for `bob:` and `cr:`. "AC" = `controllers/ApiController.js`, "AdC" = `controllers/AdminController.js`.
> Anything I could not prove from the code is marked **unclear**.

---

## 0. Cross-cutting facts

| Topic | ibo | bob | cr |
|---|---|---|---|
| Body parsing | `urlencoded({extended:true, limit:1mb})`, `express-fileupload`, `express.json({limit:1mb})` (`server.js:120-128`) | `urlencoded` + `express.json()` (`server.js:88-93`) | `urlencoded({extended:true})`, `fileUpload()`, `express.json()` (`server.js:220-222`) |
| Tenant / DB choice | single DB | single DB | from the `Host` header via `src/middleware/tenant.js:63-104`: legacy host substring rules (`:6-29`), then exact label, then substring, then `DEFAULT_TENANT`, then **`cr7`** (`:75-78`). DB failure → **500** `{"error":"Tenant database connection failed"}` (`:102`). The store therefore selects the brand by **which hostname it calls**. |
| IP/ASN guard on `/api/*` | ASN block runs **before** the exclusion list → 403 `{"status":"error","msg":"Sorry, Request Blocked"}` (`server.js:844-852`). Store routes are excluded from the per-IP counter (`server.js:336-347`, `854-855`) | same: ASN block first (`server.js:866-869`), exclusion list `server.js:534-545` | no API IP guard found in `server.js` |
| Excluded from IP counter | `save-play-list, validate-mac-address, save-device-activation, delete-playlist, reset-playlist, update-domain, count-domain-updates, switch-mac-address, status_check, device/check-activate` | same list | n/a |
| **Not** excluded (counted per IP) | — | `get-available-connections`, `activate/...` | n/a |
| Express | 4.x (`package.json`): an exception thrown inside an `async` handler without `try` is an unhandled rejection → **no response, the request hangs** until the caller times out | same | same |
| Mongoose strict mode | fields not in the schema are silently dropped on write (relevant notes per route) | same | same |

### 0.1 `token` header check (all `STORE_API_KEY` routes)

| Aspect | Behaviour | Cite |
|---|---|---|
| Env var | `global.activation_api_key = process.env.STORE_API_KEY` | ibo `server.js:142`, bob `server.js:79`, cr `server.js:280` |
| Header | `req.headers.token` (Node lowercases names, so `Token:` works too) | e.g. ibo `AC:4237`, cr `AC:2623` |
| Comparison | `apiKey !== activation_api_key` — strict string compare, **not** constant-time | every handler (lines below) |
| Failure | **401**, body per route (see each route; always `status:"error"`, `msgStatus:"TOKEN_NOT_VALID"`, `msg:"Token is not correct"`) | |
| **Env var unset** | `activation_api_key === undefined`; a request that sends **no** `token` header has `undefined !== undefined === false` → **auth passes** (fail-open). A request with any token value gets 401. | logic of the compare above |
| Order | Auth is checked **before** body validation everywhere, except: ibo/bob `validate-mac-address` reads settings first (harmless); cr `validate-mac-address` awaits the tenant settings cache first (`cr:AC:2619-2622`); cr `update-domain` validates auth then body, then loads models | |

### 0.2 Other consumers of the same contract (internal)

`validate-mac-address` is also called **backend-to-backend**, so its response shape is a second contract:

| Caller | Target | Token sent | Fields read | Cite |
|---|---|---|---|---|
| bob Samsung import | `IBO_PLAYER_VALIDATE_MAC_URL` default `https://iboplayer.com/api/validate-mac-address` | `ACTIVATION_API_KEY` env, else bob's own `STORE_API_KEY` | `mac_valid === 1`, `device`, `device.is_trial ∈ {2,3}`, then playlists | bob `AC:277-340` |
| cr donor migration | `MIGRATION_DONOR_BOB_URL` (default bobplayers.com) / `MIGRATION_DONOR_IBO_URL` (default iboplayer.com) + `/api/validate-mac-address`, body `{macAddress}` | `MIGRATION_DONOR_<X>_TOKEN` / `MIGRATION_DONOR_TOKEN` / own `STORE_API_KEY` | `mac_valid`, `device`, `playlists` (or `urls`) | cr `utils/deviceMigration.js:10-12, 34-74, 309-320, 462-468` |

---

## 1. Route inventory

| # | Method + path | ibo | bob | cr | Auth |
|---|---|---|---|---|---|
| 1 | `POST /api/validate-mac-address` | `api.js:98` | `api.js:83` | `api.js:87` | `token` |
| 2 | `POST /api/save-device-activation` | `api.js:99` | `api.js:84` | `api.js:88` | `token` |
| 3 | `POST /api/save-play-list` | `api.js:97` | `api.js:82` | `api.js:86` | `token` |
| 4 | `POST /api/delete-playlist` | `api.js:100` | `api.js:85` | `api.js:89` | `token` |
| 5 | `POST /api/delete-playlist-by-id` | — | — | `api.js:94` | `token` |
| 6 | `POST /api/reset-playlist` | `api.js:101` | `api.js:86` | `api.js:90` | `token` |
| 7 | `POST /api/update-domain` | `api.js:102` | `api.js:87` | `api.js:91` | `token` |
| 8 | `POST /api/count-domain-updates` | `api.js:103` | `api.js:88` | `api.js:92` | `token` |
| 9 | `POST /api/switch-mac-address` | `api.js:104` | `api.js:89` | `api.js:93` | `token` |
| 10 | `GET /api/status_check` | `api.js:106` | `api.js:91` | `api.js:33` | none |
| 11 | `POST /api/saveResellerNotification` | — | — | `api.js:98-102` | `PLATFORM_KEY` |
| 12 | `POST /api/getResellerNotification` | — | — | `api.js:103-107` | `PLATFORM_KEY` |
| 13 | `PATCH /api/editResellerNotification/:id` | — | — | `api.js:108-112` | `PLATFORM_KEY` |
| 14 | `DELETE /api/deleteResellerNotification/:id` | — | — | `api.js:113-117` | `PLATFORM_KEY` |
| 15 | `POST /api/transfer-device-app` | — | — | `api.js:118-122` | `PLATFORM_KEY` |
| 16 | `GET /api/get-available-connections/:id/:token` | commented out `api.js:33` | `api.js:24` | `api.js:55-58` | admin `token` in URL |
| 17 | `GET /api/activate/:mac_address/:credit_count/:id/:token` | commented out `api.js:34` | `api.js:25` | `api.js:59-62` | admin `token` in URL |

Dead code to ignore: bob has a second, older `exports.savePlaylist` (`bob:AC:2545`) that is overwritten by the later export at `bob:AC:2771`; `updateDomainOld`, `switchMacAddressOld*` are unrouted (ibo `AC:4864`, bob `AC:3545-3580`, cr `AC:3303`, `AC:3471`).

---

## 2. `POST /api/validate-mac-address`

Handlers: ibo `AC:4228-4310`, bob `AC:2614-2675`, cr `AC:2612-2677`.

**Request**

| Field | Type | Req. | Parsing |
|---|---|---|---|
| `macAddress` (camelCase!) | string | yes | `.toLowerCase()`; missing → `TypeError` before any try → **no response (hang)** (ibo `:4249-4250`, bob `:2633-2634`, cr `:2634-2635`) |

**Responses** (`euro_to_egp` = setting `eur_to_egp`, `''` when unset in ibo/bob)

| Case | HTTP | Body | Cite |
|---|---|---|---|
| bad token | 401 | `{status:"error", msgStatus:"TOKEN_NOT_VALID", mac_valid:0, msg:"Token is not correct", euro_to_egp}` | ibo `:4238-4247`, bob `:2624-2631`, cr `:2624-2631` |
| unknown MAC | **200** | `{status:"error", msgStatus:"NOT_FOUND", mac_valid:0, msg:"Sorry, device does not exist", euro_to_egp}` — **cr omits `euro_to_egp`** (uses an always-empty `data` object, `cr:2643`) | ibo `:4264-4272`, bob `:2637-2643`, cr `:2638-2644` |
| device not expired (`new Date(expire_date) >= now`) | 200 | `{status:"warning", mac_valid:1, msgStatus:"WARNING", msg:"This device is activated and will expire on <expire_date>. Are you sure you want to add credit?", euro_to_egp, device:{_id, ...entire Device document}, playlists:[...full PlayList docs], already_activated:true}` | ibo `:4280-4296`, bob `:2649-2663`, cr `:2650-2664` |
| otherwise | 200 | `{status:"success", msgStatus:"SUCCESS", mac_valid:1, euro_to_egp, device:{...}, playlists:[...]}` | ibo `:4297-4309`, bob `:2664-2674`, cr `:2665-2675` |

Notes: `device` is the full document (incl. `device_key`, `parent_pin`, etc.). Key order in JSON differs between the warning and success shapes (as listed). Note the expiry test uses `Date` parsing of a `YYYY-MM-DD` string (UTC midnight), so a device expiring today counts as expired after 00:00 UTC.

**Side effects**

| Backend | Effect |
|---|---|
| ibo | If no Device but a `SuspectDevice` with that MAC exists: re-creates the Device from it (same `_id` unless a Device with that `_id` already exists, then a new `_id` is assigned to the suspect copy) and deletes the SuspectDevice (`:4252-4263`). The response then continues with the restored device. |
| bob, cr | read-only |

---

## 3. `POST /api/save-device-activation` (incl. license-transfer branch)

Handlers: ibo `AC:4311-4405`, bob `AC:2676-2770`, cr `AC:2678-2791`.

**Request**

| Field | Type | Req. | ibo / bob | cr |
|---|---|---|---|---|
| `mac_address` | string | yes | lower-cased | lower-cased |
| `expire_date` | date string | yes | `new Date(expire_date)` → stored as `toISOString().split("T")[0]` (UTC date) | same |
| `is_trial` | number | **effectively optional** — the check `!is_trial === undefined` is always false (ibo `:4325`, bob `:2690`, cr `:2702`) | stored as sent (`is_trial: req.body.is_trial`); form strings are cast to Number by the schema; if omitted the field is set to `undefined` (unclear: Mongoose then unsets it) | same |
| `appType` | string | no | `app_type = appType || existing` | same |
| `email` | string | no | `email = email || existing` | same |
| `reseller_id` | string | no | sets `reseller_id` **and** `activated_by` (`:4365-4373`); ibo's Device schema has **no `reseller_id` path** → dropped, only `activated_by` persists | sets `reseller_id` only, **never `activated_by`** |
| `multi_activate` | number | no | `multi_activate || existing || 0` | ignored |
| `source` | string | no | Transaction `payment_type` (default `'ibodev-ibosol'`) | ignored |
| `amount` | number | no | Transaction `amount` (default 0) | ignored |
| `create_if_missing` | truthy | no | — | create the device if the MAC is unknown (`:2715-2730`) |
| `migrated_from_app` | tenant slug | no | — | `migrated_from_app = normalizeTenant(v)` + `migrated_app_date = today` (`:2757-2760`) |
| `migrated_to_app` | tenant slug | no | — | `migrated_to_app = normalizeTenant(v)` + `migrated_app_date = today` (`:2761-2764`) |

**License-transfer branch.** Only cr has one: the store performs a cross-app move with **two calls** to this endpoint on two hosts — one with `migrated_to_app` on the old app (typically with a past `expire_date` / `is_trial:0`, values chosen by the store) and one with `migrated_from_app` (+ usually `create_if_missing`) on the new app (`cr:2751-2764`, comment). The backend only records bookkeeping; it does not validate the slugs (no `isValidTenant` call here), does not move playlists and does not link the two calls. **ibo and bob have no transfer branch** in this handler (FEATURES §5 "(x) branch †" is not confirmed by the code). The newer one-call alternative is `transfer-device-app` (§13).

**Responses**

| Case | HTTP | Body | Cite |
|---|---|---|---|
| bad token | 401 | `{status:"error", mac_activated:0, msgStatus:"TOKEN_NOT_VALID", msg:"Token is not correct"}` | ibo `:4315-4322`, bob `:2680-2687`, cr `:2685-2692` |
| missing `mac_address`/`expire_date` | 422 | `{status:"error", mac_activated:0, msgStatus:"REQUIRED_DATA", msg:"MAC address - Expire Date - Trial Status  are required"}` (two spaces before "are") | ibo `:4325-4332`, bob `:2690-2697`, cr `:2702-2709` |
| unknown MAC (cr: and no `create_if_missing`) | **200** | `{status:"error", mac_activated:0, msgStatus:"NOT_FOUND", msg:"Sorry, device does not exist"}` | ibo `:4336-4343`, bob `:2701-2708`, cr `:2716-2723` |
| unparsable date | 422 | `{status:"error", mac_activated:0, msgStatus:"INVALID_DATE", msg:"Invalid expiration date format"}` | ibo `:4347-4354`, bob `:2712-2719`, cr `:2734-2741` |
| success ibo/bob | 200 | `{status:"success", msgStatus:"SUCCESS", mac_activated:1, device:{_id, ...doc, expire_date}, msg:"Device activated successfully for MAC Address: <mac> until <YYYY-MM-DD>"}` | ibo `:4385-4395`, bob `:2750-2760` |
| success cr | 200 | `{status:"success", msgStatus:"SUCCESS", mac_activated:1, device_created:<bool>, device:{...}, msg:"Device [created and ]activated successfully for MAC Address: <mac> until <date>"}` | cr `:2769-2780` |
| exception | 500 | `{status:"error", mac_activated:0, msgStatus:"SERVER_ERROR", msg:"An error occurred while processing your request"}` | ibo `:4396-4404`, bob `:2761-2769`, cr `:2782-2790` |

**Side effects**

| | ibo / bob | cr |
|---|---|---|
| Device write | `app_type, email, expire_date, reseller_id*, activated_by, is_trial, multi_activate` (ibo `:4361-4375`, bob `:2726-2740`) | `app_type, email, expire_date, reseller_id, is_trial` (+ migration fields) (`:2744-2766`); new devices get `device_key` = random 6 digits, `created_time = "Y-MM-DD HH:mm"` (`:2724-2728`) |
| Transaction | **always written**: `{device_id, amount: amount ?? 0, pay_time: moment().format('Y-MM-DD HH:mm:ss') (server local time), status:'success', payment_type: source ?? 'ibodev-ibosol'}` (ibo `:4376-4383`, bob `:2741-2748`) | **none** |
| Idempotency | none — every replay writes another Transaction | idempotent on the device (overwrite) |
| Expiry semantics | absolute date chosen by the store (no extension logic in the backend) | same |

---

## 4. `POST /api/save-play-list`

Handlers: ibo `AC:4406-4571`, bob `AC:2771-2936` (identical to ibo), cr `AC:2792-2987`.

**Request**

| Field | ibo / bob | cr |
|---|---|---|
| `mac_address` | required, lower-cased | required, lower-cased |
| `device_key` | optional; if sent, added to the device query | same |
| `current_playlist_url_id` | **must be the JSON number `-1`** to create (`=== -1`, ibo `:4530`); anything else is treated as a PlayList `_id` to update. A form-encoded `"-1"` → `findByIdAndUpdate("-1")` → CastError → 500 | same (`:2910`, `:2916`); the pre-read `findById` also throws for non-ObjectIds |
| `playlist_url` | → `url` | `url || playlist_url` |
| `playlist_name` | → `playlist_name` | `playlist_name || portal_name` |
| `protect` | → `is_protected` raw | same |
| `pin`, `username`, `password` | `pin` raw; `username/password || null` | same |
| `playlist_type` | default `"general"` | same |
| `reseller_id` | → `reseller_id || null` (persisted in ibo; **not in bob's schema → dropped**) | ignored |
| `contact_name, whatsapp, email, logo` | only written when the key is present; `""` → `null` (ibo `:4518-4523`) — bob schema has them | ignored (cr schema has `logo/whatsapp/email`, but the handler never sets them) |
| `epg_url` | ignored | `epg_url || null` |
| `code` / `playlist_code` | ignored | must be digits only (`/^\d+$/`) else 400; stored as `code` |
| `portal_name, portal_address, fallback_portal_address, stalker_mac_address` | ignored | stored (`""` defaults) |
| `cross_dns_backup` | — | if sent: `1` when `Number(v)===1`, else `0` |
| `backup_dns` | — | if sent: `normalizeBackupHosts(v)` |
| `added_by` | — | if truthy: stored (reseller API key per comment `:2830`) |
| `app_id` | logged only | — |

**Responses**

| Case | HTTP | Body (ibo/bob) | cr difference | Cite |
|---|---|---|---|---|
| bad token | 401 | `{status:"error", msgStatus:"TOKEN_NOT_VALID", mac_valid:0, msg:"Token is not correct"}` | same | ibo `:4440-4447`, cr `:2800-2807` |
| no `mac_address` | 400 | `{status:"error", msgStatus:"INVALID_INPUT", mac_valid:0, msg:"Missing required fields"}` | same | ibo `:4469-4476`, cr `:2834-2841` |
| non-digit code | — | — | 400 `{status:"error", msgStatus:"INVALID_INPUT", mac_valid:0, msg:"Code can only contain digits"}` | cr `:2844-2855` |
| device not found | **200** | `{status:"error", msgStatus:"NOT_FOUND", mac_valid:0, msg:"Sorry, device information is not correct"}` | same | ibo `:4490-4498`, cr `:2865-2872` |
| update target missing | 404 | `{status:"error", msgStatus:"NOT_FOUND", msg:"Playlist not found"}` | same | ibo `:4541-4548`, cr `:2924-2930` |
| success | 200 | `{status:"success", msgStatus:"SUCCESS", msg:"Playlist saved successfully", data:{_id, ...update}}` — `data` echoes the **request-derived** update object (incl. fields the schema dropped) | `data` is built from the **saved** document: `_id, url, backup_dns, cross_dns_backup, playlist_name, code, device_id, is_protected, pin, username, password, epg_url, playlist_type, portal_name, portal_address, fallback_portal_address, stalker_mac_address, added_by`, passed through `attachBackupUrls()` (adds backup URL fields) | ibo `:4554-4562`, cr `:2954-2978` |
| exception | 500 | `{status:"error", msgStatus:"SERVER_ERROR", msg:"An error occurred while saving the playlist"}` | same | ibo `:4563-4570`, cr `:2979-2986` |

**Side effects**: create/update one PlayList. The update path does **not** check that the playlist belongs to the found device (any `_id` can be overwritten and re-pointed to this device) — all three. cr additionally records a domain migration when the host changed (`recordDomainMigration`, `:2932-2941`) and shared backups (`recordSharedBackups`, `:2943-2951`). ibo logs the full body incl. credentials and the token to stdout (`:4412-4438`); bob the same.

---

## 5. `POST /api/delete-playlist`

Handlers: ibo `AC:4573-4637`, bob `AC:2938-3002`, cr `AC:2989-3095`. **Contracts differ.**

| | ibo | bob | cr |
|---|---|---|---|
| Required fields | `mac_address`, `playlist_type`, `device_key` | same | `mac_address`, `playlist_type`, **`playlist_code`** (no `device_key`) |
| Device lookup | MAC (lower-case) only — `device_key` required but **not checked** (`:4596`) | MAC **and** `device_key` (`bob:2961`) | tries 6 MAC spellings: as-is, lower, upper, no-colons ×3 (`:3019-3036`) |
| Delete | `deleteOne({device_id, playlist_type})` — first playlist of that type | same | `deleteOne({device_id, playlist_type, code: parseInt(playlist_code)})` — leading zeros lost (`"0123"` → `"123"`, schema type String) (`:3061-3074`) |

| Case | HTTP | Body | Cite |
|---|---|---|---|
| bad token | 401 | `{status:"error", msgStatus:"TOKEN_NOT_VALID", mac_valid:0, msg:"Token is not correct"}` | ibo `:4577-4584`, cr `:2996-3003` |
| missing fields | 400 | `{status:"error", msgStatus:"INVALID_INPUT", mac_valid:0, msg:"Missing required fields"}` | ibo `:4587-4594`, cr `:3005-3012` |
| device not found | 404 | ibo/bob: `{status:"error", msgStatus:"NOT_FOUND", mac_valid:0, msg:"Device not found."}`; **cr adds `debug:{searched_mac, formats_tried, sample_devices:[3 random devices' _id + mac_address]}`** (data leak) | ibo `:4598-4605`, cr `:3037-3055` |
| nothing deleted | 404 | `{status:"error", msgStatus:"NOT_FOUND", msg:"Playlist not found."}` | ibo `:4617-4623`, cr `:3075-3081` |
| success | 200 | `{status:"success", msgStatus:"SUCCESS", msg:"Playlist deleted successfully."}` | ibo `:4624-4628`, cr `:3082-3086` |
| exception | 500 | `{status:"error", msgStatus:"SERVER_ERROR", msg:"An error occurred while deleting the playlist."}` | ibo `:4629-4636`, cr `:3087-3094` |

---

## 6. `POST /api/delete-playlist-by-id` (cr only)

Handler `cr:AC:1607-1674`. Body (plain JSON or form): `mac_address` (lower-cased), `id` (PlayList `_id`), both required. Deletes with `findOneAndDelete({_id:id, device_id})` — scoped to the device.

| Case | HTTP | Body |
|---|---|---|
| bad token | 401 | `{status:"error", msgStatus:"TOKEN_NOT_VALID", mac_valid:0, msg:"Token is not correct"}` (`:1615-1622`) |
| missing | 400 | `{status:"error", msgStatus:"INVALID_INPUT", msg:"Missing required fields: mac_address and id are required"}` (`:1627-1633`) |
| no device | 404 | `{status:"error", msgStatus:"NOT_FOUND", msg:"Device not found"}` (no trailing dot) (`:1638-1644`) |
| no playlist | 404 | `{status:"error", msgStatus:"NOT_FOUND", msg:"Playlist not found"}` (`:1653-1659`) |
| success | 200 | `{status:"success", msgStatus:"SUCCESS", msg:"Playlist deleted successfully"}` (`:1661-1665`) |
| exception (incl. invalid ObjectId `id`) | 500 | `{status:"error", msgStatus:"SERVER_ERROR", msg:"An error occurred while deleting the playlist"}` (`:1666-1673`) |

---

## 7. `POST /api/reset-playlist`

Handlers: ibo `AC:4638-4701`, bob `AC:3003-3066`, cr `AC:3097-3167` — identical across backends.

Body: `mac_address` (lower-cased), `device_key` — both required; device found by MAC **and** `device_key`. Effect: `PlayList.deleteMany({device_id})`.

| Case | HTTP | Body |
|---|---|---|
| bad token | 401 | `{status:"error", msgStatus:"TOKEN_NOT_VALID", mac_valid:0, msg:"Token is not correct"}` (ibo `:4642-4649`) |
| missing | 400 | `{status:"error", msgStatus:"INVALID_INPUT", mac_valid:0, msg:"Missing required fields"}` (ibo `:4652-4659`) |
| no device | 404 | `{status:"error", msgStatus:"NOT_FOUND", mac_valid:0, msg:"Device not found."}` (ibo `:4663-4670`) |
| device had no playlists | **404** | `{status:"error", msgStatus:"NOT_FOUND", msg:"Playlist not found."}` (ibo `:4681-4687`) |
| success | 200 | `{status:"success", msgStatus:"SUCCESS", msg:"Playlist deleted successfully."}` (ibo `:4688-4692`) |
| exception | 500 | `{status:"error", msgStatus:"SERVER_ERROR", msg:"An error occurred while deleting the playlist."}` (ibo `:4693-4700`) |

---

## 8. `POST /api/update-domain`

Handlers: ibo `AC:4702-4813`, bob `AC:3067-3180`, cr `AC:3168-3301`.

**Request**

| Field | Type | Req. | Use |
|---|---|---|---|
| `current_domain` | string | yes | used **unescaped** as a Mongo `$regex` (dots match any char; regex injection possible) and then as a literal in `String.replace` (first occurrence only) |
| `new_domain` | string | yes | replacement |
| `is_admin` | **JSON boolean** | yes in practice | `=== true` → every playlist matching the regex; `=== false` **and** `activated_macs` → only playlists of those devices; anything else (e.g. form string `"true"`) → 400 |
| `activated_macs` | array of MACs | with `is_admin:false` | `Device.find({mac_address:{$in}})` — case-sensitive, not lower-cased |
| `limit` / `limit_count` | int | no | `parseInt(limit || limit_count || 0)`; if `0 < limit < matches`, a **random** subset (Fisher–Yates) of that size is updated (ibo `:4769-4776`) |
| `reseller_id`, `change_scope` | — | no | logged only |

**Responses**

| Case | HTTP | Body | Cite |
|---|---|---|---|
| bad token | 401 | `{status:"error", msgStatus:"TOKEN_NOT_VALID", msg:"Token is not correct"}` (no `mac_valid`) | ibo `:4706-4712` |
| missing domains | 400 | `{status:"error", msgStatus:"INVALID_INPUT", msg:"Both current_domain and new_domain are required"}` | ibo `:4725-4731` |
| bad scope | 400 | `{status:"error", msgStatus:"INVALID_INPUT", msg:"Request Can Not Be Processed"}` | ibo `:4751-4757` |
| no matches | 200 | `{status:"success", msgStatus:"NO_UPDATES", msg:"No URLs found with the specified domain", matchedCount:0, modifiedCount:0}` | ibo `:4759-4767` |
| success | 200 | `{status:"success", msgStatus:"SUCCESS", msg:"Domain updated successfully", selectedCount, matchedCount, modifiedCount}` | ibo `:4797-4804`, cr `:3285-3292` |
| exception | 500 | `{status:"error", msgStatus:"SERVER_ERROR", msg:"An error occurred while updating the domain"}` | ibo `:4806-4811` |

**Side effects**: `PlayList.bulkWrite` `$set {url, last_updated: new Date(), previous_url}` (ibo `:4779-4795`). `last_updated`/`previous_url` exist only in ibo's PlayList schema; in bob and cr they are not schema paths, so (per Mongoose strict casting) only `url` is persisted — unclear whether any reader depends on them. cr additionally records one trusted domain migration from the first selected playlist (`recordDomainMigration`, `:3266-3283`), which makes **untouched** devices on the old domain get the new host as a fallback.

---

## 9. `POST /api/count-domain-updates`

Handlers: ibo `AC:4814-4863`, bob `AC:3181-3230`, cr `AC:3417-3470` — identical.

Body: `current_domain` (required; unescaped `$regex`), `activated_macs`, `is_admin`, `reseller_id` (ignored). Scope: `is_admin === false && activated_macs` → restricted to those devices; **any other value (incl. missing or string `"false"`) counts across all playlists** — the count can disagree with what `update-domain` would accept (`ibo:4836-4844`).

| Case | HTTP | Body |
|---|---|---|
| bad token | 401 | `{status:"error", msgStatus:"TOKEN_NOT_VALID", msg:"Token is not correct"}` (`ibo:4817-4823`) |
| missing | 400 | `{status:"error", msgStatus:"INVALID_INPUT", msg:"current_domain is required"}` (`:4826-4832`) |
| success | 200 | `{status:"success", msgStatus:"SUCCESS", msg:"Count retrieved successfully", matchedCount:<n>}` (`:4848-4853`) |
| exception | 500 | `{status:"error", msgStatus:"SERVER_ERROR", msg:"An error occurred while counting updates"}` (`:4856-4861`) |

Read-only.

---

## 10. `POST /api/switch-mac-address`

Handlers: ibo `AC:4948-5086`, bob `AC:3581-3720` (live export; identical to ibo), cr `AC:3561-3702` (identical logic). No `try` — a DB error hangs the request.

**Request**: `current_mac_address` (old, lower-cased), `mac_address` (new, lower-cased), `allow_one_year` (truthy skips the two one-year/reseller guards).

**Error responses are HTTP `302` with a JSON body and no `Location` header**, using key `message` (not `msg`) and no `msgStatus`. Note the double spaces inside several literals.

| Order | Condition | HTTP | `message` literal |
|---|---|---|---|
| 0 | bad token | 401 | body `{status:"error", msgStatus:"TOKEN_NOT_VALID", msg:"Token is not correct"}` |
| 1 | either MAC missing | 302 | `Sorry, both current and new device Mac Addresses are required` |
| 2 | old device unknown | 302 | `Current device not found` |
| 3 | `multi_activate === 1` | 302 | `Your device is activated with multiple devices activation. You cannot switch Mac Address.  Note: Please be informed that MAC switching is disabled for 1-Year App Activation due to repeated misuse. Only Lifetime App Activation can be switched.` |
| 4 | `!allow_one_year` and `activated_by` non-empty and `is_trial !== 2` | 302 | `Your device is activated Through A reseller (Not for Lifetime). Note: Please be informed that MAC switching is disabled for 1-Year App Activation due to repeated misuse. Only Lifetime App Activation can be switched.` |
| 5 | `!allow_one_year` and `is_trial === 3` | 302 | `Your device is activated for One Year. Switch Option is available for lifetime subscriptions only.  Note: Please be informed that MAC switching is disabled for 1-Year App Activation due to repeated misuse. Only Lifetime App Activation can be switched.` |
| 6 | new MAC not registered | 302 | `The requested device is not registered on our System. Please Install the application first on the new device.` |
| 7 | old `expire_date < today` (string compare, server local date) | 302 | `Your device is expired. Only active devices can be switched.  Note: Please be informed that MAC switching is disabled for 1-Year App Activation due to repeated misuse. Only Lifetime App Activation can be switched.` |
| 8 | either device has `switched_to`/`switched_from`/`switched_date` | 302 | `One of Your device has been Switched Before. You Can Only Switch Once.  Note: Please be informed that MAC switching is disabled for 1-Year App Activation due to repeated misuse. Only Lifetime App Activation can be switched.` |
| 9 | old `is_trial` is 0 or 1 | 302 | `Your device is not currently active. Only active devices can be switched.  Note: Please be informed that MAC switching is disabled for 1-Year App Activation due to repeated misuse. Only Lifetime App Activation can be switched.` |
| ok | — | 200 | `{status:"success", message:"Device Mac Address and Playlists have been Switched Successfully", playlists_moved:<n>}` |

(Row 6 is checked before 7–9 in code: `devices.length > 0` branch, ibo `:5008` / `:5080-5085`.)

**Side effects** (ibo `:5037-5067`): new device gets old `expire_date` and `is_trial`; old device gets `expire_date = yesterday`, `is_trial = 0`; `old.switched_to = new mac`, `new.switched_from = old mac`, both `switched_date = today` (`Y-MM-DD`); all PlayLists `device_id` old → new (`updateMany`). Two separate saves, no transaction. No Transaction/log document. Not idempotent but the "switched once" guard (row 8) blocks a replay.

---

## 11. `GET /api/status_check`

ibo `AC:5329-5334`, bob `AC:3438-3443`, cr `AC:5124-5129`. No auth. **200** `{"status":"success","message":"API is running"}`. In cr the tenant middleware still runs first, so a dead tenant DB returns the 500 from §0.

---

## 12. cr `PLATFORM_KEY` routes — common auth

`verifyPlatformKey` (`cr:AC:3856-3880`), `PLATFORM_KEY = process.env.PLATFORM_KEY` read once at module load (`:3856`).

| Step | Behaviour |
|---|---|
| Header | `Authorization` |
| Missing / empty header | **401** `{status:"error", message:"Platform key token is required"}` |
| Prefix | `"Bearer "` (exact case, one space) stripped if present; a raw key without prefix is also accepted |
| Compare | `actualToken !== PLATFORM_KEY` strict, not constant-time |
| Mismatch | **403** `{status:"error", message:"Invalid platform key"}` |
| Env unset | every non-empty header mismatches `undefined` → 403 (**fail-closed**, unlike `STORE_API_KEY`) |

All handlers use the tenant DB selected by the Host header (`req.db`), except `transfer-device-app`, which takes tenants from the body.

### 12.1 Reseller notification CRUD

Model: `Notification` (`cr/models/Notification.model.js:13-19`: `title` **required**, `message` **required**, `reseller_id` optional, timestamps). This is the **same collection** that devices read: device APIs return global notifications (no `reseller_id`) plus those whose `reseller_id` equals the device's `reseller_id` (`cr:AC:212-250`, `:864-895`); the legacy settings cache shows `notifications[0]` (any row, reading a non-existent `content` field) (`cr:server.js:348-362`).

| Route | Input | Responses | Cite |
|---|---|---|---|
| `POST /api/saveResellerNotification` | body `reseller_id`, `title`, `message` | missing `reseller_id`/`message` → 400 `{status:"error", message:"reseller_id and message are required"}`; missing `title` → 400 `{status:"error", message:"Validation failed", errors:["Path \`title\` is required."]}` (Mongoose message); ok → **201** `{status:"success", message:"Notification saved successfully", data:<doc>}`; else 500 `{status:"error", message:"Internal server error"}` | `cr:AC:4035-4087` |
| `POST /api/getResellerNotification` | body `reseller_id` | missing → 400 `{status:"error", message:"reseller_id is required"}`; ok → 200 `{status:"success", data:[docs sorted createdAt desc]}`; 500 as above | `:4090-4124` |
| `PATCH /api/editResellerNotification/:id` | params `id`; body `message`, `title` (at least one) | neither → 400 `{status:"error", message:"At least message or title is required to update"}`; not found → 404 `{status:"error", message:"Notification not found"}`; bad id → 400 `{status:"error", message:"Invalid notification ID"}`; ok → 200 `{status:"success", message:"Notification updated successfully", data:<doc>}`; 500 | `:4127-4183` |
| `DELETE /api/deleteResellerNotification/:id` | params `id` | 404 / 400 as edit; ok → 200 `{status:"success", message:"Notification deleted successfully", data:<deleted doc>}`; 500 | `:4186-4225` |

No ownership check: any notification id can be edited/deleted regardless of `reseller_id`. bob has a separate, **unauthenticated, device-facing** `POST /api/reseller-notification` (`bob:api.js:22`, `bob:AC:781`) — not a store route.

---

## 13. cr `POST /api/transfer-device-app`

Route `cr:api.js:118-122`, handler `cr:AC:3932-4033`, logic `cr/utils/crossAppTransfer.js:92-345`, tenants `cr/utils/tenants.js`.

**Request** (body): `mac_address` (lower-cased, trimmed), `source_app`, `target_app` (tenant slugs, lower-cased; valid = `TENANTS` env ∪ legacy host-rule tenants), `force`, `allow_one_year`, `dry_run` (all `!!`-coerced, so the string `"false"` is **true**).

**Algorithm and side effects** (`crossAppTransfer.js`)

| Step | Effect | Cite |
|---|---|---|
| guards | required → known source → known target → different → both DBs connect → source device exists → source active (`is_trial ∈ {2,3}` and `expire_date >= today`, or no expire) unless `force` → `is_trial===3` needs `allow_one_year` → reseller-activated non-lifetime needs `allow_one_year`; `multi_activate===1` only adds warning `source_multi_activate` | `:104-174`, `deviceMigration.js:98-104` |
| don't downgrade | if target device exists, is active and `target.expire_date >= source.expire_date` → stop unless `force` | `:183-196` |
| dry run | count source playlists, no writes | `:198-205` |
| 1. target activation | create device (`mac, app_type, device_key` random 6 digits, `device_name, parent_pin, origin_mac_address, created_time`) or `$set`; copies `is_trial, expire_date, credit_count, multi_activate` + `migrated_from_app, migrated_app_date, migrated_playlists_done:false` | `:207-243`, `deviceMigration.js:111-112` |
| 2. `app_device_id` | separate write, collision-tolerant | `:245-254` |
| 3. playlists | upsert each with `$setOnInsert` on a natural-key dedupe filter → **replay-safe**; counts created/existing/skipped/failed | `:256-290` |
| 4. finish | `migrated_playlists_done:true`; if any playlist failed → stop, source **stays active**; else source `is_trial:0`, `expire_date: yesterday`, `migrated_to_app`, `migrated_app_date` | `:292-328` |
| logging | stdout only; no Transaction or activity document | `:39-45` |

**Response** — common `payload`: `{mac_address, source_app, target_app, target_device_created, source_deactivated, activation:{is_trial, expire_date, credit_count?, multi_activate?}|null, playlists:{source_total, created, existing, skipped, failed}, warnings:[...]}` (`AC:3950-3959`).

| `reason` | HTTP | `status` / `msgStatus` / `msg` | Extra |
|---|---|---|---|
| `required_data` | 200 | error / `REQUIRED_DATA` / `mac_address, source_app and target_app are required` | |
| `invalid_source_app` | 200 | error / `INVALID_APP` / `Sorry, source_app is not a known app` | `valid_apps:[...]` |
| `invalid_target_app` | 200 | error / `INVALID_APP` / `Sorry, target_app is not a known app` | `valid_apps` |
| `same_app` | 200 | error / `SAME_APP` / `source_app and target_app must be different` | |
| `tenant_db_unavailable` | 200 | error / `TENANT_DB_UNAVAILABLE` / `Sorry, one of the apps has no database configured` | `errors` |
| `source_not_found` | 200 | error / `SOURCE_NOT_FOUND` / `Sorry, this device is not registered on the source app` | |
| `source_not_active` | 200 | error / `SOURCE_NOT_ACTIVE` / `The device is not active on the source app, so there is no activation to move. Retry with force: true to move its playlists anyway.` | |
| `one_year_not_allowed` | 200 | error / `ONE_YEAR_NOT_ALLOWED` / `The device is activated for One Year. Retry with allow_one_year: true to migrate it anyway.` | |
| `reseller_not_lifetime` | 200 | error / `RESELLER_NOT_LIFETIME` / `The device was activated through a reseller and is not lifetime. Retry with allow_one_year: true to migrate it anyway.` | |
| `target_not_better` | 200 | error / `TARGET_NOT_BETTER` / `The device already has a longer activation on the target app. Retry with force: true to overwrite it.` | `source_expire_date`, `target_expire_date` |
| `target_missing` | 200 | error / `TARGET_NOT_FOUND` / `Sorry, the target device disappeared while migrating. Please retry.` | |
| `dry_run` | 200 | success / `DRY_RUN` / `Device can be migrated from <src> to <dst>` | |
| `partial_playlists` | 200 | warning / `PARTIAL_PLAYLISTS` / `The activation was migrated but some playlists failed to copy, so the device is still active on the source app. Please retry the same request.` | |
| `created` / `applied` | 200 | success / `SUCCESS` / `Device migrated from <src> to <dst>` | |
| `error` | 500 | error / `SERVER_ERROR` / `Sorry, the migration could not be completed` | `errors` + payload |
| thrown | 500 | same literal, no payload | `AC:4025-4032` |

Outcome table `cr:AC:3885-3930`; mapping `:3961-4024`.

---

## 14. Admin-token external links (bob, cr)

Handlers: bob `AdC:2291-2380`, cr `AdC:2448-2549`; ibo has the handlers (`AdC:2567`, `:2591`) but the routes are commented out (`ibo:api.js:33-34`).

**Auth**: `Admin.findById(:id)` then `reseller.token != :token` (loose compare; `Admin.token` is an optional string, bob `models/Admin.model.js:26`, cr `:55`). An invalid ObjectId → CastError inside `.then` → **no response (hang)**. No rate limit beyond bob's global IP counter; the token travels in the URL (logs, referrers).

### 14.1 `GET /api/get-available-connections/:id/:token`

| Case | HTTP | Body |
|---|---|---|
| no admin / wrong token | 200 | `{status:"error", msg:"Sorry, your id or token is not correct"}` |
| ok | 200 | `{status:"success", available_connections: max_connections − (Σ credit_count of devices activated_by this admin + Σ max_connections of sub-resellers created_by it)}` (bob `AdC:2743-2759`) |

### 14.2 `GET /api/activate/:mac_address/:credit_count/:id/:token`

| Step | Behaviour |
|---|---|
| credit check | `available < credit_count` (string param vs number) → 200 `{status:"error", msg:"Sorry, you have only <n> available connections"}` |
| normalise | `credit_count == '1'` → 1, **anything else → 2** — the check above used the raw value, so `0`, `abc` etc. pass the check and still grant lifetime consuming 2 credits |
| 1 credit | `is_trial = 3`, `expire_date = max(today, current expire) + 1 year` |
| 2 credits | `is_trial = 2`, `expire_date = base + 5000 months` |
| writes | `expire_date`, `is_trial`, `activated_by = admin _id`, `credit_count += n` (string compare of dates `Y-MM-DD`) |
| unknown MAC | 200 `{status:"error", msg:"We could not find mac address in our device lists"}` |
| ok | 200 `{status:"success", msg:"Your device activated successfully", expire_date:"YYYY-MM-DD"}` |
| logging | no Transaction, no reseller activity record |

(bob `AdC:2315-2380`, cr `AdC:2475-2549`.)

**cr is broken:** its `getActiveConnections` uses `req.db` but has no `req` in scope (`cr:AdC:3107-3109`), so after a valid id/token both cr routes throw a `ReferenceError` inside a promise → **no response**. Only bob's versions actually work today.

---

## 15. Differences that matter for a byte-compatible rebuild

| # | Difference | Where |
|---|---|---|
| 1 | `STORE_API_KEY` unset ⇒ requests without a `token` header are accepted (all 3); `PLATFORM_KEY` unset ⇒ fail-closed | §0.1, §12 |
| 2 | `save-device-activation` writes a `Transaction` (`payment_type` = `source` or `'ibodev-ibosol'`) in ibo/bob, **none** in cr; ibo/bob set `activated_by`, cr doesn't | §3 |
| 3 | Only cr supports `create_if_missing`, `migrated_from_app`, `migrated_to_app` and returns `device_created` | §3 |
| 4 | `delete-playlist` needs `device_key` (ibo ignores it, bob enforces it) vs `playlist_code` (cr); cr's 404 leaks sample devices | §5 |
| 5 | `save-play-list`: cr accepts `url/epg_url/code/portal_*/backup_dns/added_by`, returns the saved doc; ibo/bob accept provider contact fields, `reseller_id`, return the echo | §4 |
| 6 | `validate-mac-address` NOT_FOUND has no `euro_to_egp` in cr; ibo restores suspect devices | §2 |
| 7 | `switch-mac-address` errors are HTTP **302** with `message` (all 3) | §10 |
| 8 | Business "not found" cases use HTTP 200 in validate/save-activation/save-play-list but 404 in delete/reset | §2–7 |
| 9 | `update-domain` needs JSON booleans; `count-domain-updates` silently counts globally otherwise | §8–9 |
| 10 | Missing `macAddress` / DB errors in handlers without `try` hang the request | §2, §10, §14 |
| 11 | cr routes depend on the Host header for the tenant; unknown host ⇒ `cr7` | §0 |
| 12 | Admin external links work only on bob; cr crashes, ibo unrouted | §14 |

Out of scope here but adjacent: bob/ibo `POST /api/checkDeviceStatusFromExternal`, `/api/activateWithCouponFromExternal` (hardcoded partner token, FEATURES §5) and `/api/mimoStoreCallback` (see `payment-contracts.md`).
