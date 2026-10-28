# Contributing

## Workflow

- Start every branch from `master`: one branch per feature (`feature/<name>`, names in
  [docs/ROADMAP.md](docs/ROADMAP.md)). Only `master` counts; the `ali-dev` and `omar-dev` branches and their
  stashes are not used.
- Merge flow: review by the other developer → typecheck, lint, unit and integration tests green → `master`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), checked by commitlint. Put the task id in the message, e.g. `feat: recovery code (REC-1)`.
- The pre-commit hook runs ESLint and Prettier on staged files.
- CI must be green: format, lint, typecheck, unit tests, integration tests, build. The full checklist, the local
  setup without Docker and the end-to-end checks are in [docs/TESTING.md](docs/TESTING.md).
- When a feature is merged, update its status in [docs/ROADMAP.md](docs/ROADMAP.md) in the same branch.

## Code rules

The full picture is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The short version:

1. **Layers.** `domain` (pure rules) ← `application` (use cases + ports) ← `infrastructure` (adapters). Controllers live in `src/interfaces/`, never inside modules. ESLint enforces it.
2. **Module public API.** Import another module only through its `index.ts`.
3. **One use case, one action.** A class with one public `execute()`. Controllers call use cases, never repositories.
4. **Errors.** Expected business failures are `DomainError`s returned in a `Result`; throw only for bugs and infrastructure failures.
5. **Every route declares access** with one of the decorators in `src/shared/auth/access.decorators.ts`.
6. **No `process.env`** outside `src/shared/config`. Add new variables to `env.schema.ts` and `.env.example`.
7. **Time** comes from an injected `Clock`; store dates in UTC; money in integer minor units (`Money`).
8. **Indexes** are created by migrations, never `autoIndex`.
9. **Tenant data** is reached through the tenant context; no `if (tenant === 'x')` — add a tenant config flag.
10. **Tests.** Domain and use cases get unit tests with in-memory fakes; repositories and HTTP get integration tests. Every rule in a module spec ([docs/modules/](docs/modules/)) gets a test; every repository gets an integration test, including the two-brand isolation check.

## New module

Copy `src/modules/_template` and follow its README. Write its rules in `docs/modules/<name>.md` and its
collections in [docs/SCHEMA.md](docs/SCHEMA.md).

## Brand data and migrations

- Brand repositories inject `TenantDb` and ask for their collection **on every call**: one repository object serves
  every brand.
- A migration is `{ id: '0001-…', description, up(db) }` (`src/shared/database/migrations/migration.ts`): forward
  only, ids in order.
- Each module exports its migrations (as `tenants` does in `tenants.migrations.ts`); add them to
  `tenantMigrations` (or `centralMigrations`) in `src/migrations.ts`.

```bash
pnpm cli migrate:tenants        # applies brand migrations to every brand database
pnpm cli tenants:seed           # seed the local test brands
pnpm cli tenant:create …        # make a test brand (all commands: src/main.cli.ts)
pnpm cli tenant:config …        # see a brand's config (trial.days, app.demoUrl, …)
```

## Decisions

- Architecture changes are written as ADRs in `docs/adr/NNNN-title.md`.
- Open questions between us go in [docs/DISCUSSIONS.md](docs/DISCUSSIONS.md); when one is settled, the decision is
  written there and in the module spec it changes.
