---
'@pyreon/router': patch
---

Harden `parseQuery` / `parseQueryMulti` against the downstream prototype-pollution hop: dangerous keys (`__proto__`, `constructor`, `prototype`) are now DROPPED at the parse boundary instead of stored as own properties of the null-prototype record. The null prototype protected the record itself, but an own `__proto__` data property still escaped into consumer objects — `Object.assign(target, query)` (or any `target[k] = query[k]` copy loop) uses [[Set]] semantics, mutating the target's prototype one hop downstream. This is the standard `qs`/`query-string` convention; a genuine query param by these names has no legitimate use. Also closes CodeQL `js/remote-property-injection` (#275/#276) at the source.
