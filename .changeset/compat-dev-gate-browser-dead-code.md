---
'@pyreon/solid-compat': patch
'@pyreon/svelte-compat': patch
---

fix(compat): dev-mode perf counters were dead code in Vite browser bundles

`@pyreon/solid-compat` and `@pyreon/svelte-compat` gated their
`@pyreon/perf-harness` counter emits behind
`const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`.
Both packages are browser packages, and Vite does NOT polyfill
`process` in browser bundles — so the `typeof process !== 'undefined'`
term is statically `false`, the whole `&&` folds to dead code, and the
counters (`solid-compat.createResource.staleDiscarded` /
`solid-compat.createStore.signalEvicted` /
`svelte-compat.subscribe.cachedRePush`) NEVER fired in dev, even with
the perf-harness installed. This is the exact `typeof process`-compound
bug class `pyreon/no-process-dev-gate` exists to catch.

Fix: delete the `const __DEV__` alias and inline the bundler-agnostic
`process.env.NODE_ENV !== 'production'` gate at every use site (matching
`@pyreon/reactivity` and the rest of the monorepo). Every modern bundler
replaces `process.env.NODE_ENV` at consumer build time, so the counters
now fire in dev and tree-shake to nothing in production. Inlining the
gate (rather than re-aliasing) also avoids the `__DEV__`-const
tree-shake-resistance documented in `.claude/rules/anti-patterns.md`.

No production behaviour change — the counters are dev-only diagnostics
and the gate folds away in production builds either way.

Bisect-verified: `pyreon/no-process-dev-gate` flags `origin/main`'s
`solid-compat:58` + `svelte-compat:51` (the compound); the fixed files
report zero `no-process-dev-gate` findings.
