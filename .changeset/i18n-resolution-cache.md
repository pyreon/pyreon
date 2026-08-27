---
"@pyreon/i18n": patch
---

perf: memoize key resolution in `t()` (resolution cache)

`t()` called `lookupKey` per key AND per plural/context candidate, and each call
ran `resolveKey` — a fresh `keyPath.split('.')` array plus a per-segment dict
walk. A page that re-renders the same translated strings (the dominant real-app
shape) paid the full split+walk on every render, and most candidate probes
(`key_one`, `key_other`, …) miss and re-walk every time.

`lookupKey` now consults a resolution cache keyed by `(locale, namespace,
keyPath)` → resolved string (or `null` for a cached miss). The result is a pure
function of the messages, so the cache is cleared at the two mutation points
(`addMessages`, `loadNamespace`). Repeated lookups become O(1); the `i18n.lookupKey`
counter now fires per resolution (it plateaus as the cache warms while `i18n.t`
keeps growing — exactly the divergence the code comment anticipated). Bounded to
2000 entries (leak-class C). Empirically motivated: the perf-harness counter sweep
showed `i18n.lookupKey` at 1:1 with `i18n.t` (every `t()` re-resolved).

Bisect-verified: removing the cache-clear makes a previously-missing key stay
stale after `addMessages`, and an overridden key return its old value.
