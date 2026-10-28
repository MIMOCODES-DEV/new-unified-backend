# Phase 5 · Accounts and staff

Branch `phase/5-accounts-and-staff` (not created yet) · built on: `phase/4-moves-and-cleanup` · status:
**planned, not started**

**Tests:** [phase-5-accounts-and-staff-tests.md](phase-5-accounts-and-staff-tests.md) (planned): every test this phase adds, what it proves, how to run it, and the result on this branch.

The people who log in: **customers** (per brand: own devices, log in to the brand site) and **staff** (central:
our team, log in to the admin panel), with **roles** and **permissions** that decide what each staff member may
do on which brands. This page is the plan; nothing here is built yet. Schema agreed in the Old Database Map
(Customers, Admin).

## Contents

1. [Goal](#goal)
2. [Database schema](#database-schema)
3. [Tasks and expected outputs](#tasks-and-expected-outputs)
4. [Flows](#flows)
5. [APIs this phase adds](#apis-this-phase-adds)
6. [Data move](#data-move)
7. [Open questions](#open-questions)
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

Who does what is to agree. Ids are proposals.

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

Paths are proposals; the frontend team builds against them (OpenAPI).

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

## Open questions

1. Sessions: signed tokens (JWT) with a short life and a refresh token, or server sessions in Redis (easier to cut
   off a disabled staff member at once)?
2. Two-factor login for staff (PLAN M5 mentions 2FA): in this phase or later?
3. Which email service sends verification and reset links, per brand sender?
4. Are cr customer passwords bcrypt hashes we can verify as they are? (cr admins use bcrypt; check `User`.)
5. Day-one roles: only `super_admin`, or also Support, Billing and Content editor from a seed?
6. Customer devices: link by MAC + device key (as the old site logs in), or only through recovery and payments?

## Not in this phase

Resellers, wallet, codes and coupons (they come next, with the money tables), payments, and account plans
(customers buying plans for linked devices) come in later phases ([ROADMAP.md](../ROADMAP.md)).
