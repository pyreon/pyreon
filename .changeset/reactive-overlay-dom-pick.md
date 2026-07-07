---
"@pyreon/runtime-dom": minor
---

Add an **Inspect (DOM→signal) picker** to the reactive dev overlay, and a new
`nodesForElement(el)` primitive. Press **🎯 Pick** (or `$p.pick()`), click any
element, and the overlay shows the signals whose values that element's text
displays — plus each one's causal chain. Point at the wrong pixel, get the
signal responsible (the on-screen inverse of "why did this render?").

The correlation is **exact, not a heuristic**: `_bindText`'s fast path tags the
text node with its source signal's graph-node id at bind time (a dev-only
`WeakMap`, tree-shaken in production), and `nodesForElement` — exported from
`@pyreon/runtime-dom` and on `__PYREON_DEVTOOLS__.reactive` — TreeWalks an
element's tagged descendant text nodes. Scope: text bindings (the dominant
"displayed value" case); attribute/class/multi-signal bindings aren't
correlated (their owner element isn't in scope at bind time). Returns `[]` in
production.

Also fixes a real bug this surfaced: **`hydrateRoot` now installs the devtools
hook** like `mount()` already did. Previously it did not, so the reactive dev
overlay (and `window.__PYREON_DEVTOOLS__`) silently didn't exist in SSR/hydrated
apps — i.e. most real Pyreon apps.
