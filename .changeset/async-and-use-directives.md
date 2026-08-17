---
'@pyreon/core': minor
---

Add `<Async>` and `use()` — two primitives that remove the two most-repeated shapes in Pyreon app code.

**`<Async>`** renders one of pending / error / empty / data from any async-shaped source, replacing the hand-written guard chain at every data boundary (38 such chains across the repo's own example apps). The `of` prop is structural rather than a dependency — anything exposing `isPending` / `isError` / `error` / `data` accessors satisfies `AsyncLike<T>`, so `@pyreon/query` results, `@pyreon/http` resources and hand-rolled sources all work without `@pyreon/core` importing any of them.

Two deliberate semantics, both regression-locked:

- **There is no rethrowing default for errors.** An error thrown from a reactive re-run is NOT caught by `<ErrorBoundary>` — only a throw during the initial mount is — so rethrowing would escape unhandled on exactly the common case, a request that fails after mount. Omitting `error` renders nothing and warns once in development.
- **An empty array with no `empty` prop is passed to `children`**, so a list that renders its own empty state keeps working instead of silently vanishing. Only `null`/`undefined` renders nothing, because there is no value to hand to `children`.

**`use()`** composes element behaviours into a single ref. A `Directive` is a plain `(el) => cleanup | void`, so attaching N behaviours costs one attribute instead of a ref declaration, N hook calls and a ref attach. Nothing is special-cased by the compiler or renderer — `use()` returns an ordinary `RefCallback`, which the runtime already invokes with the element on mount and `null` on unmount. Cleanups run in reverse attach order; falsy entries are skipped so a directive can be applied conditionally inline; and a re-attach without an intervening detach tears the previous registration down first, so listeners cannot pile up.
