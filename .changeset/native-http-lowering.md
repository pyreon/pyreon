---
'@pyreon/native-compiler': minor
'@pyreon/http': minor
---

PMTC now lowers `@pyreon/http`'s endpoint DSL onto the existing PyreonFetch machinery: a same-file `const api = createHttp({ baseUrl })` + `const getUser = api.endpoint('GET /users/:id')` lets `useFetch<T>(getUser({ params: { id: '1' } }))` resolve at compile time to a concrete templated URL + method, emitting identically to `useFetch<T>('/api/users/1', { method: 'GET' })` on both targets. Literal params only — reactive params, a computed baseUrl, and the `.query()` fetcher form warn and stay web. No new emit/IR/stub; `createHttp`/`.endpoint` are metadata and emit nothing. `@pyreon/http`'s manifest declares the `nativeFrontend` (partial crossing).
