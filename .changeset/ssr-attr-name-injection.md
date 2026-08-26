---
"@pyreon/runtime-server": patch
"@pyreon/compiler": patch
---

Security: validate SSR attribute NAMES to close an XSS sink.

`renderToString`/`renderToStream` escaped attribute VALUES but not attribute
NAMES — and `escapeHtml` leaves space and `=` intact, while an attribute name is
never quoted. So a spread of a user-keyed object onto an SSR element
(`<el {...userKeys}>`) let an attacker-controlled key like
`{ ['x onmouseover=alert(document.cookie)']: '1' }` render as
`<el x onmouseover=alert(document.cookie)="1">` — a live event handler. The
boolean-true form (`{ ['y onclick=alert(1)']: true }` → `<el y onclick=alert(1)>`)
was an even cleaner breakout.

`toAttrName` now validates the resolved name against the breakout-char set
(whitespace, `/ > = < " '`, control chars) and DROPS the attribute (with a dev
warning) when it is unsafe — matching React/Preact, and the client `setAttribute`
which already throws on such names. Valid `data-*` / `aria-*` / camelCase / SVG
(`xlink:href`) names are unaffected. Covers the runtime prop loop, the `h()` path,
and the compiler's `_ssrAttr` fast path (all route through `renderProp`).
