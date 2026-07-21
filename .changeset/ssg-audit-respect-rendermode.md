---
'@pyreon/compiler': patch
---

`pyreon doctor --check-ssg`: the `dynamic-route-missing-get-static-paths` audit
now respects a per-route `renderMode` opt-out.

A dynamic route that declares `export const renderMode = 'spa' | 'ssr' | 'isr'`
(anything other than `'ssg'`) has explicitly opted OUT of SSG prerendering, so
it legitimately needs no `getStaticPaths` — which is exactly the remedy the
warning recommends. Previously the audit only scanned for `getStaticPaths` and
ignored `renderMode`, so it false-positived on the correctly-configured hybrid
route it had just told the user to write. The warning message now names
`renderMode = 'spa'` as the opt-out (the valid per-route override inside a
`mode: 'ssg'` app) instead of the misleading app-level "switch to mode: 'ssr'".
