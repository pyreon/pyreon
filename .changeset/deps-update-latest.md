---
'@pyreon/dnd': patch
'@pyreon/zero-content': patch
'@pyreon/query': patch
'@pyreon/virtual': patch
---

chore(deps): update dependencies to latest across the workspace

Bumps every workspace package's dependencies to their latest versions. Notable
consumer-visible runtime bumps (all validated — typecheck + package tests +
full lib build green):

- `@pyreon/dnd`: `@atlaskit/pragmatic-drag-and-drop` 1→2, `-auto-scroll` 2→3,
  `-hitbox` 1→2 (major; 129 tests pass)
- `@pyreon/zero-content`: `shiki` 1→4 (major; 732 tests pass)
- `@pyreon/query` / `@pyreon/virtual`: `@tanstack/*` → 5.101.2 / virtual-core 3.17.3

Dev-only / benchmark-competitor bumps (not shipped to consumers): `@casl/ability`
6→7, `i18next` 24→26 (both benches re-run clean, correctness gates pass),
`@types/node` 26, `@vitus-labs/tools-*`, `typescript` (real-bench aligned to 6).

Coherence overrides added for version-coupled ecosystems (the codemirror family
and vite/vitest must share one version): `@codemirror/state@6.6.0` and
`vite@8.0.16` pinned; `@tanstack/query-core` override → 5.101.2. Held back:
codemirror patch bumps in `@pyreon/code` (version-coupled with 18 transitive
lang-* packages), `sharp` peer range kept permissive (`^0.33 || ^0.34 || ^0.35`).
