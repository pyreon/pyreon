---
'@pyreon/styler': patch
---

perf: theme-only and css-only imports no longer pay the whole sheet engine

Three top-level side effects pinned the entire package into every consumer bundle
(`useTheme`-only imports paid 6.09KB gz): the `sheet` singleton construction, the
streaming-SSR flush registration (its `typeof document` guard is not statically
foldable, so browser bundles retained it — and through it the engine), and styled's
`onSheetClear(...)` cache-invalidation hook.

Now: the singleton is `/* @__PURE__ */`-annotated (droppable exactly when no styling
API is used — construction and `<style>` mount timing unchanged for every real
consumer); flush registration moved into the `StyleSheet` constructor behind a
singleton-only `registerSSRFlush` option (`createSheet()` instances still never
clobber the global; plain-Node runtime behavior is byte-identical — PURE comments
only affect bundlers); the clear-hook registers one-shot on the first `styled()`
call (timing-safe: before that call the caches it invalidates are empty).

Measured: `useTheme` 6.09 → 1.12KB gz (−82%), `css` 6.10 → 1.49KB (−76%),
`keyframes` → 4.55KB; `styled` unchanged (it genuinely is the engine). Locked by new
`@pyreon/styler::useTheme` / `::css` import-budget entries.
