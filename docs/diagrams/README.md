# Diagrams

Diagrams of how the unified backend works, one Markdown file per feature or topic. Each diagram is a hand-drawn SVG next to its Markdown file. GitHub and VS Code show them inline. Diagrams are dark only.

| File | Shows | Status |
|---|---|---|
| [architecture-layers.md](architecture-layers.md) | The three processes, the layers inside a module, and which way imports may point | Built |
| [request-pipeline.md](request-pipeline.md) | What an HTTP request passes through, from Fastify to the error filter | Built (planned steps dashed) |
| [tenancy.md](tenancy.md) | Host → brand, central vs brand databases, how code reaches the current brand's database | Built |
| [device-registration.md](device-registration.md) | Device states, register-or-get, and moving a device to `devices` when it pays | Built (core + CLI; no HTTP door yet) |

## Conventions

- One topic per Markdown file; start with one sentence saying what the diagram answers.
- Draw as SVG, 680 px wide, dark colours only (no light variant, no `prefers-color-scheme` switch). Copy an existing `.svg` to start. PNG exports are dark only too.
- Colours carry meaning: teal = paid / done, amber = trial / not paid, purple = a step in our code, coral = errors or later, gray = neutral. Dashed = planned or a collection.
- Use real names from the code (collections, use cases, files) so a diagram can be checked against `src/`.
- When the code changes, update the diagram in the same pull request.
