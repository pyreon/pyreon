---
'@pyreon/rocketstyle': patch
---

`Theme<T>` now actually uses its type argument.

It was written `T extends unknown ? ThemeDefault : Merge<[ThemeDefault, T]>`. Every type extends `unknown` — it is the top type — so the conditional was degenerate: always the true branch, `Theme<T>` collapsed to the empty `ThemeDefault`, and the generic was silently discarded for every caller. The check is now `unknown extends T`, which means what was intended: no type argument → the augmentable `ThemeDefault`; a concrete `T` → that shape merged over it.

This is why passing a theme type never typed a `.theme()` callback's `t`, and why consumers reached for a global `declare module '@pyreon/rocketstyle'` augmentation — which merges into *every* other consumer's `t` and makes their tokens claim properties that are `undefined` at runtime — or cast at each call site. Widening only accepts more, so no existing call site changes (verified: rocketstyle, elements, ui-components, coolgrid and atlas all typecheck unchanged).
