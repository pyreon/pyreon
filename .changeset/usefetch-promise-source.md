---
'@pyreon/hooks': minor
---

`useFetch` accepts a promise source, so the documented multiplatform shape works on the web

`@pyreon/native-compiler` documents `useFetch<T>(getUser({ params: { id: '1' } }))`
as the crossing surface for `@pyreon/http` — it lowers to a native fetch of the
templated URL, and the coverage registry lists it by name.

An `@pyreon/http` endpoint CALL fires the request and returns a promise, while
this hook took `url: string`. So on the web the documented shape did
`fetch(String(promise))` — a request for the literal `[object Promise]`, which
Chromium rejects with `InvalidStateError: Unknown request object` — and the
endpoint's own rejection went unhandled, surfacing as an uncaught page error on
every failed request.

`useFetch` now adopts a promise source: the value lands in `data()`, a rejection
lands in `error()`, and both settle in one batch like the URL path.
`refetch()` warns rather than silently doing nothing, because a settled promise
cannot be re-issued and the hook never held the URL that produced it.
