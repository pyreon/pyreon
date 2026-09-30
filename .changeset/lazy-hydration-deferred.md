---
'@pyreon/core': minor
'@pyreon/runtime-dom': minor
'@pyreon/solid-compat': patch
'@pyreon/vue-compat': patch
'@pyreon/compiler': patch
---

Hydrating a `lazy()` whose client chunk has not landed no longer rebuilds its server-rendered region. The server's nodes stay in place (no fallback, no empty gap) and are hydrated once the chunk loads, inside the context owner of the hydration point — so node identity, focus and typed input survive. Covers core `lazy()`, the react/preact/solid-compat `lazy` and vue-compat's `defineAsyncComponent` (including `suspensible: false`, as Vue's hydration awaits every async wrapper).

`lazy()` now renders through an accessor, which also fixes a lazy mounted while its chunk was loading and NOT inside a `<Suspense>` rendering nothing forever. Its server output gains a `<!--$-->…<!--/$-->` range, like any reactive child. solid-compat's `lazy` now starts loading on first render, as Solid does. `pyreon doctor diagnose` explains a failed code-split chunk.
