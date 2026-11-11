---
'@pyreon/solid-compat': minor
---

`setStore` now follows Solid's merge and replace rules.

- `setStore('user', { name: 'b' })` shallow-merges into `user`, as in Solid. It used to replace `user`, silently dropping every field the update did not name. Filter-predicate paths merge the same way. Arrays and primitives are still replaced.
- `setStore({ a: 1 })` merges into the root, and `setStore(s => ({ a: s.a + 1 }))` merges what the function returns. Both used to do nothing.
- `setStore(produce(fn))` at the root now applies (it was a no-op), and `produce` / `reconcile` replace rather than merge, so a key deleted inside `produce` stays deleted.

Breaking for code that relied on a path write replacing an object: write the whole object with `reconcile(value)` instead.
