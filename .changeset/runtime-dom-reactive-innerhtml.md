---
"@pyreon/runtime-dom": patch
---

fix(runtime-dom): make `innerHTML` and `dangerouslySetInnerHTML` reactive

The JSX compiler wraps prop expressions containing signal reads in
`_bind`-style `() => …` accessors. The runtime's `applyProp` checked for
the `innerHTML` / `dangerouslySetInnerHTML` keys BEFORE checking if the
value was a function, so the closure was stringified and set as literal
text — `innerHTML={getIcon(props.x ? "moon" : "sun")}` rendered the
literal text `() => getIcon(props.x ? "moon" : "sun")` in the DOM
instead of the SVG.

Fix: when `value` is a function, wrap in `renderEffect` so the accessor
is called and the result is set as HTML on each tracked-signal change.
Same treatment for `dangerouslySetInnerHTML` (function returns
`{ __html: string }`).

Found via bokisch.com `/resume` route — the symptom was literal closure
text in icon SVG slots, plus a render loop that consumed several GB of
RAM (the closure-as-string DOM mutation triggered re-evaluations).

2 new regression tests in `packages/core/runtime-dom/src/tests/props.test.ts`.
