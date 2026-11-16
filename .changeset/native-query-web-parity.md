---
'@pyreon/query': minor
'@pyreon/http': minor
'@pyreon/hooks': patch
'@pyreon/feature': patch
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`@pyreon/query`, `@pyreon/http` and `useFetch` now behave as the web does on iOS and Android, identically on both:

- A non-2xx answer rejects with the web's error. Every lowered `@pyreon/http` endpoint request (`useFetch`, `useQuery`, `useMutation`, an awaited or fired call) runs through the client's `throwHttpErrors` check, a new outermost `PyreonHttpMiddleware` layer (`.throwHttpErrors` / `ThrowHttpErrors`), so `error.message` is `[Pyreon] <METHOD> <url> — HTTP <status>` with the URL redacted, named `ClientError` / `ServerError` / `HttpError`. `useFetch(url)` rejects with `[Pyreon] useFetch <url>: HTTP <status>`; its plain GET now goes through `PyreonHttp` on both targets (it used to read any status as data on iOS). `PyreonHttpMessageError` gains `name`, and `PyreonHttpResponse` gains `httpError(method:url:)`, `fetchError(url:)` and `isNoContent`. An awaited endpoint call or a mutation on a client with `use: [...]` middleware now lowers instead of staying web.
- An answer without JSON follows the web path by path. On an endpoint `useQuery`, and on `@pyreon/feature`'s `useList` / `useById`, a 204 FAILS the query with TanStack's `<queryHash> data is undefined` (`PyreonQueryDataUndefined`), the hash emitted from the web key. On `useFetch(endpoint(…))` it settles with no data (`PyreonFetch.resolveEmpty()`), and on a `useMutation` over an endpoint it succeeds with none (204 / 205 / 304 / empty body, as `.json()` resolves `undefined`).
- `useQueryClient()` lowers: `qc.invalidateQueries({ queryKey, exact })`, the filterless `invalidateQueries()`, and `useMutation({ invalidates: [...] })` invalidate through `PyreonQueryCache` (new `invalidateQueries(_:exact:)` and `invalidateAllQueries()`) with the web's prefix semantics over the colon-joined native key. A key part the join cannot hold, another filter, and every other client method are refused by name; so is the wait for the refetches that an awaited or returned invalidation has on the web.
- `q.error()?.message` on a `useQuery` now lowers to the error's message on both targets.
