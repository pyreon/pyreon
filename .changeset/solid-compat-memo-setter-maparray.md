---
'@pyreon/solid-compat': minor
---

`createMemo`, signal setters and `mapArray` now behave like Solid.

- `createMemo` is eager: it runs when created and on every dependency change, so a `(prev) => next` memo sees every intermediate value. It used to run lazily on first read, skipping the changes in between.
- A signal setter returns the new value (`setCount(c => c + 1)` returns the incremented count). It used to return `undefined`. `Setter<T>` is now typed to return `T`.
- `mapArray` maps each item once, by reference, and reuses the result while the item stays in the list (only its index accessor changes). Each mapping runs in its own root, which is disposed when the item leaves. It used to re-run the mapping function for every item on every change and never dispose what it created.

The docs no longer say solid-compat has no `createStore`; it ships Solid's store API.
