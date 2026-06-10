---
'@pyreon/zero': patch
---

Hardened `injectIntoTemplate`'s `<div id="app">…</div>` matching against the polynomial-regex (ReDoS) attack class. Replaces the `/<div\s+id=["']app["']\s*>([\s\S]*?)<\/div>/` regex fallback with a linear `indexOf`-based scan (both `id="app"` and `id='app'` shapes accepted; behavior byte-identical for well-formed templates). Surfaced by CodeQL `js/polynomial-redos` on the docs-cutover PR; while consumer templates are normally framework-controlled, eliminating the regex closes the class entirely.
