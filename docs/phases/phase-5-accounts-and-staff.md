# Phase 5 · Accounts and staff

Branch `phase/5-accounts-and-staff` · built on: `phase/4-moves-and-cleanup` · status: **built, in review** (Omar
built it, Ali reviews; answers in [DISCUSSIONS #9](../DISCUSSIONS.md), choices made while building in #12)

The people who log in: **customers** (per brand: own devices, log in to the brand site) and **staff** (central:
our team, log in to the admin panel), with **roles** and **permissions** that decide what each staff member may
do on which brands. Schema agreed in the Old Database Map (Customers, Admin). Tests and results:
[phase-5-accounts-and-staff-tests.md](phase-5-accounts-and-staff-tests.md).

## Contents

1. [Goal](#goal)
2. [Database schema](#database-schema)
3. [Tasks and expected outputs](#tasks-and-expected-outputs)
4. [Flows](#flows)
5. [APIs this phase adds](#apis-this-phase-adds)
6. [Data move](#data-move)
7. [How it was built](#how-it-was-built)
8. [Not in this phase](#not-in-this-phase)

## Goal

- A customer signs up on a brand site, verifies the email, logs in, and sees the devices linked to the account.
- A staff member logs in once for every brand they may manage; every admin action checks a permission key.
- The super admin builds roles from permission keys in the panel; permission keys come from the code.
- **Merge point, Accounts work:** sign up and verify a customer on two brands with the same email (two separate
  accounts); log in a staff member with a role limited to one brand and see an action on another brand refused.

## Database schema

```mermaid
erDiagram
  customers ||--o{ devices : "customerId (Phase 2 field)"
  staffUsers }o--|| roles : "roleId"
  roles }o--o{ permissions : "permissions (keys)"
  customers {
    string _id PK "UUID; old _id in legacy.id"
    string email UK "unique within the brand, lowercase"
    string passwordHash "hashed"
    string firstName
    string lastName
    date emailVerifiedAt "null = not verified yet"
    object legacy "old brand, old _id"
    date createdAt
    date updatedAt
  }
  staffUsers {
    string _id PK "UUID; old rows in legacyRefs"
    string email UK "lowercase; one person, one account for every brand"
    string passwordHash "bcrypt"
    string name
    string roleId FK
    string_array tenantAccess "brands this person manages; * = all"
    string status "active | disabled"
    date lastLoginAt
    array legacyRefs "source, model, id, numericId"
    date createdAt
  }
  roles {
    string _id PK "UUID"
    string name UK "Support, Billing, Content editor"
    string_array permissions "keys; each active in permissions"
    bool system "true = super_admin: fixed, every permission"
    string createdBy "staff user"
    date createdAt
    date updatedAt
  }
  permissions {
    string _id PK "the key the code checks, e.g. devices.activate"
    string group "Devices, Resellers, Payments"
    object label "en, ar: editable"
    string description "editable"
    bool active "false once the code no longer has the key"
    date syncedAt "last startup that confirmed the key"
  }
```

| Collection | Database | Fields | From the old data | Indexes (to add) |
|---|---|---|---|---|
| `customers` | each brand | 9 | cr `User` | `email_unique` (lowercase), `legacy_id` |
| `staffUsers` | central | 10 | `Admin` rows with `is_admin` 1, merged by email across ibo, bob and cr | `email_unique`, `role` |
| `roles` | central | 7 | new (the old system has only `is_admin` 0 / 1) | `name_unique` |
| `permissions` | central | 6 | new, written by the backend on startup | `_id` is the key; `group` |

Rules from the schema:

- A customer's email is unique **within a brand**: the same person on two brands has two accounts.
- A staff user is one account for every brand; `tenantAccess` limits the brands, the role limits the actions.
- The `super_admin` role is `system`: it cannot be edited or deleted and always has every permission.
- A role may only list keys that exist and are active in `permissions`.
- Permission keys come from the code. A key added by hand in the database does nothing; a key the code no longer
  has becomes `active: false` and is removed from every role.

## Tasks and expected outputs

Omar built every task; Ali reviews (DISCUSSIONS #9.7).

| Id | Task | Expected output | Done when |
|---|---|---|---|
| ACC-1 | Collections and repositories | modules `customers` (per brand) and `staff` (central: staffUsers, roles, permissions); zod documents, migrations with validators and indexes, repositories | migrations create the four collections with their indexes; two-brand isolation test for customers |
| ACC-2 | Password hashing | one `PasswordHasher` port (bcrypt adapter), shared by customers and staff | hash and verify; old bcrypt hashes from the data move verify unchanged |
| CUS-1 | Customer sign-up and email verification | sign up (email lowercase, unique in the brand), a verification link that expires, `emailVerifiedAt` set once | the same email on two brands makes two accounts; a used or expired link is refused |
| CUS-2 | Customer login, logout, password reset | a session token for the brand site; reset by email link | a wrong password and an unknown email give the same answer; rate limited per IP and email |
| CUS-3 | Customer devices | link a device to the account (`devices.customerId`, Phase 2 field) by MAC + device key; list and unlink | a device belongs to at most one customer; another brand's device is never found |
| CUS-4 | Profile | change name, email (re-verify), password | changing the email clears `emailVerifiedAt` until verified |
| PRM-1 | Permission keys from the code | each admin route declares its key (`@Staff('devices.activate')`); on startup the backend syncs `permissions` (insert new, refresh `syncedAt`, mark missing ones inactive and remove them from roles) | a key removed from the code disappears from every role after one startup; labels edited in the panel are kept |
| PRM-2 | Roles | create, edit, delete roles from active keys; the `super_admin` system role exists from the first migration | the system role cannot be changed; a role with an inactive key is refused |
| STF-1 | Staff login | email + password (bcrypt), `lastLoginAt`; disabled staff refused | the same answer for a wrong password and an unknown email; rate limited |
| STF-2 | Staff management | the super admin creates, edits, disables staff; sets role and `tenantAccess` | a disabled member's sessions stop working |
| STF-3 | Access check | the guard checks the route's permission key in the role, and the brand in `tenantAccess` (`*` = all) | an action on a brand outside `tenantAccess` is refused even with the permission |

## Flows

### Staff access check

```mermaid
flowchart TD
  REQ["admin request on brand B<br/>route needs devices.activate"] --> AUTH{"session valid,<br/>staff active?"}
  AUTH -- no --> R401[401]
  AUTH -- yes --> ROLE{"role system (super_admin)?"}
  ROLE -- yes --> BR
  ROLE -- no --> KEY{"devices.activate in the role<br/>and active in permissions?"}
  KEY -- no --> R403A[403 missing permission]
  KEY -- yes --> BR{"B in tenantAccess,<br/>or tenantAccess = *?"}
  BR -- no --> R403B[403 brand not allowed]
  BR -- yes --> OK[handled]
```

### Permission sync on startup

```mermaid
sequenceDiagram
  participant App as backend startup
  participant Code as keys declared in the code
  participant P as permissions
  participant R as roles
  App->>Code: collect every @Staff(key)
  loop each key in the code
    App->>P: upsert key (keep edited label/description), active true, syncedAt now
  end
  App->>P: keys not seen → active false
  App->>R: remove inactive keys from every role
```

### Customer sign-up

```mermaid
sequenceDiagram
  actor C as Customer
  participant Site as brand site
  participant API as customers API
  participant Mail as email
  C->>Site: sign up (email, password, name)
  Site->>API: POST sign-up (brand from the host)
  API->>API: email lowercase · unique in this brand · hash password
  API->>Mail: verification link (expires)
  API-->>Site: account created, not verified
  C->>API: open link
  API->>API: emailVerifiedAt = now (once)
  C->>Site: log in
  Site->>API: POST login → session token
  C->>Site: link my TV (MAC + device key)
  Site->>API: devices.customerId = customer
```

## APIs this phase adds

Built as listed (additions under [How it was built](#how-it-was-built)); the frontend team builds against them.

| Area | Routes | Access |
|---|---|---|
| Customer | `POST /customer/sign-up`, `POST /customer/verify-email`, `POST /customer/login`, `POST /customer/logout`, `POST /customer/password-reset`, `GET/PATCH /customer/me`, `GET /customer/devices`, `POST /customer/devices/link`, `DELETE /customer/devices/:id` | `@Public()` for sign-up and login, `@Customer()` after |
| Staff | `POST /admin/login`, `POST /admin/logout`, `GET /admin/me` | `@Public()` / `@Staff()` |
| Staff management | `GET/POST /admin/staff`, `PATCH /admin/staff/:id` (role, tenantAccess, status) | `@Staff('staff.manage')` |
| Roles | `GET/POST /admin/roles`, `PATCH/DELETE /admin/roles/:id` | `@Staff('roles.manage')` |
| Permissions | `GET /admin/permissions`, `PATCH /admin/permissions/:key` (label, description, group) | `@Staff('roles.manage')` |
| CLI | `pnpm cli staff:create <email> <name>` (first super admin), `pnpm cli permissions:sync` | — |

## Data move

| Old | New |
|---|---|
| cr `User` | `customers` in that brand; `password` kept as the hash, `is_verified` + `verified_at` → `emailVerifiedAt` |
| `Admin` with `is_admin` 1 (ibo, bob, cr) | one `staffUsers` row per email, `legacyRefs` for every old row; role `super_admin` (full access today); `tenantAccess` = the brands they were admin of |
| `Admin` with `is_admin` 0 | resellers (a later phase), not staff |

## How it was built

| Question (DISCUSSIONS #9) | Built |
|---|---|
| 1. Sessions | Server sessions in Redis: an opaque random token (`Authorization: Bearer …`), only its SHA-256 is stored; a per-person index ends every session at once. Staff 12 hours, customers 30 days. With Redis down nobody is logged in (fails closed). |
| 2. Two-factor login | In this phase: authenticator-app codes (TOTP, RFC 6238, ±30 s). `POST /admin/me/two-factor/setup` → `enable` with a first code; login then answers a 5-minute challenge, finished at `POST /admin/login/two-factor`. The secret is sealed with `TENANT_SECRETS_KEY`, bound to the staff id. |
| 3. Email | Each brand's own SMTP server: secret `smtp.url` (`smtps://user:password@host:465`), sender in config `email.from`, links to `TenantSettings.frontendUrl` (`/verify-email?token=…`, `/reset-password?token=…`). Without SMTP outside production the email goes to the log and the dev-only `GET /dev/outbox?to=…`. |
| 4. cr passwords | bcrypt (cost 10 in cr); they verify as they are. New hashes use cost 12 (`bcryptjs`, no native build). |
| 5. Day-one roles | Migration `0005-staff` makes `super_admin` (system) and Support (`devices.view`), Billing (`devices.view`, `devices.activate`) and Content editor (none). |
| 6. Customer devices | Link by MAC + device key; paid devices only (#12). 10 tries an hour per account and per IP: a key is only 6 digits. |

Also built: `customerTokens` (per brand, one-time email links stored as hashes, TTL index), the `devices.customer`
index (`0010-devices-customer`), the access guard for `@Staff(key)` (brand from the host must be in `tenantAccess`),
`@CentralStaff(key?)` (no brand check) and `@Customer()` (own brand's host only), login rate limits (10 per 15 minutes
per IP and per email), and the first admin device routes `GET /admin/devices/:mac` (`devices.view`) and
`POST /admin/devices/:mac/activate` (`devices.activate`, recorded as source `admin` with the staff id).

Routes as built: customer `POST /customer/password-reset/confirm` (token + new password) and
`POST /customer/me/resend-verification` were added to the list above; `PATCH /customer/me` needs `currentPassword` to
change the email or the password. Errors are `{ error: { code, message } }` with 400, 401, 403, 404, 409 or 429.

CLI: `echo '<password>' | pnpm cli staff:create <email> <name> [--role id] [--brands a,b]` (default super_admin on
every brand; without a piped password one is made and shown once), and `pnpm cli permissions:sync`.

## Not in this phase

Resellers, wallet, codes and coupons (they come next, with the money tables), payments, and account plans
(customers buying plans for linked devices) come in later phases ([ROADMAP.md](../ROADMAP.md)).
