---
title: "HTTP Client — API Reference"
description: "Transport layer under @pyreon/query — onion middleware, typed errors, optional schema validation"
---

# @pyreon/http — API Reference

> **Generated** from `http`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [http](/docs/http).

The request/response layer beneath @pyreon/query. It owns how a request is made — URL building, headers, body encoding, cancellation, typed errors and optional response validation — and deliberately owns no cache, no dedup-by-key and no reactive container, because those already have owners. Mirrors the split the native runtime already made, where PyreonFetch is the reactive result container and PyreonHttp is the request/response layer beneath it. The core has zero dependencies; retry, schema validation, TanStack adapters, mocking and SSR each live behind their own entry so an unused one costs nothing.

> **Peer dependencies:** `@pyreon/validation` — install alongside this package.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

universal web/node HTTP client (WHATWG fetch); the transport (middleware, interceptors, streaming) stays web — native networking is the PyreonFetch/PyreonHttp runtime layer

**What crosses natively:** same-file endpoint calls resolve to PyreonFetch/PyreonQuery — `useFetch<T>(getUser({ params: { id: '1' } }))` lowers to a native fetch of the templated URL from `createHttp({ baseUrl })` + `api.endpoint('GET /users/:id')`, and `useQuery<T>(() => getUser.query({ params: { id: '1' } }))` lowers to a cached PyreonQuery (literal params only; reactive params and a computed baseUrl stay web)

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- Onion middleware `(req, next) => res` — retry, auth-refresh and short-circuit are ordinary middleware, which axios interceptor arrays structurally cannot express
- Immutable clients: `extend()` returns a new instance, so no shared mutable defaults can leak across concurrent SSR requests
- Three validation tiers — unchecked cast, any parse function, or any Standard Schema (zod / valibot / arktype / `s` / @pyreon/validation adapters)
- Endpoints derive the call, the cache key and the response type from one declaration, so queryKey and URL cannot drift
- Typed error hierarchy where AbortError stays distinct from a real failure
- Timeout ON by default — `fetch` has none, so a hung request otherwise never settles
- Per-request SSR context via AsyncLocalStorage, so concurrent renders never cross cookies
- Network-free mocking: middleware short-circuits, so tests need no MSW and no global fetch patch

## Complete example

A full, end-to-end usage of the package:

```tsx
import { createHttp } from '@pyreon/http'
import { bearer, retry } from '@pyreon/http/middleware'
import { standardSchema } from '@pyreon/http/schema'
import { z } from 'zod'

const UserSchema = z.object({ id: z.string(), name: z.string() })

export const api = createHttp({
  baseUrl: '/api',
  schema: standardSchema,
  use: [bearer(() => 'token'), retry({ limit: 2 })],
})

export const listUsers = api.endpoint('GET /users', { response: z.array(UserSchema) })
export const getUser = api.endpoint('GET /users/:id', { response: UserSchema })

const user = await getUser({ params: { id: '1' } })
console.log(user.name)
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`createHttp`](#createhttp) | function | Create an HTTP client. |
| [`HttpClient`](#httpclient) | type | A configured client. |
| [`endpoint`](#endpoint) | function | Declare a reusable endpoint. |
| [`HttpMiddleware`](#httpmiddleware) | type | Onion middleware, chosen over axios-style interceptor arrays because it is the only shape that expresses what people act |
| [`retry`](#retry) | function | Replay a failed request. |
| [`standardSchema`](#standardschema) | constant | The resolver that enables schema objects in `.json(schema)` and `endpoint({ response })`. |
| [`runWithRequest`](#runwithrequest) | function | Establish the per-request SSR context, from `@pyreon/http/server`. |
| [`RequestError`](#requesterror) | class | The common base of every error this package throws — `catch (e) { if (e instanceof RequestError) … }` covers the whole f |
| [`buildUrl`](#buildurl) | function | The full URL-resolution pipeline `createHttp`/`endpoint` build every request URL through: `applyPathParams` (substitutes |
| [`compose`](#compose) | function | Fold a middleware array (outermost first) over a transport into one callable — what `createHttp({ use })` does internall |
| [`createFetchTransport`](#createfetchtransport) | function | Build a `fetch`-backed `Transport`. |
| [`getAmbientRequest`](#getambientrequest) | function | Read the inbound request currently in scope — `undefined` in the browser, and `undefined` on any server that has not opt |
| [`defineEndpoint`](#defineendpoint) | function | The standalone form of `client.endpoint(spec, options)` — the method is a thin wrapper (`(spec, opts) =&gt; defineEndpoint( |
| [`createMock`](#createmock) | function | Stub responses as middleware, from `@pyreon/http/mock`. |

## API

### createHttp `function`

```ts
(config?: HttpClientConfig) => HttpClient
```

Create an HTTP client. Every option has a working default: a 30s timeout (because fetch has none and a hung request otherwise never settles), `same-origin` credentials, and throw-on-non-2xx (because @pyreon/query needs a rejected promise to enter its error state). Clients are IMMUTABLE — there is no `defaults` object to mutate, since a shared mutable default leaks across concurrent SSR requests. Derive variants with `extend()`, which accumulates headers and middleware while overriding scalars.

**Example**

```tsx
import { createHttp } from '@pyreon/http'

const api = createHttp({ baseUrl: '/api', timeout: 10_000 })
const user = await api.get('/users/:id', { params: { id: '1' } }).json()
```

**Common mistakes**

- Reaching for `api.defaults.headers.common.X = …` (axios muscle memory). It does not exist — mutable shared defaults are the classic SSR cross-request leak. Use `api.extend({ headers })`, which returns a NEW client.
- Passing `baseURL` (axios spelling). The option is `baseUrl`.
- Expecting `baseUrl` to behave like `new URL(path, base)`. It is a plain PREFIX, so a leading slash does NOT discard the base path.
- Passing both `json` and `body`. They are mutually exclusive — `json` serializes and sets Content-Type for you, and passing both throws rather than silently picking one.
- Interpolating into the path (`api.get(`/users/$&#123;id&#125;`)`). That skips URL encoding, so an id containing "/" escapes its segment. Use `{ params: { id } }`.
- Expecting retry by default. It is OFF, because it compounds with @pyreon/query’s own retry.

---

### HttpClient `type`

```ts
interface HttpClient { get/post/put/patch/delete/head/options(path, options?): HttpResponsePromise; request(method, path, options?); extend(config): HttpClient; endpoint(spec, options?): Endpoint }
```

A configured client. Each verb returns an HttpResponsePromise — awaitable for the response, or asked directly for a decoded body via `.json()` / `.text()` / `.blob()` / `.arrayBuffer()` / `.formData()` / `.void()`. The request fires eagerly, so `.json()` never re-issues it and two consumers of the same promise share one network call.

**Example**

```tsx
const res = await api.get('/users/1')       // HttpResponse (status, headers, raw)
const user = await api.get('/users/1').json() // decoded body
```

**Common mistakes**

- Calling `.json()` after already awaiting and reading the body — a Response body is single-use.
- Assuming `.json()` throws on an empty body. A 204/205/304 or an empty 200 resolves to `undefined`.

---

### endpoint `function`

```ts
(spec: `${HttpMethod} ${string}`, options?: { response?: Validator }) => Endpoint
```

Declare a reusable endpoint. One declaration yields the callable, a stable structural cache key, and the response type — which is what stops queryKey and URL from drifting apart, the single biggest pain with axios plus TanStack Query. `params` is REQUIRED by the type system exactly when the path declares `:placeholders`, and its keys are extracted from the path literal, so a typo is a compile error. `.query(args)` emits `{ queryKey, queryFn }` with the AbortSignal already forwarded; `.mutation()` emits `{ mutationFn, invalidates }`.

**Example**

```tsx
const getUser = api.endpoint('GET /users/:id', { response: UserSchema })

await getUser({ params: { id: '1' } })
const options = getUser.query({ params: { id: '1' } })
console.log(options.queryKey)
```

**Common mistakes**

- Hand-writing a `queryKey` next to an endpoint call. Use `endpoint.query(...)` so the key is derived from the same declaration as the URL.
- Expecting `mutationFn` to receive an AbortSignal. TanStack gives mutations no context at all — pass one in the variables if the mutation must be cancellable.
- Writing the spec without a method (`"/users"`). It must be `"<METHOD> <path>"`.
- Assuming `invalidates` takes strings. It takes ENDPOINTS, and resolves each to its key prefix.

---

### HttpMiddleware `type`

```ts
(request: HttpRequest, next: Next) => Promise<HttpResponse>
```

Onion middleware, chosen over axios-style interceptor arrays because it is the only shape that expresses what people actually need: retry calls `next()` in a LOOP (an interceptor pair cannot re-enter the chain, which is why axios users end up hanging `config.__isRetry` flags off the request), refresh inspects the response and re-issues, and a mock or cache returns WITHOUT calling `next`. Order is lexical — the `use: [...]` array — so there is no registration registry and no eject handle to leak.

**Example**

```tsx
const logger: HttpMiddleware = async (request, next) => {
  const started = Date.now()
  const response = await next(request)
  console.warn(request.method, request.url, Date.now() - started)
  return response
}
```

**Common mistakes**

- Forgetting to return the response from `next()`. The chain resolves to whatever each middleware returns.
- Assuming `next()` may only be called once. Calling it repeatedly is exactly what makes retry possible.
- Mutating `request.headers` expecting it to affect an already-issued attempt — mutate before calling `next()`.

---

### retry `function`

```ts
(options?: RetryOptions) => HttpMiddleware
```

Replay a failed request. OFF unless you add it, because @pyreon/query already retries and the two compound silently. Retries idempotent methods only (POST is excluded), on 408/413/429/5xx plus transport failures, with exponential backoff, full jitter and `Retry-After` support. Never replays a cancellation, and stops replaying the moment the caller aborts — including mid-backoff.

**Example**

```tsx
const api = createHttp({ use: [retry({ limit: 3 })] })
```

**Common mistakes**

- Enabling it alongside @pyreon/query’s own retry without lowering one of them — 3 × 3 is nine requests.
- Adding `POST` to `methods` without making the endpoint idempotent. A replayed POST can double-charge.
- Expecting an aborted request to be retried. Cancellation is the expected outcome of navigating away, not a failure.

---

### standardSchema `constant`

```ts
SchemaResolver
```

The resolver that enables schema objects in `.json(schema)` and `endpoint({ response })`. Imported from `@pyreon/http/schema` and passed as `createHttp({ schema: standardSchema })`. Handles both @pyreon/validation typed adapters (`zodSchema(...)`, which carry `_infer` and no `~standard`) and raw Standard Schema instances (zod, valibot, arktype, @pyreon/validate’s `s`). It lives behind its own entry so the core never imports a validation library — a runtime check inside the core would keep it in every bundle, because tree-shaking works on reachability, not runtime branches.

**Example**

```tsx
import { standardSchema } from '@pyreon/http/schema'

const api = createHttp({ schema: standardSchema })
```

**Common mistakes**

- Passing a schema object without configuring the resolver. The error explains the fix, but the plain parse-function form (`.json(MySchema.parse)`) needs no resolver at all.
- Passing an async schema. Response validation is synchronous, and an async one is rejected loudly rather than resolving a Promise as data.
- Assuming `validate: "off"` is a free performance win. It is only safe for non-transforming schemas.

---

### runWithRequest `function`

```ts
<T>(request: AmbientRequest, fn: () => T) => T
```

Establish the per-request SSR context, from `@pyreon/http/server`. Inside it a relative URL resolves against the inbound origin (on the server it otherwise has no origin and fetch rejects) and `forwardHeaders` can copy cookies through. Backed by AsyncLocalStorage rather than a module-level variable, so concurrent renders never see each other’s request — the naive shared slot forwards one user’s session cookie into another user’s render. This is the only entry that imports node&#58;async_hooks, keeping it out of every browser bundle.

**Example**

```tsx
import { runWithRequest } from '@pyreon/http/server'

export const middleware = (ctx: { req: Request }) =>
  runWithRequest(ctx.req, () => api.get('/users').json())
```

**Common mistakes**

- Importing it from `@pyreon/http` instead of `@pyreon/http/server` — the split is what keeps node&#58;async_hooks out of the client bundle.
- Expecting relative URLs to resolve on the server WITHOUT it. There is no ambient origin until you wire it.
- Assuming headers forward automatically. `forwardHeaders` requires an explicit allowlist and stops at the origin boundary by default.

---

### RequestError `class`

```ts
class RequestError extends Error { readonly request: HttpRequest | undefined }  — subclasses: HttpError (+ ClientError/ServerError), TimeoutError, AbortError, NetworkError, ParseError, ResponseValidationError
```

The common base of every error this package throws — `catch (e) { if (e instanceof RequestError) … }` covers the whole family in one check, without listing members. Every message is `[Pyreon]`-prefixed. The subclasses each name a distinct failure MODE, not just a status code: `HttpError` (and its `ClientError`/`ServerError` refinements for 4xx/5xx) is a non-2xx response — thrown by default because `@pyreon/query` needs a rejected promise to enter its error state; `TimeoutError` is the request exceeding its `timeout`; `NetworkError` is the transport failing before any response arrived (DNS, offline, CORS); `ParseError` is a body that did not decode as the requested type; `ResponseValidationError` is a body that decoded but failed schema validation (its `.value` carries the raw, unvalidated body for reporting). `AbortError` is the odd one out — see its own mistake below.

**Example**

```tsx
try {
  await getUser({ params: { id } })
} catch (e) {
  if (e instanceof AbortError) return          // cancellation — not a failure
  if (e instanceof RequestError) reportError(e) // every other failure mode
  throw e
}
```

**Common mistakes**

- Reporting `AbortError` as a failure — it is the EXPECTED outcome of navigating away mid-request or a newer call superseding an older one; check for it FIRST and return, never log it to an error tracker
- Checking `e instanceof AbortError` alone to detect cancellation — `fetch` itself can reject with a plain `DOMException{name:"AbortError"}` (not this package's class); use the standalone `isAbortError(e)` function, which recognizes both
- Assuming every non-2xx throws — a client created with `throwHttpErrors: false` returns the response instead; check `response.ok` in that mode
- Reading `ResponseValidationError.request` for the parsed value — that field is the outgoing request; the raw (unvalidated) body is on `.value`

**See also:** `createHttp` · `standardSchema`

---

### buildUrl `function`

```ts
(baseUrl: string | undefined, path: string, params: PathParams | undefined, query: QueryParams | undefined) => string
```

The full URL-resolution pipeline `createHttp`/`endpoint` build every request URL through: `applyPathParams` (substitutes `:name` placeholders, `encodeURIComponent`-encoded so an id containing `/` cannot escape its segment — throws on a missing param rather than leaving a literal `:id` in the URL) → `joinUrl` (base + path with exactly one slash between them; a PREFIX join, not `new URL(path, base)` — see the "baseUrl is a PREFIX" gotcha) → `buildQuery` (serializes a query object, DROPPING `undefined`/`null` entries so they never land in the URL as the literal text `"undefined"`, and repeating the key for array values). Each step is also individually exported (`applyPathParams`, `joinUrl`, `buildQuery`, `isAbsoluteUrl`) for anything building URLs outside the client — a custom transport, a test assertion, a devtools panel.

**Example**

```tsx
buildUrl('/api', '/users/:id', { id: '1' }, { includeDeleted: true })
// -> '/api/users/1?includeDeleted=true'
```

**Common mistakes**

- Interpolating a param into the path string yourself (`` `/users/${id}` ``) instead of `:id` + `params` — that skips encoding, so an id containing `/` or `?` escapes its segment
- Expecting `joinUrl` to follow WHATWG `new URL(path, base)` semantics — a leading slash does NOT discard the base path here; `joinUrl('/api/v1', '/users')` is `/api/v1/users`, never `/users`
- Passing `undefined` in a query object and expecting it omitted only sometimes — it is ALWAYS dropped, on every value including array entries

**See also:** `createHttp`

---

### compose `function`

```ts
(middleware: readonly HttpMiddleware[], transport: Transport) => Transport
```

Fold a middleware array (outermost first) over a transport into one callable — what `createHttp({ use })` does internally to build the client's dispatch chain. Exposed standalone for testing a middleware pipeline directly (no need to build a full client), or for composing a custom `Transport` outside the normal client shape. Deliberately has NO "next() called multiple times" guard (unlike Koa) — retry middleware legitimately re-enters the downstream chain in a loop, and a guard would forbid exactly that.

**Example**

```tsx
import { compose } from '@pyreon/http'
import { retry } from '@pyreon/http/middleware'
import { fetchTransport } from '@pyreon/http'

const dispatch = compose([retry({ limit: 2 })], fetchTransport)
const response = await dispatch(request)
```

**Common mistakes**

- Assuming a middleware may only call `next()` once — repeated calls are exactly what makes retry possible; do not add a re-entrancy guard on top
- Forgetting a middleware must RETURN the response from `next()` — the chain resolves to whatever each middleware returns, so swallowing it silently drops the response

**See also:** `HttpMiddleware` · `retry`

---

### createFetchTransport `function`

```ts
(fetchImpl?: typeof fetch) => Transport
```

Build a `fetch`-backed `Transport`. `fetchTransport` (a constant) is the default instance — `createHttp()` uses it when no custom transport is configured. `createFetchTransport(fetchImpl)` lets you inject a substitute `fetch` (tests, SSR, a future in-process dispatcher) — the same injectable-implementation seam `@pyreon/zero-content`'s search runtime uses. Its whole job beyond calling `fetch` is normalising the rejection channel: a network failure rejects with a bare `TypeError` and cancellation rejects with `DOMException{name:"AbortError"}`, and this transport turns those into `NetworkError`/`AbortError` respectively so they never get conflated downstream.

**Example**

```tsx
import { createFetchTransport } from '@pyreon/http'

const api = createHttp({ transport: createFetchTransport(myFetchImpl) })
```

**Common mistakes**

- Expecting a raw `TypeError`/`DOMException` from a client built on this transport — both are already normalized to `NetworkError`/`AbortError`
- Building this for every request instead of once at client-construction time — it is a factory, meant to be called once and reused

**See also:** `createHttp` · `RequestError`

---

### getAmbientRequest `function`

```ts
() => AmbientRequest | undefined
```

Read the inbound request currently in scope — `undefined` in the browser, and `undefined` on any server that has not opted in via `runWithRequest` (from `@pyreon/http/server`). `resolveAgainstAmbientOrigin(url)` is the companion that USES it: a root-relative URL (`/api/users`) has no origin on the server, so it resolves against the ambient request's origin; an already-absolute URL, or one with no ambient request, is returned unchanged (never throwing — a malformed inbound URL degrades gracefully instead of failing the render). Both are client-safe (no `node:async_hooks` import) — the AsyncLocalStorage wiring itself lives in `@pyreon/http/server`'s `runWithRequest`, kept in a separate entry so importing this one never drags a Node-only module into a browser bundle.

**Example**

```tsx
import { getAmbientRequest, resolveAgainstAmbientOrigin } from '@pyreon/http'

const req = getAmbientRequest()          // undefined in the browser
const url = resolveAgainstAmbientOrigin('/api/users')  // absolute on the server, unchanged in the browser
```

**Common mistakes**

- Reading this without ever calling `runWithRequest` (from `@pyreon/http/server`) somewhere upstream — it always returns `undefined` until something establishes the context, so relative URLs on the server never resolve on their own
- Importing `runWithRequest` from `@pyreon/http` — it lives in `@pyreon/http/server` specifically so `node:async_hooks` stays out of the client bundle; this read-side pair is the client-safe half

**See also:** `runWithRequest` · `createHttp`

---

### defineEndpoint `function`

```ts
(client: HttpClient, spec: `${HttpMethod} ${string}`, options?: { response?: Validator }) => Endpoint
```

The standalone form of `client.endpoint(spec, options)` — the method is a thin wrapper (`(spec, opts) => defineEndpoint(client, spec, opts)`). Reach for this directly when defining endpoints in a module that should not import a specific client instance (a shared endpoints file consumed against different clients per environment), or when building tooling that generates endpoint declarations. Same key/params/response semantics as `endpoint`.

**Example**

```tsx
import { defineEndpoint } from '@pyreon/http'

const getUser = defineEndpoint(api, 'GET /users/:id', { response: UserSchema })
```

**Common mistakes**

- Using this when `api.endpoint(...)` reads more naturally — for the common case of one client per module, prefer the method form; reach for the standalone function only when the client is not fixed at declaration time

**See also:** `endpoint` · `createHttp`

---

### createMock `function`

```ts
(routes: readonly MockRoute[]) => MockHandle
```

Stub responses as middleware, from `@pyreon/http/mock`. Because middleware can short-circuit, mocking needs no MSW, no service worker and no global fetch patch — so it cannot leak between test files the way a patched global does. Returns the middleware plus the recorded calls for assertions. A request matching no route falls through to the next layer, so you can stub a couple of endpoints and let the rest hit a real transport.

**Example**

```tsx
import { createMock } from '@pyreon/http/mock'

const handle = createMock([{ path: '/users/1', json: { id: '1' } }])
const api = createHttp({ use: [handle.middleware] })
await api.get('/users/1').json()
```

**Common mistakes**

- Expecting a string `path` to match the full URL. It matches by suffix, so `baseUrl` need not be repeated.
- Forgetting `handle.reset()` between tests when asserting on call counts.

---

## Package-level notes

> **Retry is OFF by default:** Deliberate. @pyreon/query already retries 3×, so a client-side default of 3 turns one logical query into NINE requests with nothing in devtools to explain it. Opt in with `use: [retry()]` and keep the total visible in one place.

> **Schema objects need a resolver:** The core never imports a validation library. Pass `schema: standardSchema` from `@pyreon/http/schema` to enable `.json(mySchema)`. Without it, only plain `(raw) => T` parse functions work — which is what keeps the core at zero dependencies.

> **`validate: "off"` is unsafe for transforming schemas:** A coercing schema (`z.coerce.number()`, a `.transform()`) does real work, so skipping it changes the VALUE and the declared type then lies. Prefer `validate: "warn"`, which logs and passes the raw body through.

> **baseUrl is a PREFIX, not a WHATWG base:** `'https://api.com/v1' + '/users'` is `…/v1/users`, never `…/users`. The WHATWG rule (a leading slash discards the base path) makes the same path behave differently under a relative vs absolute base — an environment-dependent surprise that only shows up in production.
