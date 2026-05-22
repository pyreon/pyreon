---
'@pyreon/reactivity': minor
'@pyreon/core': patch
---

Extract `defineCrossModuleState(key, init)` helper. The 5 inlined `Symbol.for(...) ?? init; if (!g[KEY]) g[KEY] = …` blocks in `@pyreon/core`'s `lifecycle.ts` / `component.ts` / `context.ts` / `telemetry.ts` / `props.ts` (from #855) collapse to one helper call per state var. Same `Symbol.for` keys preserved — byte-identical runtime behavior; the existing regression tests in `cross-module-state.test.ts` pass unchanged.

The helper lives in `@pyreon/reactivity` (the lowest layer in the dep order — standalone, every other package transitively depends on it) so EVERY package can apply the same pattern. `@pyreon/core` re-exports it for backward-compat with the previous PR. Follow-up PRs will use this to harden `@pyreon/reactivity`'s own module-level state (activeEffect, batch state, scope, tracking deps), and then `@pyreon/router`, `@pyreon/store`, `@pyreon/storage`, etc.
