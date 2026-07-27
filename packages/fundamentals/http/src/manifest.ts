import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/http',
  title: 'HTTP Client',
  tagline: 'Transport layer under @pyreon/query — onion middleware, typed errors, optional schema validation',
  description:
    'The request/response layer beneath @pyreon/query. It owns how a request is made — URL building, headers, body encoding, cancellation, typed errors and optional response validation — and deliberately owns no cache, no dedup-by-key and no reactive container, because those already have owners. Mirrors the split the native runtime already made, where PyreonFetch is the reactive result container and PyreonHttp is the request/response layer beneath it. The core has zero dependencies; retry, schema validation, TanStack adapters, mocking and SSR each live behind their own entry so an unused one costs nothing.',
  category: 'universal',
  features: [
    'Onion middleware `(req, next) => res` — retry, auth-refresh and short-circuit are ordinary middleware, which axios interceptor arrays structurally cannot express',
    'Immutable clients: `extend()` returns a new instance, so no shared mutable defaults can leak across concurrent SSR requests',
    'Three validation tiers — unchecked cast, any parse function, or any Standard Schema (zod / valibot / arktype / `s` / @pyreon/validation adapters)',
    'Endpoints derive the call, the cache key and the response type from one declaration, so queryKey and URL cannot drift',
    'Typed error hierarchy where AbortError stays distinct from a real failure',
    'Timeout ON by default — `fetch` has none, so a hung request otherwise never settles',
    'Per-request SSR context via AsyncLocalStorage, so concurrent renders never cross cookies',
    'Network-free mocking: middleware short-circuits, so tests need no MSW and no global fetch patch',
  ],
  peerDeps: ['@pyreon/validation'],
  gotchas: [
    {
      label: 'Retry is OFF by default',
      note: 'Deliberate. @pyreon/query already retries 3×, so a client-side default of 3 turns one logical query into NINE requests with nothing in devtools to explain it. Opt in with `use: [retry()]` and keep the total visible in one place.',
    },
    {
      label: 'Schema objects need a resolver',
      note: 'The core never imports a validation library. Pass `schema: standardSchema` from `@pyreon/http/schema` to enable `.json(mySchema)`. Without it, only plain `(raw) => T` parse functions work — which is what keeps the core at zero dependencies.',
    },
    {
      label: '`validate: "off"` is unsafe for transforming schemas',
      note: 'A coercing schema (`z.coerce.number()`, a `.transform()`) does real work, so skipping it changes the VALUE and the declared type then lies. Prefer `validate: "warn"`, which logs and passes the raw body through.',
    },
    {
      label: 'baseUrl is a PREFIX, not a WHATWG base',
      note: "`'https://api.com/v1' + '/users'` is `…/v1/users`, never `…/users`. The WHATWG rule (a leading slash discards the base path) makes the same path behave differently under a relative vs absolute base — an environment-dependent surprise that only shows up in production.",
    },
  ],
  longExample: `import { createHttp } from '@pyreon/http'
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
console.log(user.name)`,
  api: [
    {
      name: 'createHttp',
      kind: 'function',
      signature: '(config?: HttpClientConfig) => HttpClient',
      summary:
        'Create an HTTP client. Every option has a working default: a 30s timeout (because fetch has none and a hung request otherwise never settles), `same-origin` credentials, and throw-on-non-2xx (because @pyreon/query needs a rejected promise to enter its error state). Clients are IMMUTABLE — there is no `defaults` object to mutate, since a shared mutable default leaks across concurrent SSR requests. Derive variants with `extend()`, which accumulates headers and middleware while overriding scalars.',
      example: `import { createHttp } from '@pyreon/http'

const api = createHttp({ baseUrl: '/api', timeout: 10_000 })
const user = await api.get('/users/:id', { params: { id: '1' } }).json()`,
      mistakes: [
        'Reaching for `api.defaults.headers.common.X = …` (axios muscle memory). It does not exist — mutable shared defaults are the classic SSR cross-request leak. Use `api.extend({ headers })`, which returns a NEW client.',
        'Passing `baseURL` (axios spelling). The option is `baseUrl`.',
        'Expecting `baseUrl` to behave like `new URL(path, base)`. It is a plain PREFIX, so a leading slash does NOT discard the base path.',
        'Passing both `json` and `body`. They are mutually exclusive — `json` serializes and sets Content-Type for you, and passing both throws rather than silently picking one.',
        'Interpolating into the path (`api.get(`/users/${id}`)`). That skips URL encoding, so an id containing "/" escapes its segment. Use `{ params: { id } }`.',
        'Expecting retry by default. It is OFF, because it compounds with @pyreon/query’s own retry.',
      ],
    },
    {
      name: 'HttpClient',
      kind: 'type',
      signature:
        'interface HttpClient { get/post/put/patch/delete/head/options(path, options?): HttpResponsePromise; request(method, path, options?); extend(config): HttpClient; endpoint(spec, options?): Endpoint }',
      summary:
        'A configured client. Each verb returns an HttpResponsePromise — awaitable for the response, or asked directly for a decoded body via `.json()` / `.text()` / `.blob()` / `.arrayBuffer()` / `.formData()` / `.void()`. The request fires eagerly, so `.json()` never re-issues it and two consumers of the same promise share one network call.',
      example: `const res = await api.get('/users/1')       // HttpResponse (status, headers, raw)
const user = await api.get('/users/1').json() // decoded body`,
      mistakes: [
        'Calling `.json()` after already awaiting and reading the body — a Response body is single-use.',
        'Assuming `.json()` throws on an empty body. A 204/205/304 or an empty 200 resolves to `undefined`.',
      ],
    },
    {
      name: 'endpoint',
      kind: 'function',
      signature:
        "(spec: `${HttpMethod} ${string}`, options?: { response?: Validator }) => Endpoint",
      summary:
        'Declare a reusable endpoint. One declaration yields the callable, a stable structural cache key, and the response type — which is what stops queryKey and URL from drifting apart, the single biggest pain with axios plus TanStack Query. `params` is REQUIRED by the type system exactly when the path declares `:placeholders`, and its keys are extracted from the path literal, so a typo is a compile error. `.query(args)` emits `{ queryKey, queryFn }` with the AbortSignal already forwarded; `.mutation()` emits `{ mutationFn, invalidates }`.',
      example: `const getUser = api.endpoint('GET /users/:id', { response: UserSchema })

await getUser({ params: { id: '1' } })
const options = getUser.query({ params: { id: '1' } })
console.log(options.queryKey)`,
      mistakes: [
        'Hand-writing a `queryKey` next to an endpoint call. Use `endpoint.query(...)` so the key is derived from the same declaration as the URL.',
        'Expecting `mutationFn` to receive an AbortSignal. TanStack gives mutations no context at all — pass one in the variables if the mutation must be cancellable.',
        'Writing the spec without a method (`"/users"`). It must be `"<METHOD> <path>"`.',
        'Assuming `invalidates` takes strings. It takes ENDPOINTS, and resolves each to its key prefix.',
      ],
    },
    {
      name: 'HttpMiddleware',
      kind: 'type',
      signature: '(request: HttpRequest, next: Next) => Promise<HttpResponse>',
      summary:
        'Onion middleware, chosen over axios-style interceptor arrays because it is the only shape that expresses what people actually need: retry calls `next()` in a LOOP (an interceptor pair cannot re-enter the chain, which is why axios users end up hanging `config.__isRetry` flags off the request), refresh inspects the response and re-issues, and a mock or cache returns WITHOUT calling `next`. Order is lexical — the `use: [...]` array — so there is no registration registry and no eject handle to leak.',
      example: `const logger: HttpMiddleware = async (request, next) => {
  const started = Date.now()
  const response = await next(request)
  console.warn(request.method, request.url, Date.now() - started)
  return response
}`,
      mistakes: [
        'Forgetting to return the response from `next()`. The chain resolves to whatever each middleware returns.',
        'Assuming `next()` may only be called once. Calling it repeatedly is exactly what makes retry possible.',
        'Mutating `request.headers` expecting it to affect an already-issued attempt — mutate before calling `next()`.',
      ],
    },
    {
      name: 'retry',
      kind: 'function',
      signature: '(options?: RetryOptions) => HttpMiddleware',
      summary:
        'Replay a failed request. OFF unless you add it, because @pyreon/query already retries and the two compound silently. Retries idempotent methods only (POST is excluded), on 408/413/429/5xx plus transport failures, with exponential backoff, full jitter and `Retry-After` support. Never replays a cancellation, and stops replaying the moment the caller aborts — including mid-backoff.',
      example: `const api = createHttp({ use: [retry({ limit: 3 })] })`,
      mistakes: [
        'Enabling it alongside @pyreon/query’s own retry without lowering one of them — 3 × 3 is nine requests.',
        'Adding `POST` to `methods` without making the endpoint idempotent. A replayed POST can double-charge.',
        'Expecting an aborted request to be retried. Cancellation is the expected outcome of navigating away, not a failure.',
      ],
    },
    {
      name: 'standardSchema',
      kind: 'constant',
      signature: 'SchemaResolver',
      summary:
        'The resolver that enables schema objects in `.json(schema)` and `endpoint({ response })`. Imported from `@pyreon/http/schema` and passed as `createHttp({ schema: standardSchema })`. Handles both @pyreon/validation typed adapters (`zodSchema(...)`, which carry `_infer` and no `~standard`) and raw Standard Schema instances (zod, valibot, arktype, @pyreon/validate’s `s`). It lives behind its own entry so the core never imports a validation library — a runtime check inside the core would keep it in every bundle, because tree-shaking works on reachability, not runtime branches.',
      example: `import { standardSchema } from '@pyreon/http/schema'

const api = createHttp({ schema: standardSchema })`,
      mistakes: [
        'Passing a schema object without configuring the resolver. The error explains the fix, but the plain parse-function form (`.json(MySchema.parse)`) needs no resolver at all.',
        'Passing an async schema. Response validation is synchronous, and an async one is rejected loudly rather than resolving a Promise as data.',
        'Assuming `validate: "off"` is a free performance win. It is only safe for non-transforming schemas.',
      ],
    },
    {
      name: 'runWithRequest',
      kind: 'function',
      signature: '<T>(request: AmbientRequest, fn: () => T) => T',
      summary:
        'Establish the per-request SSR context, from `@pyreon/http/server`. Inside it a relative URL resolves against the inbound origin (on the server it otherwise has no origin and fetch rejects) and `forwardHeaders` can copy cookies through. Backed by AsyncLocalStorage rather than a module-level variable, so concurrent renders never see each other’s request — the naive shared slot forwards one user’s session cookie into another user’s render. This is the only entry that imports node:async_hooks, keeping it out of every browser bundle.',
      example: `import { runWithRequest } from '@pyreon/http/server'

export const middleware = (ctx: { req: Request }) =>
  runWithRequest(ctx.req, () => api.get('/users').json())`,
      mistakes: [
        'Importing it from `@pyreon/http` instead of `@pyreon/http/server` — the split is what keeps node:async_hooks out of the client bundle.',
        'Expecting relative URLs to resolve on the server WITHOUT it. There is no ambient origin until you wire it.',
        'Assuming headers forward automatically. `forwardHeaders` requires an explicit allowlist and stops at the origin boundary by default.',
      ],
    },
    {
      name: 'createMock',
      kind: 'function',
      signature: '(routes: readonly MockRoute[]) => MockHandle',
      summary:
        'Stub responses as middleware, from `@pyreon/http/mock`. Because middleware can short-circuit, mocking needs no MSW, no service worker and no global fetch patch — so it cannot leak between test files the way a patched global does. Returns the middleware plus the recorded calls for assertions. A request matching no route falls through to the next layer, so you can stub a couple of endpoints and let the rest hit a real transport.',
      example: `import { createMock } from '@pyreon/http/mock'

const handle = createMock([{ path: '/users/1', json: { id: '1' } }])
const api = createHttp({ use: [handle.middleware] })
await api.get('/users/1').json()`,
      mistakes: [
        'Expecting a string `path` to match the full URL. It matches by suffix, so `baseUrl` need not be repeated.',
        'Forgetting `handle.reset()` between tests when asserting on call counts.',
      ],
    },
  ],
})
