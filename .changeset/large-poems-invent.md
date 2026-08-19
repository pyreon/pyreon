---
'@pyreon/reactivity': minor
---

`computed(fn)` now gates on value by default, without giving up laziness

A computed whose recomputed value is `Object.is`-equal to its previous value no
longer notifies downstream. This matches Solid's `createMemo`, Vue's `computed`
and Svelte's `$derived`, and closes the one place Pyreon diverged from every
peer: an effect re-running on an identical derived value.

Crucially this does NOT make computeds eager. The dirty cascade stays flag-only
until it reaches a RUNNER (an effect notify, a raw listener, a `direct()`
updater), at which point the computed immediately above books a tier-1 refresh
whose gate decides whether that runner fires. So a computed with no live
consumer still evaluates zero times across any number of dependency writes,
while one behind N consumers evaluates once and runs none of them on a blocked
write. The evaluation is not extra work — the runner was going to pull that
value during the drain anyway.

An explicit `{ equals }` keeps its existing eager semantics deliberately: it is
a statement about WHERE the gate belongs, typically a cheap identity-preserving
lookup placed above a consumer that rebuilds a fresh object and so could never
gate on its own. Nothing about explicit-`equals` behaviour changes.

BREAKING for anyone relying on a computed notifying on every dependency change
regardless of value. A derivation that returns a fresh object or array each run
is unaffected (a new reference is never `Object.is`-equal). A derivation
returning a scalar that repeats will now stop propagating — which is the intent.
