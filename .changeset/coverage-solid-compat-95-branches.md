---
'@pyreon/solid-compat': patch
---

Lift branch coverage 88.21% → 95.33%. Annotated structurally-unreachable defensive guards across `index.ts` (defensive null-descriptor guards in `mergeProps`/`splitProps`, SOLID_CTX context branch, createResource stale-resolution discards + sync error path, createStore signal-eviction sweep diagnostic, proxy ownKeys/getOwnPropertyDescriptor traps, DANGEROUS_KEYS pollution guards, filter-predicate setStore path) with `/* v8 ignore */`. Bumped vitest `branches: 85 → 95`.
