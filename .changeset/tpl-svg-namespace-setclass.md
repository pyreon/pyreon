---
"@pyreon/runtime-dom": minor
"@pyreon/compiler": minor
---

Fix SVG-rooted templates rendering nothing (the `@pyreon/flow` "edges don't render" bug) — two coupled bugs.

**`_tpl` was SVG-namespace-blind.** The compiler lowers a DOM subtree to `_tpl("<html>")`; the runtime parsed it via `template.innerHTML`, which only enters SVG mode on a literal `<svg>`. A template rooted at a bare SVG child — `<g>`, `<path>`, `<rect>` (what a flow edge lowers to) — was parsed in the HTML namespace, so the cloned nodes were inert `HTMLUnknownElement`s that rendered nothing. `_tpl` now parses an SVG-rooted string inside an `<svg>` wrapper so the clone carries the SVG namespace.

**The compiler's template `class` binding used `el.className = …`.** That's a writable string on HTML but a read-only `SVGAnimatedString` on SVG, so the assignment threw once `_tpl` gave the elements the correct namespace — the reactive effect threw and the edge was skipped. Both backends now emit `_setClass(el, v)` (the runtime `applyClassProp`, using `setAttribute("class", …)`, valid on HTML and SVG) — finishing the `_setStyle` extraction (`class` was the last attribute still inlined). No app code change; a reactive `class=` on an SVG element in a template now works.

Verified in real Chromium (`getTotalLength()`/`SVGPathElement`, not a `querySelector` count) — happy-dom couldn't catch either bug (no `SVGAnimatedString`; HTML-namespace SVG parse).
