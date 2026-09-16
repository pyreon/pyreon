---
'@pyreon/runtime-server': patch
'@pyreon/runtime-dom': patch
'@pyreon/core': patch
'@pyreon/head': patch
'@pyreon/compiler': patch
---

Refuse event-handler attributes on every render path, not just one

An inline `onclick="…"` is executable markup, and the refusal added in #3432
reached exactly one of the sinks a prop can travel through. Verified executing in
real Chromium, three did not refuse it: the `h()` path wrote it on any SVG /
MathML element (its foreign-namespace branch returns before the later checks),
the compiled template sink (`_setAttr`) wrote it on plain HTML too — and CALLED a
function-valued one to build the string — and the compiled SSR sink
(`_ssrAttrGen`) serialized it, because the compiler's own `on*` bail is
camelCase-only.

The name set was HTML-only as well: enumerating the `on*` IDL handlers a shipping
browser exposes on the HTML, SVG and Window prototypes found 36 missing,
including SVG's SMIL handlers (`onbegin` / `onend` / `onrepeat`) and the
vendor-legacy names browsers still compile (`onmousewheel`, `onwebkit*`,
`onbeforecopy`, `onsearch`). The set is now a vocabulary union and is ratcheted
against a real browser so a new handler reds a gate instead of becoming a sink.

`@pyreon/head` had no attribute guard at all, in either of its renderers: an
attribute NAME went out raw, so a user-keyed object could inject sibling
attributes (`{ 'name x="y" onload': 'z' }` serialized as
`<meta name x="y" onload="z">`), and `javascript:` URLs on `<link href>` /
`<script src>` were emitted verbatim. Head now runs the same guards the element
renderer already ran, sharing the predicates rather than re-deriving them.

Scripted-SVG detection in `data:image/svg+xml` URIs required whitespace before an
`on*=` handler; a slash separator, a comment-looking one, and no separator at all
(the closing quote of the previous attribute) each produced a live handler and
were allowed.

The documented camelCase props (`onClick`) are unaffected, and attributes that
merely start with "on" (`once`, `onyx`, `only`) still render.
