# Contributing

## Workflow

- Commit on `master` in small, focused commits; open a PR when a change needs review from the other developer.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), checked by commitlint.
- The pre-commit hook runs ESLint and Prettier on staged files.
- CI must be green: format, lint, typecheck, unit tests, integration tests, build.

## Code rules

The full picture is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The short version:

1. **Layers.** `domain` (pure rules) ← `application` (use cases + ports) ← `infrastructure` (adapters). Controllers live in `src/interfaces/`, never inside modules. ESLint enforces it.
2. **Module public API.** Import another module only through its `index.ts`.
3. **One use case, one action.** A class with one public `execute()`. Controllers call use cases, never repositories.
4. **Errors.** Expected business failures are `DomainError`s returned in a `Result`; throw only for bugs and infrastructure failures.
5. **Every route declares access** with one of the decorators in `src/shared/auth/access.decorators.ts`.
6. **No `process.env`** outside `src/shared/config`. Add new variables to `env.schema.ts` and `.env.example`.
7. **Time** comes from an injected `Clock` (added with the first rule that needs it); store dates in UTC; money in integer minor units (`Money`).
8. **Indexes** are created by migrations, never `autoIndex`.
9. **Tenant data** is reached through the tenant context; no `if (tenant === 'x')` — add a tenant config flag.
10. **Tests.** Domain and use cases get unit tests with in-memory fakes; repositories and HTTP get integration tests.

## New module

Copy `src/modules/_template` and follow its README.

## Decisions

Architecture changes are written as ADRs in `docs/adr/NNNN-title.md`.
