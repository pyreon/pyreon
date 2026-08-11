---
'@pyreon/http': patch
---

Per-request hot path made ~37% faster (measured — the new `bench:http` head-to-head vs ky/ofetch/redaxios/axios now shows fastest-or-tied on every row; the headline `GET → decoded JSON` flipped from an outright loss to ofetch into a 1.4× win):

- Static header sources are folded once (lazily, at first request) and cloned per request via one native `new Headers(folded)` instead of re-merging every source through intermediate `Headers` allocations (~360ns/request). Sources from the first function source onward stay dynamic, so accessor headers (rotating tokens) still re-evaluate per request and later sources still override earlier keys. Behavior note: mutating a plain static headers OBJECT after client creation is no longer picked up by later requests — that was never the documented dynamic mechanism; use the function-source form (`headers: () => ({...})`), which is unchanged.
- `HttpResponsePromise` is now a prototype-based thenable class instead of `Object.assign`ing decoders onto the live promise (a measured ~260ns/request shape-transition penalty). `await`, `.then`/`.catch`/`.finally` chaining, and `Promise.all` behave identically; the one observable difference is `p instanceof Promise` → `false` (never part of the documented contract — the contract is the `HttpResponsePromise` interface, and `.then()` still returns a real native promise).
- The no-signal/no-timeout request path reuses one frozen linked-signal constant, and the no-meta case allocates a bare `{}` instead of double-spreading empty objects.
