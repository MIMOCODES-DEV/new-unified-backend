# ADR 0001: Stack and architecture baseline

- Status: Proposed (to confirm at the 2026-10-15 kickoff)
- Date: 2026-10-14

## Decision

- Node.js 24, TypeScript strict, ESM.
- NestJS 12 on the Fastify adapter.
- MongoDB through the official driver with typed repositories (no Mongoose). Documents validated with zod where they cross a trust boundary.
- Redis + BullMQ for rate limits, caches, locks and jobs. Jobs run only in the worker process.
- Clean architecture per module (domain / application / infrastructure), controllers in `src/interfaces/`, module public API through `index.ts`. Enforced by ESLint (`eslint-plugin-boundaries`, `no-restricted-imports`).
- Vitest for unit tests, Testcontainers for integration tests.
- Every route declares access with a decorator; a global guard refuses undeclared routes.

## Why

See docs/ARCHITECTURE.md §2 and §9. Mongoose was rejected because its strict mode silently drops unknown fields (a bug class in the old backends) and its models leak persistence concerns into business code.

## Consequences

- NestJS 12 is ESM-only, so imports use `.js` suffixes and the project is `"type": "module"`.
- TypeScript is pinned to 6.0 until typescript-eslint supports TypeScript 7.
