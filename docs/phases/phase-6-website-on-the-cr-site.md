# Testing the cr website on the new backend

How to test `E:\Revamp\cr-unified-frontend` (branch **`new-backend`**, made from
`improvement/cleanup-and-multi-tenant`) against the new unified backend (branch `phase/6-website-api`) on this
machine. Written 28 Oct 2026. Both branches are on GitHub: the backend on `phase/6-website-api`, the site on
`new-backend` in `MIMOCODES-DEV/cr-unified-frontend`.

## How the site talks to the new backend

The site's components still make their old `/frontend/...` calls. One file translates them:
**`src/api/newBackend.js`** sends each old call to its new route and gives the reply back in the old shape, so the
pages work unchanged. It is installed in `src/utils/axiosInstance.js`. `src/config/api.js` points at the new backend
(`http://<brand>.localhost:3000` locally, no `/frontend`). When the frontend team moves a component to the new API, it
deletes that entry from the table.

| Changed file (branch `new-backend`) | What |
|---|---|
| `src/api/newBackend.js` (new) | the old call → new route table, and the reply shapes |
| `src/utils/axiosInstance.js` | uses the table |
| `src/config/api.js` | the new backend's address (port 3000, no `/frontend`) |

Sessions: `localStorage.token` is the login (a TV or a customer), `authKind` says which. A customer opening one of
their TVs gets that TV's own session in `deviceToken`.

## Before you start

1. **MongoDB 27018** and **Redis 6379** are running.
2. **The API**, in `E:\Revamp\new-unified-backend`: `pnpm dev:api`. Wait for `Permission keys synced`.
3. **The site**, in `E:\Revamp\cr-unified-frontend`: `npm run dev` (or `npx vite --port 5173`).
4. Open **`http://cr7player.localhost:5173`** (the brand from the hostname: `cr7player` matches `cr7player.com` → CR
   Player → brand `cr7`), or `http://localhost:5173/?theme=crplayer`. Since 28 Oct a logout keeps the `?theme=` brand
   (it used to clear it and fall back to `duplex`). Another brand: the first part of one of its domains (the `hosts` in
   `src/brands/<brand>/brand.js`), or its `?theme=` key.
5. **Emails:** no SMTP is set up locally, so emails are not sent. Read the latest one (with its link token) at
   `http://cr7.localhost:3000/dev/outbox?to=<email>` and open `http://cr7player.localhost:5173/set-password/<token>`.
6. **A TV to log in with:** a TV registered on brand `cr7` (CRPlayer app in the simulator, or the playground's
   **Old app** tab at `http://cr7.localhost:3000/dev/playground`). Its MAC and device key show on the TV. To make it
   paid: playground → **License** → Activate.
7. **MongoDB Compass** on `mongodb://localhost:27018`, database `cr7`.

## Test steps

| # | Do | Expected | Check in Compass (`cr7`) |
|---|---|---|---|
| 1 | **Login → MAC + device key**: type the TV's MAC, its device key and the captcha. | The dashboard opens with the TV's playlists. | — |
| 2 | Type a wrong device key (new captcha each try). | "MAC address or device key is not correct". | — |
| 3 | **Add playlist** (M3U link), then **Add XC playlist** (server, username, password). | Both listed. | 2 rows in `playlists` |
| 4 | Add one **protected** with a PIN. | Listed; opening it asks for the PIN. | `protected: true` |
| 5 | **Edit** a playlist: change the name or link. For the protected one, enter its PIN first. | The change shows in the list. | `name` / `url` changed |
| 6 | **Delete** a playlist (the protected one asks for its PIN). | It is gone. | row removed |
| 7 | **Device key**: set a new one; log out and log in with it. | The new key works, the old one does not. | `deviceKey` on the device |
| 8 | **Parent PIN**: set 4 digits. | Saved. | `parentPin` |
| 9 | **Account details**: change the UID; generate a recovery code. | The new UID and the 8-character code show. | `uid`, `recovery.code` |
| 10 | **Switch MAC** to a TV that opened the app once (lifetime license only; yearly is refused). | The license moves; the dashboard shows the new MAC. | `macAddress` changed |
| 11 | **Log out**. | Back on the login page. | — |
| 12 | **Sign up** with first name, last name and email. | "Check your email". | a row in `customers` |
| 13 | Open the set-password link (outbox, step 5 above) and choose a password. | "Password set", back to login. | `emailVerifiedAt` set |
| 14 | **Login → email + password**. | The **Devices** page. | — |
| 15 | **Add device** with a paid TV's MAC and device key. | The TV is listed, **Active**. | `customerId` on the device |
| 16 | **Rename** the TV. | The name shows. | `deviceNames` on the customer |
| 17 | **Select** the TV, then add or delete a playlist from there. | The TV's playlists change. | `playlists` |
| 18 | **Change password**; then log in again with the new one. | The old one fails, the new one works. | — |
| 19 | **Remove** the TV from the account. | Gone from the list. | `customerId` back to null |
| 20 | **Forgot password** with your email; open the link from the outbox. | You set a new password. | — |
| 21 | **Activate by MAC** (public): MAC + captcha. | "Device verified" with its status. | — |
| 22 | **Add playlist by MAC only** and **Delete playlists by MAC only** (login page tools, QR page). | Added; then deleted (protected ones are kept). | `playlists` |
| 23 | **Check playlist** on an Xtream playlist with a real provider. | The account status, expiry, connections. A local or private address is refused. | — |
| 24 | **Contact us**: send a message. | "Thanks for contacting us". | a row in `contactMessages` |

## Not working yet (expected)

- **Plans and payments** (Plans, Active plans, PayPal, Cowpay, crypto, saveActivation): "not on the new backend yet".
- **Linking a TV by MAC alone** (the `?mac_address=` link after logging in): the new backend asks for the device key
  too; add the TV from **Devices** with its key.
- **Backup DNS hosts and the provider's email and WhatsApp** in the playlist forms are not saved yet.
- **The captcha on the email login** is shown but not checked; the new backend limits login tries instead
  (10 per 15 minutes per IP and per email).

## When something fails

- The browser's DevTools **Network** tab shows the new route each call went to (`/device/...`, `/customer/...`,
  `/site/...`) and its reply; an error reply has `error.code`.
- The `pnpm dev:api` terminal shows the request and any error.
- Write down the page, the step, what you did and what you saw.
