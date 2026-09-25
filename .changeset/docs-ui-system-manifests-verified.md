---
'@pyreon/rocketstyle': patch
'@pyreon/styler': patch
'@pyreon/attrs': patch
'@pyreon/elements': patch
'@pyreon/kinetic': patch
'@pyreon/coolgrid': patch
---

Correct the API documentation (manifests, llms.txt, MCP api-reference, docs reference pages) for rocketstyle, styler, attrs, elements, kinetic and coolgrid so it matches the shipped runtime. Notable corrections: styler's `ThemeProvider` takes an object only (no parent-merging function form) and reads it once; rocketstyle's `Provider` snapshots its parent context and writes only the ui-core context; `.config({ inversed })` inverts only the component itself; `.compose()` wraps user HOCs last-defined-outermost; `keyframes` and static `createGlobalStyle` inject at call time; `useCSS`'s `boost` argument has no effect; `List` renders a fragment unless `rootElement` is set; kinetic's `show` accepts an accessor, a value, or nothing. No runtime changes.
