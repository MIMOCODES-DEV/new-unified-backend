# Payment provider contracts (CAP-05)

> 2026-10-15 · read-only survey of `iboplayer-backend` (ibo), `bobplayer-backend` (bob), `cr-unified-backend` (cr).
> Purpose: for each payment provider, record what the old backends send, what callbacks they accept, how (or whether) they verify them, what they activate and what they record, so the rebuild can keep the provider-facing URLs/payloads while fixing verification.
> Citations: `FC` = `controllers/FrontendController.js`, `AC` = `controllers/ApiController.js`, `AdC` = `controllers/AdminController.js`, `routes/x.js:n`. Mounts: ibo `/` and `/api/` (`server.js:1043,1046`), bob `/` and `/api` (`server.js:859,889`), cr `/` and `/api` behind `tenantMiddleware` (`server.js:643,646`).
> Secrets: never copied. "Hardcoded key at file:line" marks a literal in source. Uncertain items are marked **unclear**.
> Headline: **no provider's confirmation is checked against the expected amount, in any backend.** Only Apple IAP (cr) is verified end to end.

---

## 0. Shared mechanics

### 0.1 Lifetime and durations

| Value | Meaning | Where |
|---|---|---|
| `is_trial = 2`, `expire_date = now + 5000 months` (`Y-MM-DD`) | "lifetime" — used by PayPal, Opay, MDLS, Telr, PayEG, Geidea, Cowpay, Cashcall, CoinPayments IPN, PaySky, Apple, app_purchase, admin link | e.g. ibo `AC:2037`, cr `AC:3810` |
| `now + 500 months` | Paymob webhook (all 3), crypto redirect (ibo, bob) | ibo `AC:1981`, ibo `FC:4052` |
| `now + 500 minutes` (`'m'`) | cr crypto redirect, bob/cr Stripe success (dead code) | cr `FC:3617` |
| `is_trial = 3` | one-year (reseller/admin flows only, not payments) | |
| `expire_date` format | `Y-MM-DD` string (moment `Y` = year) | |

### 0.2 Transaction model

| Backend | Fields | Cite |
|---|---|---|
| ibo | `device_id` (String), `payment_id`, `amount` (Number), `status` (default `pending`), `pay_time` (String), `status_url`, `order_id`, `payment_type`, `transaction_type`, `credit_count`, `coin_type` | `models/Transaction.model.js:3-28` |
| bob | same minus `coin_type`, plus `timestamps` | `models/Transaction.model.js:3-28` |
| cr | `device_id`, `user_id`, `payment_id`, `amount`, `status`, `pay_time`, `order_id`, `payment_type`, `credit_count`, **`transaction_type` `required:true`** (`:111-114`); no `status_url`/`coin_type`/`ip`/`useragent`/`transtion_type` (writes to those are dropped) | `models/Transaction.model.js:86-125` |

Consequence in cr: every `Transaction.create`/`save` without `transaction_type` fails validation — PayPal capture (`FC:3226`), reseller capture (`FC:1301`), `postBuyCoupon` (`FC:1704`), `purchaseResellerPackage` (`FC:2057`), `saveActivation` (`FC:3288`), PaySky (`FC:3712`). Only `orderPackagePlan` (MDLS plans) and Apple IAP set it. So in cr the generic checkout (`saveActivation`) most likely never returns (unhandled rejection) — derived from code, not run.

`pay_time` formats: ibo/bob `moment().format('Y-MM-DD HH:mm:ss')` server local time; PaySky (all 3) `Y-MM-DD HH:mm`; cr capture/reseller/coupon `YYYY-MM-DD HH:mm:ss`; cr `buy_plan` UTC `Y-MM-DD HH:mm:ss` (`FC:5747`); app_purchase and Apple `Y-MM-DD`.

### 0.3 Generic device checkout `saveActivation`

One handler builds every provider's checkout (`payment_type` switch).

| | ibo | bob | cr |
|---|---|---|---|
| Routes | `POST /device/saveActivation`, `POST /frontend/device/saveActivation` — **no auth middleware** (`routes/frontend.js:320-321`) | `/saveActivation` (session check), `/frontend/device/saveActivation` (none) (`:68`, `:96`) | `/frontend/device/saveActivation` (none, `:154-157`); `/saveActivation`, `/frontend/saveActivation` (JWT `checkAuthenticated`, `:274-283`) |
| Device id source | `req.device_id` (`FC:3209-3212`) — set only by auth middleware, so the device path appears to always answer `{status:"error", msg:"Your session expired, please reload page"}` (unclear whether a proxy changes this) | `req.session.device_id` (`FC:1886-1898`) | `req.device_id` |
| Settings | `global.settings` | `global.settings` | `req.db.settings || {}` — never set anywhere, so all provider keys are empty and defaults apply (price 7.49, eur_to_egp 18.469) (`FC:3247`) |
| Pending Transaction | `{device_id, amount: price, pay_time, status:'pending', payment_type}` (`FC:3261-3268`) | same (`FC:1928-1942`) | same + fails validation (§0.2) |
| `transaction_type` / `credit_count` stored | **no** → every callback's `buy_credit` branch is unreachable for these purchases | no | no |
| Reuse rule | new Transaction only if no pending one exists or type ∈ {opay, opay1, mdls, cowpay} (`FC:3260`); otherwise `Transaction.findOne({device_id})` — the device's **first** Transaction of any status — is reused and its `order_id` overwritten (`FC:3270`) | always-new list {opay, opay1, cashcall, crypto} (`FC:1927/1935`), reuse at `FC:1945` | — |

Price: `settings.price` (default 7.49 EUR; PaySky 6.45), or `CreditPricePackage.price` (credits), `ResellerPackage.price` (coupons/reseller). `Transaction.amount` is always the **EUR list price**, never the charged amount.

### 0.4 Coupon purchase `postBuyCoupon`

Live only in bob (`POST /postBuyCoupon`, `routes/frontend.js:25-29`) and cr (`:182`); commented out in ibo (`routes/frontend.js:29`). It stores `device_id = JSON.stringify({email, count: package.max_connections})`, `amount = ResellerPackage.price` (bob `FC:318-329`). Callbacks detect it with `device_id.includes('email')` and then find-or-create a `Coupon` for that email, add `count`, and email the code.

### 0.5 Currency

| Provider | Charged amount | Currency |
|---|---|---|
| PayPal, Stripe, CoinPayments, Paymentwall | price | EUR |
| Paymob, Opay | `parseInt(price × eur_to_egp × 100)` | EGP cents |
| MDLS, Geidea, Cowpay, Cashcall | `(price × eur_to_egp).toFixed(2)` | EGP |
| Telr | `(price × 1.1).toFixed(2)` (variable named `price_aed`) | **USD** |
| PayEG | `(price × 1.1).toFixed(2)` | USD (unclear) |

`eur_to_egp` defaults: ibo 54.00, bob/cr 18.469; Geidea/Cashcall fallback 34.469, Cowpay 54.00/34.469. The conversion job (every 3 min, currconv.com, setting `egp_currency_converter_api_key`) stores `eur_to_egp = max(EUR_EGP, USD_EGP)` — so the "EUR" rate may be the USD rate. Runs in every worker in ibo (`server.js:761-810`, plus once at `:512`) and bob (`server.js:475-516`); cr only on the leader, per tenant, DB only (`server.js:476-530, 594-603`) — how current other cr workers are is unclear.

### 0.6 Hardcoded payment keys (settings seeds and code)

| Provider | ibo | bob | cr |
|---|---|---|---|
| Paymob | `server.js:218-219`; fallback API key in code `FC:1253`, `FC:3367` | `server.js:228`; `FC:1109`, `FC:2073` | `FC:3366` |
| Opay / Opay1 | `server.js:228-237` | `server.js:238-247` | — |
| MDLS | `server.js:241-242` | `server.js:251-252` | — (env) |
| Telr | `server.js:253-254` | `server.js:257-258` | — |
| Geidea (sandbox) | `server.js:262-263` | `server.js:263-264` | — |
| Cowpay | `server.js:268-271` | — | — |
| Cashcall | — | `server.js:268-272` | — |
| PaySky | `server.js:279-280` | `server.js:292` | — |
| Paymentwall | `server.js:308-309`; callback key `AC:2533` | `server.js:306-307`; `AC:1443` | `AC:1939` |
| PayEG callback HMAC key | `AC:2208` | `AC:1225` | — |

---

## 1. PayPal — device

| Item | ibo | bob | cr |
|---|---|---|---|
| Routes | `POST /paypal/order/create`, `POST /paypal/order/capture/:order_id` (session, `routes/frontend.js:36-45`); `/frontend/paypal/order/*` (JWT, `:46-55`) | `/paypal/order/*` (`:29-30`), `/frontend/paypal/order/*` (`:83-84`), both session | `/paypal/order/*` only (JWT; no token → redirect `/login`) (`:189-198`); no `/frontend` copy (cr website calls it → broken, see client-usage.md) |
| Create | `POST {api|api.sandbox}.paypal.com/v2/checkout/orders`, intent CAPTURE, EUR, value `settings.price`, Basic client id:secret; returns raw PayPal JSON (`FC:3049`) | `FC:1737` | `FC:3124` |
| Capture | `POST /v2/checkout/orders/:id/capture` (`FC:3094`); **result status/amount/currency not read**; any 2xx → device `is_trial 2`, +5000 months | `FC:1780` | `FC:3177` |
| Transaction | `insertMany` `{device_id, amount: settings price, pay_time, status:'success', payment_type:'paypal', payment_id: 'order_id'` (literal string bug)`}` (`FC:3131`) | same (`FC:1815`) | `create` with real order id, fails validation; device update runs in parallel so device likely activated, client gets 500 (`FC:3226`) |
| Errors | capture error handler empty `(err1)=>{}` → hang (`FC:3149`); create `{status:'error', error}` | `FC:1830` same | 500 `{status:'error', error: message}` |
| Verification | server-to-server capture only | same | same |
| Replay | PayPal refuses a 2nd capture → one activation per order | same | same |
| Amount | not checked (any capturable order for the merchant activates) | | |

## 2. PayPal — reseller package

| Item | Detail |
|---|---|
| Routes (no auth) | ibo `/paypal/resellerOrderCreate/:plan`, `/paypal/resellerOrderCapture/:plan/:order_id` + `/frontend/...` copies (`routes/frontend.js:81-96`); bob `:40-41`, `:85-86`; cr `:158-165`, `:220-227` |
| Create | value `ResellerPackage.price` or 100.00 if not found, EUR (ibo `FC:1078`, bob `FC:952`, cr `FC:1182`) |
| Capture | body `email`, `first_name`, `last_name`; no status/amount check; creates `Admin` (reseller) with random 6-digit password (bcrypt) and `max_connections` from the package (ibo `FC:1191`, bob `FC:1056`, cr `FC:1293`) |
| Transaction | `{device_id: "<adminId>_reseller", amount: package price, pay_time, status:'success', payment_type:'paypal', payment_id: order_id}` |
| Response | PayPal JSON + `email` + **plaintext `password`**; missing plan → throw, hang (ibo/bob); cr: Admin created, then 500 and the password is never returned |
| Replay | PayPal blocks re-capture; Admin email not unique |
| Paymob variant | `purchaseResellerPackage` (ibo `FC:1214`, bob `FC:1082`, cr `FC:2022`) writes `device_id = "reseller/<email>/<max_connections>"`; the Paymob webhook does `Device.findById` on it → CastError, so it is probably never fulfilled (unclear) |

## 3. Stripe

| Item | Detail |
|---|---|
| Routes | create = `saveActivation` case `stripe` (ibo `FC:3338`, bob `FC:2044`, cr `FC:3337`); `GET /stripe/success?transaction_id=` (ibo `routes/frontend.js:102`, bob `:44`, cr `:233`); `GET /stripe/cancel` → `cryptoPaymentCancel` sets `canceled` (ibo `:103`, bob `:45`, cr `:234`); **no webhook** |
| Create | ibo/bob reference an undefined outer `transaction` (block-scoped, ibo `FC:3232`, bob `FC:1907`) → TypeError, no session ever created; cr: key from empty settings, URLs without scheme; `stripe = stripe(key)` overwrites the module (2nd call breaks). Line item qty 1, `price×100`, EUR; response `{session_id}` |
| Success | puts plain functions into `Promise.all` → nothing runs; flashes "activated" and 302 → `/activation` (ibo `FC:4438`, bob `FC:3014`, cr `FC:3897`). Would-be code: misspelled `exprie_date`, 500 `'M'` (ibo) / `'m'` minutes (bob, cr), `is_trial 2` |
| Verification / replay / amount | none / n/a (never activates) / no |

## 4. Paymob

| Item | Detail |
|---|---|
| Routes | create = `saveActivation` case `paymob` (ibo `FC:3363`, bob `FC:2069`, cr `FC:3362`) and `purchaseResellerPackage`; webhook `POST /api/paymob_webhook` (ibo `api.js:40`, bob `:31`, cr `:68`) |
| Create | auth token (api_key) → order `amount_cents = parseInt(price×eur_to_egp×100)`, EGP, `merchant_order_id = Transaction._id` (Paymob order id saved as `order_id`) → payment key with billing `email, first_name, last_name, phone_number`, `integration_id` → `{status:'success', token, url}` (`url = iframes/<iframe_id>?payment_token=…`, card only) |
| Webhook fields read | `obj.success` (read, **unused**), `obj.is_refunded`, `obj.order.merchant_order_id` (ibo `AC:1977-1979`, bob `AC:928-930`, cr `AC:1820-1822`) |
| Verification | **none** — Paymob's `hmac` query param is never read |
| Effect | unless refunded → device `is_trial 2`, `expire_date = now + 500 months` **even if `success` is false** (ibo `AC:1981`); refunded → `is_trial 0` (+ ibo sets expire today; bob `AC:936`/cr `AC:1830` typo `device.is_trial - …` does nothing to expiry) |
| Transaction | **never updated** (stays `pending`) |
| Response | 200 `{"status":"success"}`; unknown id → TypeError, no response |
| Replay / amount | not safe (forgeable with a transaction id) / no |

## 5. PaySky

| Item | Detail |
|---|---|
| Routes (no auth) | `GET /generatePayskyTransactionID` (ibo `routes/frontend.js:62-65`, bob `:34`, cr `:205-208`); `POST /checkPayskyTransaction` (ibo `:66-69`, bob `:35`, cr `:209-212`); no provider callback |
| Generate | query `transaction_type`, `credit_package_id` (ibo), `reseller_plan`, `email`; Transaction `{device_id (device id / session user_id / JSON {email,count}), amount, pay_time 'Y-MM-DD HH:mm', status:'pending', payment_type:'paysky', payment_id:''}` (+ ibo stores `transaction_type`, `credit_count`, `FC:4275-4283`); amount `parseInt(price×eur_to_egp×100)`; SecureHash HMAC-SHA256 hex uppercase over `Amount=…&DateTimeLocalTrxn=<YMMDDHHmm>&MerchantId=…&MerchantReference=<txId>&TerminalId=…`, key `paysky_secret_key` as UTF-8; response `{hash, time, transaction_id, price}` (ibo `FC:4201`, bob `FC:2854`, cr `FC:3661`). bob/cr read the reseller package from `response[5]` (always undefined) → reseller plans always error; ibo uses `response[0]` (`FC:4245`) |
| Check | body `transaction_id`; **the PaySky FilterTransactions query is commented out** (ibo `FC:4331-4345`, bob `FC:2931`; cr has none). Device branch: +5000 months, `is_trial 2`, Transaction `success`, `{status:'success', msg:'Thanks for your payment, your device activated now', expire_date}` (device id: ibo `req.device_id` `FC:4404` / cr `FC:3808` — undefined without middleware, effect unclear; bob `req.session.device_id` `FC:2980`). ibo `buy_credit`: adds `credit_count` to `req.session.user_id` (`FC:4388`), `{status:'success', msg:"Thanks for your payment, you've got credits successfully", total_credits}`. Reseller: ibo commented out (no response); bob/cr `Transaction.findByID` typo → throw |
| Verification / replay / amount | none, status not checked / unlimited activations (and credits in ibo) / no |

## 6. Opay / Opay1

| Item | Detail |
|---|---|
| Routes | create = `saveActivation` case `opay`/`opay1` (ibo `FC:3502`/`:3576`, bob `FC:2208`/`:2281`, cr `FC:3501` opay only); `postBuyCoupon` (bob, cr `FC:1712`); callback `POST /api/opaySuccessCallback` (ibo `api.js:41`, bob `:32`, cr `:69`) |
| Create | `POST {sandboxapi|api}.opaycheckout.com/api/v1/international/cashier/create`, headers `Authorization: Bearer <opay_public_key>`, `MerchantID`; body `reference = Transaction._id`, `amount.total = parseInt(price×eur_to_egp×100)` EGP, `product`, `returnUrl` (ibo `<origin>/device/playlists?payment_status=success`; bob/cr `https://<host>/mylist?payment_status=success`), `cancelUrl`, `callbackUrl = https://<host>/api/opaySuccessCallback`, `expireAt:"100"`, `payMethod:"BankCard"`; code `00000` → `{status:'success', url: cashierUrl}` else `{status:'error', msg:'Sorry, something is wrong (1996)', data}`. Opay1 = same with `opay1_*` keys. ibo `postBuyCoupon` opay1/mdls use undeclared vars (`FC:461`, `:532`) → ReferenceError (route is dead anyway) |
| Callback fields | `payload.reference`, `payload.status` (`SUCCESS` / `CLOSE`) (ibo `AC:1997-2006`, bob `AC:947-951`, cr `AC:1845-1849`) |
| Verification | **none** (`opay_secret_key` unused) |
| Effect | SUCCESS: coupon branch (§0.4) or device +5000 months `is_trial 2` (ibo `AC:2037`, bob `AC:978`, cr `AC:1877`); ibo `buy_credit` branch (`AC:2035-2045`, unreachable §0.3); Transaction → `success` (cr also writes dropped fields). CLOSE: bob (`AC:988`) and cr delete the Transaction; ibo line commented out (`AC:2054`) |
| Response | always 200 `{"status":"success"}` |
| Replay / amount | not safe (expiry re-set, coupon counts add up; forgeable with a transaction id) / no |

## 7. MDLS / Mimo Store

| Item | ibo / bob | cr |
|---|---|---|
| Create routes | `saveActivation` case `mdls` (ibo `FC:3650`, bob `FC:2354`); `postBuyCoupon` (ibo `FC:519`, bob `FC:464`) | only `POST /frontend/order-package-plan` (`checkUserAuthenticated`, `routes/frontend.js:367-371`; `FC:5676`) |
| Store URL | ibo `https://activate.iboplayer.com/api/out-source-order`; bob `https://store.mimocodes.com/api/out-source-order` | `${env.store_url}/api/order-package-plan` |
| Order body | `platformName`, `platformReferenceId` (= Transaction id), `validFrom`/`validTo` (DD-MM-YYYY, validTo = +5000 months), `productSKU` (`IBOPLAYER`/`BOBPLAYER`), `amount` (EGP 2dp), `currency:'EGP'`, `platformCallback = https://<host>/api/mimoStoreCallback`, `platformCancelUrl` `/mylist`, `platformReturnUrl` `/mylist?payment_status=success`, `mac_address`, `orig_price` (EUR), `signature`; Bearer `mdls_platform_key` | `platformName "<TENANT> - <plan> Plan"`, `productSKU "<TENANT>PLAYER"`, `platformReferenceId`, `amount`, EGP, `platformCallback = ${env.API_URL}/api/mimoStoreCallback`, cancel/return `${frontendUrl}/dashboard/plans?status=failed|success`, `packagePlan {name, points, description}` (**from the client body**), `signature` |
| Outgoing signature | base64 HMAC-SHA256(`mdls_signature_key`, platform_key + platformName + platformReferenceId + productSKU + amount + currency + validFrom + validTo) | same algorithm over platform_key + platformName + reference + packagePlan.name + points + amount + currency; keys from **env** (`FC:5781-5792`) |
| Create reply | statusCode `'0000'` → `{status:'success', url: orderUrl}` | `{status:'success', transactionId, paymentUrl}`; error 500 `{status:'error', message:'Failed to initialize payment', details}` |
| Callback | `POST /api/mimoStoreCallback` (ibo `api.js:49`, bob `:34`) | `api.js:83` |
| Fields read | `platformName, platformReferenceId, productId, licenseUuid, amount, currency, validFrom, validTo, signature, status` (ibo `AC:2075`, bob `AC:1008`) | `platformName, platformReferenceId, packagePlan.name, packagePlan.points, amount (Number().toFixed(2)), currency, orderId, status` (`AC:3736-3746`) |
| Verification | recompute base64 HMAC-SHA256(settings `mdls_signature_key`, platform_key + platformName + platformReferenceId + productId + licenseUuid + amount + currency + validFrom + validTo), `===` with `status==='SUCCESS'` (ibo `AC:2083`, bob `AC:1016`) — not timing-safe | HMAC computed with keys from the tenant `Setting` collection (`AC:3716-3751`) but **never compared**; order signed with env keys vs callback with DB keys; tenant = callback Host (unclear which DB) |
| Effect | coupon branch or device +5000 months `is_trial 2` (ibo `AC:2110`, bob `AC:1043`); Transaction `success`, `payment_type:'mdls'` | `status==="Paid"` (`AC:3763`): `buy_plan` → push `{plan_id, number_of_devices, devices:[]}` for the plan **named in the callback** (`AC:3786-3800`); else device +5000 months `is_trial 2` (`AC:3810`); Transaction `success`, `mdls`. Any other status → Transaction back to `pending` (`AC:3831-3837`), plan not revoked |
| Response | always 200 `{"status":"success"}` even on bad signature; null transaction → TypeError, no response | 200 `{"status":"success"}` / 500 `{"status":"error","message":"Internal server error"}` (`AC:3844-3852`) |
| Replay | valid signed payload replayable (no status check); coupon counts add up | forgeable with a transaction id; each replay pushes another plan |
| Amount | signed but not compared with the Transaction | not checked |

## 8. Telr (ibo, bob)

| Item | Detail |
|---|---|
| Routes | create = `saveActivation` case `telr` (ibo `FC:3727`, bob `FC:2432`; bob `postBuyCoupon` `FC:543`); returns `GET /activation/telr/auth|cancel|decline?transaction_id=` (ibo `routes/frontend.js:71-73`, bob `:51-53`); callback `POST /api/telrSuccessCallback` (ibo `api.js:43`, bob `:36`) — never registered with Telr by the create call |
| Create | `POST https://secure.telr.com/gateway/order.json` `{method:'create', store: telr_merchant_id, authkey: telr_public_key, framed:0, order:{cartid: Transaction._id, test:'1'|'0', amount:(price×1.1).toFixed(2), currency:'USD', description:'My purchase'}, return:{authorised, declined, cancelled}}`; saves `order_id = order.ref`; `{status:'success', url}` or `{status:'error', msg:'Sorry, something went wrong (2051)'|'(2062)'}` |
| Auth return | server calls Telr `method:'check'` with stored ref; `order.status.code == 3` → coupon/credit/device (+5000 months, `is_trial 2`), Transaction `success`, 302 `/mylist?payment_status=success` (ibo `FC:4093-4119`, bob `FC:2746-2772`); no `order` → `pending`, 302 `?payment_status=pending`; `order` present but code ≠ 3 → **no response**; cancel/decline → status `canceled`/`declined`, 302 `/mylist` |
| Callback | `payload.reference`, `payload.status` (ibo `AC:2139-2148`, bob `AC:1072-1081`), **unsigned**, same effects as Opay, CLOSE no-op, always 200 `{"status":"success"}` |
| Replay / amount | auth URL re-applies (Transaction status not checked); callback forgeable / no |

## 9. PayEG (ibo, bob)

| Item | Detail |
|---|---|
| Routes | create = `saveActivation` case `payeg` (ibo `FC:3787`, bob `FC:2492`); callback `POST /api/payegSuccessCallback` (ibo `api.js:44`, bob `:37`) |
| Create | `POST https://popay.pay-eg.com/api/generateinvoice` `{amount:(price×1.1).toFixed(2), email, mode:'live'` (forced, ibo `FC:3797`, bob `FC:2503`)`, reference_number: 'IBOPLAYER'|'BOBPLAYER' + txId, callback_url: https://<host>/api/payegSuccessCallback}`; `status===true && Link` → save `order_id = data.msg`, `{status:'success', url: Link}`; else `{status:'error', msg:'Sorry, something went wrong (PayEG)'}` |
| Callback fields | `order_id`, `status`, `signature` |
| Verification | HMAC-SHA512 hex over `order_id + status`, `===`; **hardcoded key** at ibo `AC:2208`, bob `AC:1225` (`signHmacSha512` ibo `AC:2876`, bob `AC:1639`) |
| Effect | `Transaction.findOne({order_id})` (null → TypeError); `SUCCESS`/`Success` → coupon/credit/device (+5000 months, `is_trial 2`), Transaction `success` |
| Responses | 200 `{"status":"Success","message":"Payment succeed"}`; 305 `{"status":"error","message":"Unknown Status Received"}`; 305 `{"status":"error","message":"Wrong Signature"}`; DB error 200 `{"status":"error"}` |
| Replay / amount | signature is constant per order → replayable forever / not signed, not checked |

## 10. Geidea (ibo, bob)

| Item | Detail |
|---|---|
| Routes | create = `saveActivation` case `geidea` (ibo `FC:3836-3917`, bob `FC:2541-2622`); coupon bob `FC:652-733`; callback `POST` **and `GET`** `/api/geideaSuccessCallback` (ibo `api.js:45-46`, bob `:38-39`) — GET has no body → throw, no response |
| Create | `POST api.merchant.geidea.net/payment-intent/api/v1/direct/eInvoice` (same URL for sandbox/live, ibo `FC:3844`), Basic `public_key:secret_key`; amount `(price×eur_to_egp).toFixed(2)` EGP (fallback 34.469); `merchantReferenceId = 'IBOPLAYER'|'BOBPLAYER' + txId`; callback `https://<Host>/api/geideaSuccessCallback`; hardcoded customer phone; `responseCode==='000'` → `{status:'success', url: paymentIntent.link}` + `order_id` saved, else `{status:'error', msg:'Sorry, something is wrong', data}` |
| Callback fields | `order.status`, `order.merchantReferenceId`, `order.merchantPublicKey`, `order.amount` (number, `.toFixed(2)`), `order.currency`, `order.orderId`, `timeStamp`, `signature`, `body.status` (CLOSE) (ibo `AC:2394-2404`, bob `AC:1305-1315`) |
| Verification | base64 HMAC-SHA256(`settings.geidea_secret_key`, merchantPublicKey + amount.toFixed(2) + currency + orderId + status + merchantReferenceId + timeStamp), `===` (ibo `AC:2401-2405`, bob `AC:1312-1316`) |
| Responses | 305 `{status:'error', message:'Wrong Signature'}`; 404 `'Unable to handle callback'` (no order/ref); 400 `'Geidea Transaction Not Found Issue'`; SUCCESS/PAID → 200 `{status:'Success', message:'Payment succeeded'}`; other (incl. CLOSE) → 305 `'Unknown Status Received'` (ibo `AC:2408-2501`) |
| Effect | coupon branch or device +5000 months `is_trial 2`; Transaction `success` (ibo `AC:2430-2462`) |
| Replay / amount | not safe (no "already success" check) / signed, not compared |

## 11. Cowpay (ibo live; bob settings only, `admin.js:138-139`, `FC:4005`; cr none)

| Item | Detail |
|---|---|
| Routes | create = `saveActivation` case `cowpay` (ibo `FC:3957-4044`); checkout page `GET /cowpay/checkout/:fram_code/:intension` (session, `routes/frontend.js:155-157`, view `views/cowpay_checkout.ejs`); callback `POST /api/cowpaySuccessCallback` (`api.js:47`); return `GET /api/cowpayReturnUrl` (flash + 302 `/device/playlists`, `AC:2386-2391`). Root `cowpay.js` is an unused copy of the iframe loader (script tag commented, `cowpay_checkout.ejs:7`) |
| Create | `POST …:8002/GetToken` (sit.cowpay.me / identity.cowpay.me) `{clientId:'M_'+merchant_code, secret: merchant_code+merchant_phone_number}` → `POST …/paymentIntegration/api/PaymentIntention/Create` (Bearer); amount `(price×eur_to_egp).toFixed(2)` (fallback 54.00); ref `'IBOPLAYER'+txId`; `{status:'success', url:'/cowpay/checkout/'+frameCode+'/'+intentionSecret}`; token failure → logs only, hang (`FC:4040-4042`) |
| Callback fields | `merchantReferenceId`, `status`, `orderStatus` (`statusId` logged) (`AC:2291-2384`) |
| Verification | **none** (`cowpay_hash_key` loaded, unused) |
| Responses | SUCCESS/PAID/APPROVED (or orderStatus PAID) → 200 `{status:'Success', message:'Payment succeed'}`; FAILURE/BLOCKED (or orderStatus FAILED) → Transaction status = raw orderStatus, 305 `'Payment '+orderStatus`; else `pending`, 404 `'Unable to handle callback'`; missing status/unknown order → throw |
| Effect | coupon branch or device +5000 months `is_trial 2` (`AC:2307-2343`) |
| Replay / amount | forgeable with `'IBOPLAYER'+ObjectId` / no |

## 12. Cashcall (bob)

| Item | Detail |
|---|---|
| Routes | create = `saveActivation` case `cashcall` (`FC:2623-2659`); coupon version `FC:734-770` broken (keys missing from its settings list, `FC:273-290`); callback `GET /api/cashcallSuccessCallback` (`api.js:40`) — callback URL not sent, presumably configured at Cashcall (unclear) |
| Create | ref `'bobplayer'+txId`; price `(price×eur_to_egp).toFixed(2)`; outbound HMAC-SHA256 hex(`cashcall_secure_hash_key`, price + ref); JSON by string concatenation, base64url; `{status:'success', url: <paygate[stg]>/atcashcall/payment/<merchant>/<api_key>/<b64>}`; `order_id` saved |
| Callback fields | query `merchantOrderId`, `success` (`AC:1137-1216`) |
| Verification | **none** — trusts `success==='true'` |
| Effect / reply | `'true'` → device +5000 months `is_trial 2` or coupon branch (`AC:1153-1191`), `success`, 302 `/mylist?payment_status=success`; else `pending`, 302 `?payment_status=pending`; unknown order → throw |
| Replay / amount | forgeable GET / no |

## 13. CoinPayments (crypto)

| Item | ibo | bob | cr |
|---|---|---|---|
| Create | `saveActivation` case crypto (`FC:3282-3337`): `currency1:'EUR'`, `currency2: coin_type`, `amount: parseFloat(price)`, success_url `Origin + /activation/crypto/redirect?transaction_id=<id>`, cancel URL, `ipn_url = https://<Host>/api/crypto-ipn-url/<id>`; saves `payment_id = txn_id`, `status_url`, `coin_type`; `{status:'success', url: checkout_url}`; rejection → hang (`FC:3325-3328`) | `FC:1997-2043`, URLs without scheme, replies 302; coupon `FC:771-813` ReferenceError (`host_name`, `device`, `FC:782-797`) | `FC:3297-3336` broken: ReferenceError (`crypto_promises`, `coin_type`, `Coinpayments` not imported), no ipn_url |
| IPN | `POST /api/crypto-ipn-url/:transaction_id` (`api.js:59`) | `api.js:51` | not routed |
| IPN fields | header `hmac`; body `merchant`, `status`; param `transaction_id` (`AC:2889-2930`) | `AC:1652-1688` | — |
| IPN verification | `coinpayments-ipn`: HMAC-SHA512 hex over `qs.stringify(body)` (`%20`→`+`), key `settings.crypto_ipn_secret`, `!==`; plus `merchant == settings.crypto_merchant_id` | same | — |
| IPN reply | failures `res.json({status:'error'}).status(500)` → actually **200**; `status >= 100` + found → `{status:'ok'}`; otherwise **no response** | same | — |
| IPN effect | +5000 months `is_trial 2`, Transaction `success`; no coupon branch (JSON device_id → CastError → `{status:'error'}`) | same | — |
| Redirect `GET /activation/crypto/redirect?transaction_id=` | **no auth, no payment check** (`routes/frontend.js:56-59`, `FC:4048-4081`): +**500 months**, `is_trial 2`, Transaction `success`, 302 `/device/mylist` | same (`:31`, `FC:2701-2734`), 302 `/mylist` | `add(500,'m')` = **500 minutes**, any transaction id, can shorten a lifetime (`:199-202`, `FC:3610-3646`) |
| Cancel | sets `canceled`, redirect (`FC:4082`; also `/stripe/cancel`) | `FC:2735` | `FC:3648` |
| Amount / replay | not checked (`amount1`, `currency1` ignored) / redirect = free lifetime, IPN not deduped | same | same |

ibo admin also lists crypto transactions (`admin.js:237`, `AdC:3909`).

## 14. Paymentwall (all 3, identical callback)

| Item | Detail |
|---|---|
| Create | `saveActivation` case `paymentwall` (ibo `FC:3918-3956`, bob `FC:2660-2699`, cr `FC:3570-3605` unreachable): widget `pw_1`, `uid = Transaction._id`, product `"1"`, price EUR, keys `paymentwall_project_key`/`_secret_key`; success_url hardcoded `https://iboiptv.com/device/activation` (ibo, bob) / `https://bobplayer.com/device/activation` (cr); `{status:'success', url}` |
| Callback | `router.use('/paymentwall_callback')` — **any method** (ibo `api.js:52`, bob `:44`, cr `:72`); reads query `goodsid`, `uid`, `ref`, header `x-forwarded-for` (missing → 500) |
| Verification | effectively none: the handler builds its own MD5 signature from constants (`is_test=1, sign_version=2, type=0`, empty `slength`/`speriod`) and a **hardcoded key** (ibo `AC:2533`, bob `AC:1443`, cr `AC:1939`) and substitutes it for the received `sig` before `Pingback.validate()`; only the library's IP/param checks remain |
| Reply | always 200 text `OK` |
| Effect | **none** — deliver/cancel branches empty (ibo `AC:2541-2546`), Transaction untouched |

## 15. Apple IAP (cr only)

| Item | Detail |
|---|---|
| Route | `POST /api/ios/v4/apple_purchase` (ios app type only, `api.js:191-193`); chain: app-type check → IBO-envelope decrypt → device Bearer token (`req.androidAuthDevice`) |
| Request (IBO envelope `data`) | `transaction_id` (required), `original_transaction_id` (opt.), `environment` (`'sandbox'` tries sandbox first), `amount` (opt., informational), `version`/`app_version`, `os_version` (`AC:8807-8812, 8880-8893`) |
| Verification | App Store Server API `GET /inApps/v1/transactions/{id}`, ES256 JWT from `APPLE_IAP_*` env (issuer, key id, bundle id, private key; 15-min). Falls back to the other environment on 404 / 4040010. `signedTransactionInfo` decoded **without JWS verification** (trust = TLS to Apple). Checks bundleId, productId ∈ `APPLE_IAP_ALLOWED_PRODUCT_IDS`, no `revocationDate`, transactionId match, originalTransactionId match if given. Price/expiry not checked (`AC:7583-7766, 8860-8870`) |
| Errors (encrypted, real HTTP status) | `{status:'error', error_code, message}`: 400 (not ios / missing transaction_id), 403 device not authenticated, 503 (not configured / allowed product IDs not configured / Apple verification unavailable), 422 (Invalid Apple transaction / product / refunded or revoked / transaction mismatch / original transaction mismatch), 409 "Transaction already used by another device"; decrypt failure → 200 `{data: IBO({status:'error'})}` |
| Success | 200 encrypted `{status:'success', message:'Device activated successfully', mac_address, is_trial, expire_date, purchase:{transaction_id, original_transaction_id, product_id, environment}}` |
| Effect | +5000 months, `is_trial 2`, `app_type 'ios'`, `apiVersion 'V4'`, version fields (`AC:8877, 8895-8901`) |
| Transaction | only if no prior success for that id: `{device_id, payment_id: transactionId, order_id: originalTransactionId, amount: client value|undefined, status:'success', pay_time 'Y-MM-DD', payment_type:'apple_app_store', transaction_type:'device_activation', credit_count:1}` (`AC:8879-8892`) |
| Replay | mostly safe (same device re-activates, other device → 409); find-then-create without unique index → concurrent duplicates possible |

## 16. `app_purchase` (trusts the app)

| Item | ibo | bob | cr |
|---|---|---|---|
| Route | `POST /api/app_purchase` (`api.js:37`), no auth | `api.js:28` | `api.js:65` |
| Body | JSON/form `{mac_address, amount}`; missing mac → crash (`AC:1919-1972`) | same (`AC:871-923`) | IBO envelope `{mac_address, amount, app_type}`, amount `parseFloat().toFixed(2)` (`AC:1736-1813`) |
| Verification | none | none | none |
| Reply | `{status:'success', expire_date}` / `{status:'error', msg:'Sorry, mac address does not exist'}` | always success (`device = promises1[0]` is the Promise) | decrypt failure `{status:'error'}`; otherwise `helpers.getSetting("price")` called without `req` (signature `(req,key)`, `utils/helpers.js:8`) → rejects, no response, nothing written |
| Effect | `Device.updateOne({mac}, {expire_date: +5000 months, is_trial:2})` | same, no upsert | would be same + `transaction_type:'AppleStore'` |
| Transaction | `{device_id, amount: client value, pay_time 'Y-MM-DD', status:'success', payment_type:'app_purchase'}` | same, `device_id` undefined | — |
| Replay / amount | every call activates + new success Transaction / no | same | n/a |

FEATURES §8: do not rebuild as-is; replace with verified Google Play (PAY-09).

## 17. `google_pay`

ibo `POST /api/google_pay` (`api.js:38`) and bob (`api.js:29`) are routed to an **empty function** (ibo `AC:1974`, bob `AC:925`) → the request never gets a response. cr route commented out (`api.js:66`), stub at `AC:1815`.

## 18. Payment status page

`GET /payment/status` (ibo `routes/frontend.js:61` / `FC:4431`, bob `:33` / `FC:3010`, cr `:204` / `FC:3889`): flashes "Thanks for your payment<br>Your account will be activated once confirmed payment" and 302 → `/activation`. Reads/writes nothing; no backend code uses it as a return URL.

---

## 19. Summary

| Provider | Backend(s) | Verified? | Replay-safe? | Amount checked? |
|---|---|---|---|---|
| PayPal device | ibo, bob, cr (cr Transaction write fails) | capture call only; result status not read | yes (PayPal refuses 2nd capture) | no |
| PayPal reseller | ibo, bob, cr (cr 500 after Admin created) | capture call only | yes (PayPal) | no |
| Stripe | ibo, bob (create broken), cr (success no-op) | no | n/a (never activates) | no |
| Paymob | ibo, bob, cr | **no** (`hmac`, `success` ignored) | no | no |
| PaySky | ibo, bob, cr | **no** (check commented out) | no (credits mintable in ibo) | no |
| Opay / Opay1 | ibo, bob, cr (opay only; Transaction fails) | **no** | no | no |
| MDLS | ibo, bob | HMAC-SHA256 | no | signed, not compared |
| MDLS | cr (plans) | **no** (computed, never compared) | no (plan pushed per replay) | no |
| Telr auth return | ibo, bob | server-side `check` call | no | no |
| Telr callback | ibo, bob | **no** | no | no |
| PayEG | ibo, bob | HMAC-SHA512(order_id+status), hardcoded key | no | no |
| Geidea | ibo, bob | HMAC-SHA256 | no | signed, not compared |
| Cowpay | ibo | **no** | no | no |
| Cashcall | bob | **no** (`?success=true`) | no | no |
| CoinPayments IPN | ibo, bob | HMAC-SHA512 + merchant id | no | no |
| CoinPayments redirect | ibo, bob (500 months), cr (500 minutes) | **no** (no payment check, no auth) | no | no |
| Paymentwall | ibo, bob, cr | fake (self-computed signature) | n/a (never activates) | n/a |
| Apple IAP | cr | yes (App Store Server API) | mostly (no unique index) | no (product allow-list only) |
| app_purchase | ibo, bob | **no** | no | no |
| app_purchase | cr | no (crashes before writing) | — | no |
| google_pay | ibo, bob (cr commented out) | empty stub, never responds | — | — |
