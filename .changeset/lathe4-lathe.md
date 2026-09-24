---
'@pyreon/lathe': minor
---

Generated-client correctness and DX pass:

- Output order no longer depends on the host locale (`LC_ALL`): every emitted sort is by code unit, so the same spec regenerates byte-identically on every machine.
- Entry points (`index.ts`, `dev.ts`) re-export only files that were actually emitted — a zero-model or zero-operation spec no longer imports `./schemas` / `./keys` / `./faker` that do not exist.
- Operation ids and model names that collide with names the generated modules bind (`api`, `s`, `z`, `keys`, `query` → `useQuery`, `Record`, `Infer`, `Partial`, …) are suffixed (`apiOp`, `RecordModel`).
- An operation-level parameter overrides a path-level one with the same `name` + `in`, as OpenAPI specifies.
- Faker builders compile under `noUnusedParameters`.
- A literal `:` in a spec path (`/v1/{name}:cancel`) is escaped, so custom-verb operations no longer demand a phantom parameter; mocks match them too.
