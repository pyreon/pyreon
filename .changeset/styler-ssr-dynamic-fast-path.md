---
"@pyreon/styler": patch
---

perf(styler): SSR fast path for reactive `DynamicStyled` components

On the server every render is a single pass with no client reactivity, yet
`DynamicStyled`'s reactive branch (when `$rocketstyle`/`$rocketstate` are
accessors — i.e. every rocketstyle component) allocated a `computed`
subscription, a `ref` closure, and a `renderEffect` per component. All three
are client-only dead weight server-side: refs never fire during
`renderToString`, and no signal changes within a single SSR pass — so they
allocate and subscribe but emit zero HTML.

`DynamicStyled` now branches on a module-level `IS_SERVER` (`typeof document
=== 'undefined'`): on the server it resolves the class once and emits,
skipping the computed/ref/renderEffect entirely. The emitted className is
byte-identical to the reactive path's initial value, so hydration (where the
client re-establishes the reactive machinery) sees no mismatch.

Measured via `renderToString` of 2,000 reactive styled components, tight
drift-controlled A/B (8 pairs): ~9.7ms → ~1.95ms (~5×, 95% CI
[+7.54, +7.91ms], 8/8 faster). The win scales with the cache-hit rate —
largest for pages that repeat the same components (buttons/cards), where the
reactive-machinery allocation dominates the cached resolve.
