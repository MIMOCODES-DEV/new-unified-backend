# Endpoint catalogue (CAP-02)

> Generated 2026-10-15 by `tools/legacy-analysis/endpoint-catalogue.cjs` from `routes/*.js` of the three old backends (comments stripped, multi-line definitions included). V4 routes are written once in a loop and listed once with `{t}` = app type.
> "Called by" uses the real clients surveyed in [client-usage.md](client-usage.md). A route nobody here calls is not automatically dead: other apps exist; production traffic logs decide.

## Verdicts

| Verdict | Meaning |
|---|---|
| rebuild (app contract, frozen) | Installed apps call it: same path, method, encoding and response shape; logic rebuilt clean behind a legacy adapter |
| rebuild (store contract, frozen) | The external store calls it: same contract, see store-contract.md |
| keep path (provider-configured) | Payment providers redirect or post to it; the URL is configured in their dashboards |
| replace (unified customer API) | Old website route; the unified frontend uses the new customer API instead (D15) |
| replace (admin API) / (reseller API) | Old server-rendered panel; replaced by the new admin and reseller APIs |
| drop | Test, debug, one-off maintenance or unsafe route; not rebuilt |

| Verdict | ibo | bob | cr |
|---|---|---|---|
| rebuild (app contract, frozen) | 48 | 36 | 69 |
| rebuild (store contract, frozen) | 13 | 15 | 14 |
| keep path (provider-configured) | 25 | 23 | 12 |
| replace (unified customer API) | 66 | 52 | 84 |
| replace (admin API) | 121 | 107 | 101 |
| replace (reseller API) | 0 | 14 | 13 |
| drop | 10 | 14 | 11 |
| **Route definitions** | **283** | **261** | **304** |
| **Live URLs** (V4 × app types) | **393** | **371** | **460** |
| Called by a known client | 21 | 9 | 50 |

Per backend: [ibo](endpoints-ibo.md) · [bob](endpoints-bob.md) · [cr](endpoints-cr.md)
