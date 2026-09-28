---
"@pyreon/flow": patch
---

Harden the flow webview host-HTML builder against a quote in developer-supplied
color config breaking the generated page.

`buildFlowHostHtml` interpolated the `edgeColor`/`nodeFill`/`nodeStroke`/
`labelColor` config into JS string literals and one `innerHTML` attribute, so a
value containing `'` broke out of the string. These are developer configuration
(never user data by design), so this is footgun-removal / correctness, not a
user-facing vulnerability — but a color with a quote should not corrupt the page.

Fix: the colors run through a `safeColor` allowlist (CSS-color tokens only) that
neutralizes every interpolation site at once. Valid hex / `rgb()` / named colors
are unaffected.
