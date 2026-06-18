---
'@pyreon/compiler': patch
---

Fix `dangerouslySetInnerHTML` in the compiled template fast path. When an
element carrying a reactive/forwarded `dangerouslySetInnerHTML` (e.g.
`<div dangerouslySetInnerHTML={props.html} />`) was template-ized into a
`_tpl()` (any multi-element static tree), the binding was emitted as a generic
`el.setAttribute("dangerouslySetInnerHTML", value)` — stringifying the
`{ __html }` object to `dangerouslysetinnerhtml="[object Object]"` and leaving
the element EMPTY. SSR rendered the content correctly, so it "blinked" then
vanished the instant the client rendered the template (visible on any SSG/SSR
page with a Shiki code block, `@pyreon/zero-content` docs, etc.). Both the JS
and Rust backends now mirror the runtime `applyStaticProp`:
`el.innerHTML = value.__html`. (`class`/`style` were already special-cased; this
extends the same fix to `dangerouslySetInnerHTML`.)
