---
"@pyreon/charts": patch
"@pyreon/flow": patch
---

Harden webview host-HTML builders against a quote in developer-supplied
theme/color config breaking the generated page.

`buildChartHostHtml` interpolated `theme` as a bare single-quoted JS string
(`'${theme}'`) and `renderer` verbatim into the `echarts.init(...)` object
literal — a theme name or renderer containing `'` broke out of the call.
`buildFlowHostHtml` interpolated the `edgeColor`/`nodeFill`/`nodeStroke`/
`labelColor` config into JS string literals and one `innerHTML` attribute the
same way. These are developer configuration (never user data by design), so this
is footgun-removal / correctness, not a user-facing vulnerability — but a color
or theme name with a quote should not corrupt the page.

Fix: `theme` is now `JSON.stringify`'d (a properly-escaped JS string literal),
`renderer` is validated to the `'canvas' | 'svg'` enum, and the flow colors run
through a `safeColor` allowlist (CSS-color tokens only) that neutralizes every
interpolation site at once. Valid hex / `rgb()` / named colors are unaffected.
