# @pyreon/http

## 0.52.0

### Minor Changes

- PMTC now lowers `@pyreon/http`'s endpoint DSL onto the existing PyreonFetch machinery: a same-file `const api = createHttp({ baseUrl })` + `const getUser = api.endpoint('GET /users/:id')` lets `useFetch<T>(getUser({ params: { id: '1' } }))` resolve at compile time to a concrete templated URL + method, emitting identically to `useFetch<T>('/api/users/1', { method: 'GET' })` on both targets. Literal params only — reactive params, a computed baseUrl, and the `.query()` fetcher form warn and stay web. No new emit/IR/stub; `createHttp`/`.endpoint` are metadata and emit nothing. `@pyreon/http`'s manifest declares the `nativeFrontend` (partial crossing). (d873013)

### Patch Changes

- Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration). (1d74edc)
- Per-request hot path made ~37% faster (measured — the new `bench:http` head-to-head vs ky/ofetch/redaxios/axios now shows fastest-or-tied on every row; the headline `GET → decoded JSON` flipped from an outright loss to ofetch into a 1.4× win): (0f18357)

  - Static header sources are folded once (lazily, at first request) and cloned per request via one native `new Headers(folded)` instead of re-merging every source through intermediate `Headers` allocations (~360ns/request). Sources from the first function source onward stay dynamic, so accessor headers (rotating tokens) still re-evaluate per request and later sources still override earlier keys. Behavior note: mutating a plain static headers OBJECT after client creation is no longer picked up by later requests — that was never the documented dynamic mechanism; use the function-source form (`headers: () => ({...})`), which is unchanged.
  - `HttpResponsePromise` is now a prototype-based thenable class instead of `Object.assign`ing decoders onto the live promise (a measured ~260ns/request shape-transition penalty). `await`, `.then`/`.catch`/`.finally` chaining, and `Promise.all` behave identically; the one observable difference is `p instanceof Promise` → `false` (never part of the documented contract — the contract is the `HttpResponsePromise` interface, and `.then()` still returns a real native promise).
  - The no-signal/no-timeout request path reuses one frozen linked-signal constant, and the no-meta case allocates a bare `{}` instead of double-spreading empty objects.

- Updated dependencies:
  - @pyreon/validation@0.52.0

## 0.51.0

### Minor Changes

- New `@pyreon/http` package — the transport layer beneath `@pyreon/query`. (663ac5a)

  It owns how a request is made (URL building, path params, query encoding, headers, body, cancellation, typed errors, optional response validation) and deliberately owns no cache, no dedup-by-key and no reactive container, because `@pyreon/query`, `useFetch` and `createResource` already do. That split mirrors the one the native runtime already made, where `PyreonFetch` is the reactive result container and `PyreonHttp` the request/response layer beneath it.

  The core has zero dependencies. Each capability lives behind its own entry so an unused one costs nothing: `@pyreon/http/middleware` (`retry`, `dedupe`, `bearer`, `refresh`, `logger`, `forwardHeaders`), `@pyreon/http/schema` (Standard Schema validation), `@pyreon/http/query` (TanStack adapters), `@pyreon/http/mock` (network-free mocking) and `@pyreon/http/server` (per-request SSR context, the only `node:async_hooks` import).

  Middleware is onion-shaped — `(request, next) => response` — because that is the only form in which retry, auth-refresh and short-circuiting are ordinary middleware; an axios-style interceptor pair cannot re-enter the chain. Clients are immutable: `extend()` returns a new instance, so no mutable shared default can leak across concurrent SSR requests. Response validation is three tiers, and only the third costs a dependency: an unchecked cast, any `(raw: unknown) => T` parse function, or any Standard Schema (zod, valibot, arktype, `@pyreon/validate`'s `s`, and `@pyreon/validation`'s typed adapters). `endpoint('GET /users/:id', { response })` derives the callable, a stable cache key and the response type from one declaration, so `queryKey` and URL cannot drift; `.query()` forwards TanStack's `AbortSignal`.

  Defaults are chosen against real failure modes: a 30s timeout is ON because `fetch` has none and a hung request otherwise never settles, while retry is OFF because it compounds with query's own retry into nine requests per logical query.

  `@pyreon/lint` gains three opt-in, dependency-gated rules and a new `http` category: `pyreon/query-fn-must-forward-signal` (a `queryFn` that performs a request but drops the `AbortSignal`, which silently disables cancellation), `pyreon/no-unencoded-path-interpolation` (interpolating into a path skips URL encoding, so a value containing `/` escapes its segment) and `pyreon/no-untimed-raw-fetch` (a raw `fetch` with no signal has no deadline).

### Patch Changes

- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- Updated dependencies:
  - @pyreon/validation@0.51.0
