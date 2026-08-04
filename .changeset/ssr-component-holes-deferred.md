---
'@pyreon/runtime-server': patch
'@pyreon/compiler': patch
---

SSR fast path: a DOM wrapper holding a COMPONENT child now compiles to `_ssr(...)`

Until now any element with a component child was declined outright, so
`<main class="page"><Header /><Content /></main>` — the shape of essentially
every layout wrapper in a real app — emitted zero `_ssr` and fell back to the
h() tree walk. Component children now become holes, and the wrapper templates.

The mechanism is the interesting part. An `_ssr(...)` hole is an ordinary
function argument, so it is evaluated at the CALL SITE. That matches h() for a
hole that reads a value, but not for one that RENDERS a component: rendering has
context side effects, and h() defers it. So the compiler wraps the whole call in
`_ssrDeferred(() => _ssr(...))`, and `renderNode` / `streamNode` invoke the thunk
exactly where they would have rendered the equivalent vnode. Deferring the CALL
rather than the individual hole is what makes it compose — a nested `_ssr`
collapses into its parent's call and rides inside the same thunk, so no laziness
has to propagate through the concat helpers.

A previous attempt emitted the hole eagerly. It passed every unit gate and still
broke 26 ui-showcase specs, because every one of those gates rendered the node at
top level — the single position where call site and render position coincide.
The regression tests added here cover the whole position space instead.
