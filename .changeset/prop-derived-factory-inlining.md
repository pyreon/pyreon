---
'@pyreon/compiler': patch
---

Stop re-invoking a hook / factory call at every JSX use site

The prop-derived inlining pass exists to keep `const a = props.x + 1` reactive: it splices the initializer back in at each JSX use site so every binding re-reads the props getter. That is sound for a pure expression and catastrophic for a stateful factory. `const state = useSearch(opts)` compiled to `useSearch({…}).open()` inside every `_bind` / `_mountSlot`, so each binding observed its OWN freshly-minted instance while the component's event handlers mutated the one the body created. Nothing updated, nothing threw, and no unit test could see it.

The guard was `STATEFUL_CALLS`, a hand-maintained list of 15 names — that is, a list of "things that must not be inlined", which is a silent-hole generator: every factory nobody thought to add was re-invoked per use site. It is now backed by the `useX` / `createX` naming convention (identifier and member callees alike), so a hook or factory is covered by construction, and the explicit list only carries the names that do not match it (`signal`, `computed`, `effect`, `batch`, `defineStore`).

This shipped twice. `@pyreon/atlas`'s `createModel` was worked around per-site by declaring the binding `let` — the inliner ignores `let` — which is folklore the next author cannot be expected to know, and `@pyreon/loom`'s Observatory duly wrote `const` and inherited the same dead UI (measured: 29 model instances where 1 was intended). `@pyreon/zero-content`'s `useSearch` did the same and left the pyreon.dev search overlay dead on every page: Cmd+K toggled a signal no binding was subscribed to.

Scope: this widens only the NON-inlining decision. A call to an unrecognised callee (`cx(props.a)`, `formatDate(props.d)`) is still inlined and therefore still reactive — narrowing that would trade a silent state bug for a silent staleness bug. Both backends emit byte-identically (locked by the native-equivalence oracle). `@pyreon/atlas`'s `let` workaround is reverted to `const`, so the atlas-workshop e2e is now a live regression test of this fix.
