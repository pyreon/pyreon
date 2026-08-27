---
"@pyreon/reactivity": patch
---

perf: single Map lookup in the createStore proxy traps

The `createStore` proxy's `get` (non-own-property), `set`, and `deleteProperty`
traps did a `propSignals.has(key)` followed by `propSignals.get(key)` — two hashes
of the same key on the steady-state path. `getOrCreateSignal` in the same file
already collapsed this to a single `get`, with the documented invariant that makes
it safe: every stored entry is a real `Signal`, so `get(key) === undefined` is
unambiguous with "no entry". The traps just weren't given the same treatment.

Now one lookup each. The `set` trap fires on every `store.x = y` write and the
`get` non-own branch on every prototype-method read (`.map`/`.push` on a store
array), so this removes one hash-of-key per store mutation / array-method access
on the dominant path. Behavior-identical.
