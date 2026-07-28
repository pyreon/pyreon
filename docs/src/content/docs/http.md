---
title: HTTP
description: The transport layer under @pyreon/query — onion middleware, typed errors, and optional schema-validated responses.
---

`@pyreon/http` owns **how a request is made**: URL building, path params, query encoding, headers, body, cancellation, typed errors, and optional response validation.

It deliberately owns **no cache, no dedup-by-key, and no reactive container** — `@pyreon/query`, `useFetch` and `createResource` already do. That split mirrors the one the native runtime already made, where `PyreonFetch` is the reactive result container and `PyreonHttp` the request/response layer beneath it.

<PackageBadge name="@pyreon/http" href="/docs/http" />

## Installation

```bash
pyreon add @pyreon/http
```

## Quick start

```ts
import { createHttp } from '@pyreon/http'

export const api = createHttp({ baseUrl: '/api' })

const user = await api.get('/users/:id', { params: { id: '1' } }).json<User>()
```

Every verb returns a promise you can either **await for the response**, or ask directly for a decoded body:

```ts
const res  = await api.get('/users/1')        // HttpResponse — status, headers, raw
const user = await api.get('/users/1').json() // decoded body
```

`.text()`, `.blob()`, `.arrayBuffer()`, `.formData()` and `.void()` work the same way. The request fires eagerly, so `.json()` never re-issues it.

## Everything is optional

The core has **zero dependencies**. Each capability is a separate entry, so an unused one costs nothing.

| Layer | Entry |
| --- | --- |
| client, errors, endpoints | `@pyreon/http` |
| retry / dedupe / auth / logging / header forwarding | `@pyreon/http/middleware` |
| Standard Schema validation | `@pyreon/http/schema` |
| TanStack adapters | `@pyreon/http/query` |
| network-free mocking | `@pyreon/http/mock` |
| per-request SSR context | `@pyreon/http/server` |

`/server` is the only entry that touches `node:async_hooks`, so it stays out of every browser bundle by construction.

## Always use `params` — never interpolate

```ts
api.get(`/users/${id}`)                   // ✗ no encoding
api.get('/users/:id', { params: { id } }) // ✓ encoded
```

Interpolating skips URL encoding. An id of `1/../admin` escapes its segment and the request silently reaches `/admin` — the URL-shaped sibling of SQL string concatenation. `params` runs every value through `encodeURIComponent`.

The `pyreon/no-unencoded-path-interpolation` lint rule catches this.

## Validation is three tiers

Only the third costs a dependency.

```ts
await api.get('/users/1').json<User>()     // 0 — unchecked cast, zero cost
await api.get('/users/1').json(isUser)     // 1 — any (raw: unknown) => T
await api.get('/users/1').json(UserSchema) // 2 — needs a schema resolver
```

Tier 1 already covers a lot: a hand-written type guard, a `superstruct` assert, or a detached `zodSchema.parse` all fit `(raw: unknown) => T`.

Tier 2 accepts **any Standard Schema** — zod, valibot, arktype, `@pyreon/validate`'s `s`, and `@pyreon/validation`'s typed adapters — and is enabled per client:

```ts
import { standardSchema } from '@pyreon/http/schema'

export const api = createHttp({ baseUrl: '/api', schema: standardSchema })
```

A mismatch throws `ResponseValidationError`. Two other modes:

- `validate: 'warn'` — log and pass the raw body through. Useful when a backend drifts and you would rather degrade than white-screen. It fires in **production** too; that is the point.
- `validate: 'off'` — skip validation. Safe only for **non-transforming** schemas: a coercing schema (`z.coerce.number()`, a `.transform()`) does real work, so skipping it changes the *value* and the declared type then lies.

## Endpoints

The biggest real pain with `axios` + TanStack Query is that the `queryKey` and the URL drift apart, and the response type is a cast. An endpoint derives all three from one declaration:

```ts
export const listUsers  = api.endpoint('GET /users',     { response: UserSchema.array() })
export const getUser    = api.endpoint('GET /users/:id', { response: UserSchema })
export const createUser = api.endpoint('POST /users',    { response: UserSchema })

await getUser({ params: { id: '1' } })                    // typed + validated
useQuery(() => getUser.query({ params: { id: id() } }))   // key + fn + signal
useMutation(createUser.mutation({ invalidates: [listUsers] }))
```

`params` is **required by the type system exactly when the path declares `:placeholders`**, and its keys come from the path literal — so `{ params: { userId } }` against `/users/:id` is a compile error.

`invalidates` takes **endpoints**, not stringly-typed keys.

## Middleware

```ts
type HttpMiddleware = (request: HttpRequest, next: Next) => Promise<HttpResponse>
```

Onion middleware rather than axios-style interceptor arrays, because it is the only shape that expresses what people actually need:

- **retry** — call `next()` in a loop. An interceptor pair cannot re-enter the chain, which is why axios users end up hanging `config.__isRetry` flags off the request.
- **refresh** — inspect the response, refresh, re-issue.
- **short-circuit** — return *without* calling `next` (mock, cache, offline).

Order is lexical (the `use: [...]` array), so there is no registration registry and no `eject()` handle to leak.

```ts
import { bearer, retry } from '@pyreon/http/middleware'

const api = createHttp({
  baseUrl: '/api',
  use: [bearer(() => session().token), retry({ limit: 2 })],
})
```

## Defaults, and why

| Concern | Default | Why |
| --- | --- | --- |
| timeout | **on**, 30s | `fetch` has none — a server that accepts and never responds wedges the promise forever |
| retry | **off** | `@pyreon/query` already retries 3×; a client default of 3 makes one logical query **nine** requests |
| dedupe | off | query already dedupes by key |
| throw on non-2xx | on | query needs a *rejected* promise to enter its error state |
| credentials | `same-origin` | — |

## Errors

```text
RequestError                  base — catch this to cover everything
├── HttpError                 non-2xx (carries .status and .response)
│   ├── ClientError           4xx
│   └── ServerError           5xx
├── TimeoutError              exceeded `timeout`
├── AbortError                cancelled — never retry, never report
├── NetworkError              failed before a response
├── ParseError                body did not decode
└── ResponseValidationError   body did not match the schema
```

`AbortError` is kept deliberately distinct: "the user navigated away" and "the API is down" demand opposite handling.

```ts
import { HttpError } from '@pyreon/http'

try {
  await getUser({ params: { id: '404' } })
} catch (error) {
  if (error instanceof HttpError && error.status === 404) {
    // error.response.raw is the real Response — the body is still readable
  }
}
```

## Clients are immutable

There is deliberately no `api.defaults.headers.common.X = …`. A mutable shared default leaks across concurrent SSR requests — one request's mutation reaching another user's render. Derive instead:

```ts
const authed = api.extend({ headers: { Authorization: `Bearer ${token}` } })
```

`extend()` **accumulates** headers and middleware and **overrides** scalars, leaving the parent untouched.

## SSR

On the server a relative URL has no origin and `fetch` rejects, and forwarding auth needs the inbound headers. Wire it once per request:

```ts
import { runWithRequest } from '@pyreon/http/server'
import { forwardHeaders } from '@pyreon/http/middleware'

export const api = createHttp({ baseUrl: '/api', use: [forwardHeaders(['cookie'])] })

// in your handler / middleware
runWithRequest(ctx.req, () => render(ctx))
```

Backed by `AsyncLocalStorage`, not a module-level variable — concurrent renders each see only their own request. (A shared slot forwards one user's session cookie into another user's render.)

`forwardHeaders` requires an **explicit allowlist** and **stops at the origin boundary by default**, so pointing `baseUrl` at a third party cannot leak cookies there. Pass `{ crossOrigin: true }` only when the other origin is yours.

## Testing

Because middleware can short-circuit, mocking needs no MSW and no `globalThis.fetch` patch — so it cannot leak between test files:

```ts
import { createMock } from '@pyreon/http/mock'

const handle = createMock([{ path: '/users/1', json: { id: '1' } }])
const api = createHttp({ use: [handle.middleware] })

await api.get('/users/1').json()
expect(handle.calls).toHaveLength(1)
```

A request matching no route falls through to the next layer, so you can stub a couple of endpoints and let the rest hit a real transport.

## Relationship to the rest of the framework

- **`@pyreon/query`** — owns caching, dedup-by-key and invalidation. Use `endpoint.query()` so the key and the URL cannot drift, and so TanStack's `AbortSignal` is forwarded.
- **`useFetch`** (`@pyreon/hooks`) — the tiny reactive container, and the multiplatform hook PMTC lowers to native. Reach for it when you want `{ data, error, isPending }` and nothing else.
- **`@pyreon/feature`** — builds on this client, so its generated CRUD hooks cancel correctly.
- **`@pyreon/validation`** — owns the Standard Schema contract this package validates against.
