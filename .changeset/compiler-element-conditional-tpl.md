---
'@pyreon/compiler': patch
---

Element-conditional children now keep the `_tpl` cloneNode fast path.

A DOM element wrapping an inline element-conditional —
`<div class="card">{() => open() ? <Panel/> : <Empty/>}</div>`,
`<section>{n() > 0 && <List/>}</section>`, or a `.map(x => <li/>)` child —
previously bailed the whole wrapper to the jsx runtime (`h()`/`jsx()`).

The compiler now templatizes the wrapper (`_tpl("<div class=\"card\"><!></div>", …)`)
and routes the conditional child through `_mountSlot` + a `<!>` placeholder —
the same path `.map`-returning children and element-valued-`const` children
already take. The conditional child's own reactive boundary (`mountReactive`)
is unchanged, so behaviour is identical; only the wrapper gains the cloneNode
fast path. Inner JSX inside the conditional stays raw (compiled downstream by
esbuild to `h()`), consistent with how all expression-nested JSX is handled.

A DIRECT static JSX child (`<div>{<span/>}</div>`) is unaffected — it keeps its
static-hoist path. Fixed byte-identically in both backends (JS + Rust native;
locked by the cross-backend equivalence suite), with end-to-end runtime specs
(reactive swap + disposal) in `@pyreon/runtime-dom`.
