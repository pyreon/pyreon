---
'@pyreon/compiler': patch
'@pyreon/vite-plugin': patch
---

Stack traces in compiled `.tsx` modules point at the failing line and column again (#4418).

- `@pyreon/compiler`: the native (Rust) backend now returns a V3 source map, identical to the JS backend's, so `transformJSX` returns a map on both backends. A Plain Mode module's map now describes the text you passed in, not the pre-pass rewrite. `transformDeferInline` returns a `map`, and no longer emits `import {  from './x'` when two `<Defer>` children drop bindings of the same import. New export: `composeMappings(outer, inner)`, which composes the `mappings` of two maps (native when the binary is present).
- `@pyreon/vite-plugin`: the `transform` hook returns one map through every pass it runs, not only the compiler's. Before, a bare `<Show>` or `<For>` (auto-imported), an inline `<Defer>`, island auto-naming, the compat `className` rename, the validator rewrite and the dev HMR and signal-name passes each shifted frames that came after them. Signal debug names (`__sourceLocation`) now report the source position instead of the compiled one.
