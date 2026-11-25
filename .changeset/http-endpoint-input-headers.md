---
'@pyreon/http': patch
---

`EndpointInput` lists `headers` and `cookies`; before, they were call options only. This fixes a type error on an endpoint whose declared input is only typed headers or cookies, such as `api.endpoint<S, V, { headers: { 'x-api-key': string } }>(…)`. That is what `@pyreon/lathe` generates for an operation whose one parameter is a required header, and it used to fail with "has no properties in common with type `EndpointInput`".
