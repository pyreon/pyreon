---
'@pyreon/http': minor
'@pyreon/lint': minor
---

New `@pyreon/http` package — the transport layer beneath `@pyreon/query`.

It owns how a request is made (URL building, path params, query encoding, headers, body, cancellation, typed errors, optional response validation) and deliberately owns no cache, no dedup-by-key and no reactive container, because `@pyreon/query`, `useFetch` and `createResource` already do. That split mirrors the one the native runtime already made, where `PyreonFetch` is the reactive result container and `PyreonHttp` the request/response layer beneath it.

The core has zero dependencies. Each capability lives behind its own entry so an unused one costs nothing: `@pyreon/http/middleware` (`retry`, `dedupe`, `bearer`, `refresh`, `logger`, `forwardHeaders`), `@pyreon/http/schema` (Standard Schema validation), `@pyreon/http/query` (TanStack adapters), `@pyreon/http/mock` (network-free mocking) and `@pyreon/http/server` (per-request SSR context, the only `node:async_hooks` import).

Middleware is onion-shaped — `(request, next) => response` — because that is the only form in which retry, auth-refresh and short-circuiting are ordinary middleware; an axios-style interceptor pair cannot re-enter the chain. Clients are immutable: `extend()` returns a new instance, so no mutable shared default can leak across concurrent SSR requests. Response validation is three tiers, and only the third costs a dependency: an unchecked cast, any `(raw: unknown) => T` parse function, or any Standard Schema (zod, valibot, arktype, `@pyreon/validate`'s `s`, and `@pyreon/validation`'s typed adapters). `endpoint('GET /users/:id', { response })` derives the callable, a stable cache key and the response type from one declaration, so `queryKey` and URL cannot drift; `.query()` forwards TanStack's `AbortSignal`.

Defaults are chosen against real failure modes: a 30s timeout is ON because `fetch` has none and a hung request otherwise never settles, while retry is OFF because it compounds with query's own retry into nine requests per logical query.

`@pyreon/lint` gains three opt-in, dependency-gated rules and a new `http` category: `pyreon/query-fn-must-forward-signal` (a `queryFn` that performs a request but drops the `AbortSignal`, which silently disables cancellation), `pyreon/no-unencoded-path-interpolation` (interpolating into a path skips URL encoding, so a value containing `/` escapes its segment) and `pyreon/no-untimed-raw-fetch` (a raw `fetch` with no signal has no deadline).
