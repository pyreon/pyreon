---
'@pyreon/http': minor
---

`endpoint.query(args, { key })`: `key` receives the endpoint's cache key and returns the one to cache under, for example `(base) => [...base, { tenant }]` when headers or the caller change the result. Start from `base`, so invalidating the endpoint still matches. A loader that prefetches with the same `key` hits the hook's cache. The new type is `EndpointQueryOptions`.

`EndpointInput` lists `headers` and `cookies`; before, they were call options only. This fixes a type error on an endpoint whose declared input is only typed headers or cookies, such as `api.endpoint<S, V, { headers: { 'x-api-key': string } }>(…)`. That is what `@pyreon/lathe` generates for an operation whose one parameter is a required header, and it used to fail with "has no properties in common with type `EndpointInput`".
