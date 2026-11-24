---
'@pyreon/reactivity': minor
'@pyreon/mcp': patch
---

A new propagation core for `@pyreon/reactivity`, behind the same API. A write now only marks what may be stale; a read re-evaluates a computed only when a value it read really changed, resolving its dependencies bottom-up. Computeds, effects and render bindings are graph nodes with one small edge object per dependency, so they retain less memory: signal + computed 672 → 520 B and signal + effect 689 → 417 B (node, `NODE_ENV=production`), and a mounted 2,047-component tree 353.5 → 313.1 KB (Chromium). A signal is unchanged at 152 B.

A computed below one whose value did not change is no longer re-evaluated (before, every computed between an unchanged node and the effect above it evaluated once per write).

Changes you can observe:

- **`computed(fn, { equals })` is lazy, like every computed.** It used to re-evaluate on every dependency change even when nothing read it. It now evaluates only when read (directly or through something that depends on it). `equals` still decides whether a re-evaluated value counts as changed, and an unchanged value still stops everything below it. Code that relied on an `equals` computed's body running without a reader must read it, or use `effect()`.
- **Run order within one flush is depth-first subscription order.** An effect behind a computed can now run before an effect subscribed later to the signal itself; before, all directly subscribed effects ran first. Neither order is a contract.
- **`subscribe()` listeners run with the direct updaters, before the effects of the same write** (they ran after earlier-subscribed effects before).
- **An effect whose first run writes a signal it already read re-runs right after that first run**, still before `effect()` returns, instead of nested inside it.
- **Effects reached by a selection change run after the `createSelector` source effect**, not nested inside it.

Upgrade: nothing to change for documented API. Internal fields changed (`_s1`/`_s` → graph edges in `_subs`, `_dirty` → `_f`); code that read them (tests, devtools) must use `_hasSubscribers` or the public API.
