# @pyreon/http

> **Private / pre-release.** Not published yet. The API may change without a
> changeset while it stabilises.

The transport layer under `@pyreon/query`.

`@pyreon/http` owns **how a request is made** — URL building, headers, body
encoding, cancellation, typed errors, and optional response validation. It
owns **no cache, no dedup-by-key, and no reactive container**; those already
have owners (`@pyreon/query`, `useFetch`, `createResource`).

That split is not a new opinion — the native runtime already made it:

> `PyreonFetch` is the reactive RESULT container with an injected fetcher;
> `PyreonHttp` is the request/response layer that fetcher uses.

`@pyreon/http` is the web sibling of `PyreonHttp`.

## Everything is optional

The core has **zero dependencies** — no `@pyreon/reactivity`, no
`@pyreon/validation`, no `@pyreon/query`. Each capability is a separately
imported entry, so an unused one costs nothing.

| Layer | Entry | Cost when unused |
| --- | --- | --- |
| client, errors, endpoints | `@pyreon/http` | — |
| retry / dedupe / auth / logging | `@pyreon/http/middleware` | not imported |
| Standard Schema validation | `@pyreon/http/schema` | not imported |
| TanStack adapters | `@pyreon/http/query` | not imported |
| network-free mocking | `@pyreon/http/mock` | not imported |
| per-request SSR context | `@pyreon/http/server` | not imported |

`/server` is the only entry that touches `node:async_hooks`, so it stays out
of every browser bundle by construction.

## Validation is three tiers

Only the third costs a dependency.

```ts
await api.get('users/1').json<User>()          // 0 — unchecked cast, zero cost
await api.get('users/1').json(isUser)          // 1 — any (raw: unknown) => T
await api.get('users/1').json(UserSchema)      // 2 — needs `schema: standardSchema`
```

Tier 1 already covers a lot: a hand-written type guard, a `superstruct`
assert, or a detached `zodSchema.parse` all fit `(raw: unknown) => T`.

Tier 2 accepts any Standard Schema — zod, valibot, arktype,
`@pyreon/validate`'s `s` — and is enabled per client:

```ts
import { standardSchema } from '@pyreon/http/schema'
const api = createHttp({ schema: standardSchema })
```

A failure throws `ResponseValidationError` by default. `validate: 'warn'`
logs and passes the raw body through instead (useful when a backend drifts
and you would rather degrade than white-screen); `validate: 'off'` skips
validation — safe only for **non-transforming** schemas, since a coercing
schema does real work and skipping it changes the value.

## Quick start

```ts
import { createHttp } from '@pyreon/http'
import { bearer, retry } from '@pyreon/http/middleware'
import { standardSchema } from '@pyreon/http/schema'

export const api = createHttp({
  baseUrl: '/api',
  schema: standardSchema,
  use: [bearer(() => session().token), retry({ limit: 2 })],
})

const user = await api.get('/users/:id', { params: { id: '1' } }).json(UserSchema)
```

## Endpoints

The biggest real pain with `axios` + TanStack Query is that the `queryKey`
and the URL drift apart, and the response type is a cast. An endpoint
derives both from one declaration:

```ts
export const listUsers  = api.endpoint('GET /users',      { response: UserSchema.array() })
export const getUser    = api.endpoint('GET /users/:id',  { response: UserSchema })
export const createUser = api.endpoint('POST /users',     { response: UserSchema })

await getUser({ params: { id: '1' } })                    // typed + validated
useQuery(() => getUser.query({ params: { id: id() } }))   // key + fn + signal
useMutation(createUser.mutation({ invalidates: [listUsers] }))
```

`params` is **required by the type system exactly when the path declares
`:placeholders`**, and its keys come from the path literal — so
`{ params: { userId } }` against `/users/:id` is a compile error.

## Middleware

```ts
type HttpMiddleware = (request: HttpRequest, next: Next) => Promise<HttpResponse>
```

Onion middleware rather than axios-style interceptor arrays, because it is
the only shape that expresses what people actually need:

- **retry** — call `next()` in a loop. An interceptor pair cannot re-enter
  the chain, which is why axios users end up hanging `config.__isRetry`
  flags off the request.
- **refresh** — inspect the response, refresh, re-issue.
- **short-circuit** — return *without* calling `next` (mock, cache, offline).

Order is lexical (the `use: [...]` array), so there is no registration
registry and no `eject()` handle to leak.

## Defaults

| Concern | Default | Why |
| --- | --- | --- |
| timeout | **on**, 30s | `fetch` has none — a hung request otherwise hangs forever |
| retry | **off** | query already retries 3×; a client default of 3 makes one logical query **nine** requests |
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

`AbortError` is kept deliberately distinct: "the user navigated away" and
"the API is down" demand opposite handling.

## SSR

On the server a relative URL has no origin and `fetch` rejects, and
forwarding auth needs the inbound headers. Wire it once per request:

```ts
import { runWithRequest } from '@pyreon/http/server'
import { forwardHeaders } from '@pyreon/http/middleware'

export const api = createHttp({ baseUrl: '/api', use: [forwardHeaders(['cookie'])] })

// in your handler / middleware
runWithRequest(ctx.req, () => render(ctx))
```

Backed by `AsyncLocalStorage`, not a module-level `let` — concurrent
renders each see only their own request. (The naive shared slot forwards
one user's session cookie into another user's render; there is a bisect-
verified test for exactly that.)

`forwardHeaders` requires an explicit allowlist and **stops at the origin
boundary by default**, so pointing `baseUrl` at a third party cannot leak
cookies there.

## Testing

Because middleware can short-circuit, mocking needs no MSW and no
`globalThis.fetch` patch — so it cannot leak between test files:

```ts
import { createMock } from '@pyreon/http/mock'

const handle = createMock([{ path: '/users/1', json: { id: '1' } }])
const api = createHttp({ use: [handle.middleware] })

await api.get('/users/1').json()
expect(handle.calls).toHaveLength(1)
```

## License

MIT
