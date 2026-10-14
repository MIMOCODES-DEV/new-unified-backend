# Module template

Copy this folder to start a new module. It is a working example of every layer and is not imported by the app.

```
modules/<name>/
  domain/              entities, value objects, domain errors — pure TypeScript
  application/
    ports/             abstract classes the use cases depend on (repositories, gateways)
    use-cases/         one class per action, one public execute(), unit-tested
  infrastructure/      adapters implementing the ports (Mongo, Redis, SDKs)
  <name>.module.ts     binds ports to adapters, exports use cases
  index.ts             public API: the only file other code may import
```

Steps:

1. Copy `_template` to `modules/<name>` and rename `Example` / `template` everywhere.
2. Write the domain rules and their tests first.
3. Add use cases with in-memory fakes of the ports in the specs.
4. Implement the Mongo adapter; add its indexes as a migration, never `autoIndex`.
5. Export use cases from `<name>.module.ts`, re-export them in `index.ts`, and call them from a controller in `src/interfaces/`.

Rules (enforced by ESLint where possible):

- `domain/` imports only `shared/kernel` and no packages.
- `application/` imports its own `domain/` and `shared/kernel`.
- Controllers and other modules import a module only through its `index.ts`; they never touch its repositories.
- Use cases return `Result` for business failures and throw only for bugs and infrastructure errors.
