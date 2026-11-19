---
"@pyreon/compiler": minor
---

The JSX inside a template hole now compiles. An expression child of a templated element that builds JSX (`{items.map((x) => <li/>)}`, `{cond() ? <a/> : <b/>}`, `{() => …}`) used to be sliced into the template's bind as source text, so every element in it became a runtime `jsx()` call; it is now walked, so those elements become templates of their own. The example apps compile to 269 fewer element `jsx()` calls (616 → 347), the library packages to 147 fewer (292 → 145). The SSR emit walks the same holes, so the server brackets the nested templates' placeholders and hydration adopts them.

Behaviour change: a signal read inside a `.map` item (or a conditional arm) now updates that element in place through its own binding, instead of re-running the whole list and re-creating every row; a component inside one now receives reactive props and is not re-created when they change. A component that destructures its props therefore stops refreshing on a re-render it no longer gets — read `props.x` instead, as everywhere else.

Holes in SVG or MathML content are not turned into templates (an element built there would be a template root namespaced by its own tag alone); they are walked with their elements left as `jsx()` calls, which mount in the parent's namespace.

Also fixed: the `_ssr` `.map` and `<For>` item builders auto-called a callback parameter that shadowed a signal (`x()` on a number item — a server crash) and inlined a prop-derived alias the parameter shadowed; and the native backend registered an optional call's callback parameter (`rows()?.map((r) => …)`) as reactive props, wrapping its reads.
