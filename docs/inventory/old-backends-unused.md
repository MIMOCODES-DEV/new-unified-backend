# Unused code in the old backends

> Generated 2026-10-14 by `tools/legacy-analysis/analyze-unused.cjs` (static scan, read-only).
> Rerun: `node tools/legacy-analysis/analyze-unused.cjs ../iboplayer-backend out.json`

**What "unused" means here:** nothing in the code can reach it — no route, no call, no `require`, no `render`. It does **not** tell us whether a *routed* endpoint is used by real apps; that needs production traffic logs (TASKS rule: nothing routed is dropped without traffic evidence).

Spot-checked by hand: `layout.ejs` files (used via the `layout:` option), `ejs`/`nodemon` (used by name), and `verifyPlatformKey` (imported as `require(...).verifyPlatformKey`) were false alarms and are excluded. Dynamic `res.render(variable)` calls: none found.

## Summary

| | ibo | bob | cr |
|---|---|---|---|
| Controller functions nothing calls | 31 | 10 | 21 |
| Functions defined twice (last one wins) | 1 | 2 | 2 |
| Commented-out routes | 16 | 4 | 8 |
| EJS views never rendered | 5 | 5 | 5 |
| npm packages never used | 8 | 10 | 10 |
| Models / utils never required | 1 / 1 | 0 / 0 | 0 / 0 |
| Routes pointing at missing functions | 0 | 0 | 0 |

## Controller functions nothing calls

**iboplayer-backend**
- ApiController (16): `getAppSetting`, `testLog`, `assignCreatedTime`, `getTranslations`, `updateDomainOld`, `moveExpiredDevices`, `moveExpiredDevicesNoPlaylists`, `moveSuspectDevices`, `moveSuspectDevices2`, `verifyAndroidDeviceToken`, `regPlaylistInfoAndroid`, `getDeviceInfoAndroid`, `verifyTvKey`, `UpdateAddPlayListAndroid`, `DeletePlayListAndroid`, `youtubeTrailerFrame`
- AdminController (8): `index`, `playlists`, `getAvailableConnections`, `activateFromExternalLink`, `getTransactions1`, `updateLanguageFromPHP`, `getPlaylistsFromPhp`, `getResellersFromPHP`
- FrontendController (7): `showActivateCouponPage`, `checkCouponCode`, `activateWithCoupon`, `showBuyCouponPage`, `postBuyCoupon`, `activateOpayDevices`, `updateDeviceKeys`

**bobplayer-backend**
- ApiController (4): `getTranslations`, `updateDomainOld`, `switchMacAddressOld`, `switchMacAddressOld2`
- AdminController (4): `playlists`, `showSubResellers`, `createSubReseller`, `deleteSubReseller`
- FrontendController (2): `OldsavePlaylist`, `activateOpayDevices`

**cr-unified-backend**
- ApiController (12): `verifyAndroidKey`, `saveGooglePay`, `checkDeviceStatusFromExternal`, `activateWithCouponFromExternal`, `updateDomainOld`, `getTranslations`, `generateRecaptchaAndroid`, `regPlaylistInfoAndroid`, `getDeviceInfoAndroid`, `UpdateAddPlayListAndroid`, `DeletePlayListAndroid`, `verifyAndroidDeviceToken`
- AdminController (5): `index`, `playlists`, `showSubResellers`, `createSubReseller`, `deleteSubReseller`
- FrontendController (4): `index`, `switchMacAddressOld`, `activateOpayDevices`, `getDevicesByMacAddress`

## Functions defined twice (the second silently replaces the first)

- ibo `ApiController.updatePlayList`
- bob `ApiController.savePlaylist`, `FrontendController.showPlaylistsTest`
- cr `ApiController.updateDomainOld`, `ApiController.checkAndroidUpdate`

`checkAndroidUpdate` (cr) is live: only the second definition runs. Read that one when rebuilding the feature.

## Commented-out routes

- **ibo** — admin `/generate-coupons`; api `/get-available-connections`, `/activate/:mac/:credits/:id/:token`, `/get_app_setting/:mac`, `/test-log`, `/assignCreatedTime`, `/move-suspect-devices`, `/tv/youtube-player/:videoId`; frontend `/change/device_keys`, the 5 coupon routes (`/activate-with-coupon`, `/checkCouponCode`, `/activateWithCoupon`, `/buy-coupon`, `/postBuyCoupon`), `/activateOpayDevices`, one `DELETE`
- **bob** — admin `/sub-resellers`, `/sub-reseller/create`, `/sub-reseller/delete`; frontend `/activateOpayDevices`
- **cr** — admin `/sub-resellers`, `/sub-reseller/create`, `/sub-reseller/delete`; api `/google_pay`; frontend `/`, `/activateOpayDevices`, two multi-line routes

Note: ibo `routes/admin.js` registers `GET /get-crypto-transactions` *after* `module.exports`. It is still live (same router object), just easy to miss.

## Views never rendered

- all three: `frontend/pages/mylist.ejs`, `frontend/pages/activation_test.ejs`, `frontend/pages/epg_code.ejs`, `admin/pages/epg_code.ejs`
- ibo: `frontend/pages/activation.ejs`
- bob, cr: `admin/pages/connection_token.ejs`

(Irrelevant for the rebuild — the new backend serves no pages — but confirms which page flows were already dead.)

## npm packages never used

- all three: `@mollie/api-client`, `@paypal/checkout-server-sdk` (PayPal is called over REST), `fast-xml-parser`, `install`, `npm`, `pug`
- ibo: `express-session` (uses `cookie-session`), `he`
- bob: `express-session`, `cron`, `morgan`, `uuid`
- cr: `coinpayments`, `cron`, `he`, `morgan`

## Models, utils, root scripts

- ibo `models/PasswordResetToken.model.js` — never required
- ibo `utils/logger.js` — only referenced in commented-out code
- One-off root scripts (not part of the server): ibo `clean_android_fake.js`, `cowpay.js`, `distribute_playlists_mongosh.js`, `distribute_playlists_roundrobin_mongosh.js`, `seed.js`, `url_replace_mongosh.js`; bob `clean_android_fake.js`; cr `seeder.js`

## Impact on the rebuild

None of the items above are rebuilt. They match and extend the "Not rebuilt" list in `docs/FEATURES.md` §13. Notable confirmations:

- **Sub-resellers** (bob, cr): routes commented out — the new central reseller hierarchy (IDN-02) replaces them, it is not a port.
- **Coupon purchase pages** (ibo): routes commented out — coupons stay in scope through bob/cr, where they are live.
- **Google Pay** (cr): route commented out; ibo/bob route it to an empty stub — replaced by verified Google Play (PAY-09).
- **Old `*Android` playlist handlers, `updateDomainOld`, `switchMacAddressOld*`**: superseded versions, not features.
