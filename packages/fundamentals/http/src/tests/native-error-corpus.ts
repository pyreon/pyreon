// What the web's request paths reject with, and what they resolve for an answer without JSON — the contract the native
// lowering is held to. One corpus, executed on every side:
//
//   - `native-error-parity.test.ts` (this package) runs it through the REAL web code: an `@pyreon/http` client and its
//     endpoints (awaited calls, `useQuery(() => ep.query(…))` on a real TanStack client), and asserts every message here.
//   - The native compiler's `native-query-web-parity.test.ts` runs the same cases through the SHIPPED Swift and Kotlin
//     runtimes (`httpError`) and through the compiler's emitted query hash. (`useFetch(url)`'s own cases live in
//     `@pyreon/hooks`' `native-fetch-error-corpus.ts`.)
//
// So the three agree by construction rather than by review.

/** An `@pyreon/http` request that answers non-2xx: the web rejects with `HttpError` (`ClientError` / `ServerError`). */
export interface HttpErrorCase {
  readonly name: string
  readonly baseUrl: string
  /** The endpoint spec, `'<METHOD> <path>'`. */
  readonly spec: string
  /** The call's `params` / `query`, as literals. */
  readonly args?: { readonly params?: Record<string, string>; readonly query?: Record<string, string> }
  readonly status: number
  /** The URL the request was SENT to — what the native `throwHttpErrors` layer names. */
  readonly sentUrl: string
  readonly message: string
  readonly errorName: 'ClientError' | 'ServerError' | 'HttpError'
}

const em = '—'

export const HTTP_ERROR_CASES: readonly HttpErrorCase[] = [
  {
    name: 'a 404 GET',
    baseUrl: 'https://api.example.com',
    spec: 'GET /users/:id',
    args: { params: { id: '42' } },
    status: 404,
    sentUrl: 'https://api.example.com/users/42',
    message: `[Pyreon] GET https://api.example.com/users/42 ${em} HTTP 404`,
    errorName: 'ClientError',
  },
  {
    name: 'the query string is redacted',
    baseUrl: 'https://api.example.com',
    spec: 'GET /search',
    args: { query: { q: 'a b', token: 'secret' } },
    status: 401,
    sentUrl: 'https://api.example.com/search?q=a+b&token=secret',
    message: `[Pyreon] GET https://api.example.com/search ${em} HTTP 401`,
    errorName: 'ClientError',
  },
  {
    name: 'userinfo is redacted',
    baseUrl: 'https://user:pw@api.example.com/v1',
    spec: 'DELETE /items/:id',
    args: { params: { id: 'x/y' } },
    status: 500,
    sentUrl: 'https://user:pw@api.example.com/v1/items/x%2Fy',
    message: `[Pyreon] DELETE https://api.example.com/v1/items/x%2Fy ${em} HTTP 500`,
    errorName: 'ServerError',
  },
  {
    name: 'a 503 POST',
    baseUrl: 'https://api.example.com',
    spec: 'POST /users',
    status: 503,
    sentUrl: 'https://api.example.com/users',
    message: `[Pyreon] POST https://api.example.com/users ${em} HTTP 503`,
    errorName: 'ServerError',
  },
  {
    name: 'a 3xx the transport hands back',
    baseUrl: 'https://api.example.com',
    spec: 'PUT /users/:id',
    args: { params: { id: 'é' } },
    status: 304,
    sentUrl: 'https://api.example.com/users/%C3%A9',
    message: `[Pyreon] PUT https://api.example.com/users/%C3%A9 ${em} HTTP 304`,
    errorName: 'HttpError',
  },
]

/**
 * A `useQuery(() => ep.query(args))` whose endpoint answers 204: `.json()` resolves `undefined`, and TanStack fails the
 * query with `<queryHash> data is undefined`. `args` is SOURCE text — read by the web test with `props` bound to `props`,
 * and compiled by the native test — and `message` is what both must produce for those props.
 */
export interface UndefinedDataCase {
  readonly name: string
  /** The client's `keyScope`, when it sets one. */
  readonly clientKeyScope?: string
  /** The endpoint declaration's `keyScope`, when it sets one. */
  readonly endpointKeyScope?: string
  readonly spec: string
  /** The `.query()` argument as source, reading `props.id` / `props.n` at runtime. */
  readonly args?: string
  readonly props: { readonly id: string; readonly n: number }
  readonly message: string
}

export const UNDEFINED_DATA_CASES: readonly UndefinedDataCase[] = [
  { name: 'no arguments', spec: 'GET /users', props: { id: '1', n: 1 }, message: '["GET","/users"] data is undefined' },
  {
    name: 'a literal param',
    spec: 'GET /users/:id',
    args: "{ params: { id: '1' } }",
    props: { id: '1', n: 1 },
    message: '["GET","/users/:id",{"params":{"id":"1"}}] data is undefined',
  },
  {
    name: 'a runtime param, JSON-escaped',
    spec: 'GET /users/:id',
    args: '{ params: { id: props.id } }',
    props: { id: 'a"b\\c', n: 1 },
    message: '["GET","/users/:id",{"params":{"id":"a\\"b\\\\c"}}] data is undefined',
  },
  {
    name: 'params and query, every object key sorted',
    spec: 'GET /users/:id',
    args: "{ query: { z: props.n, a: 'x' }, params: { id: props.id } }",
    props: { id: '7', n: 2.5 },
    message: '["GET","/users/:id",{"params":{"id":"7"},"query":{"a":"x","z":2.5}}] data is undefined',
  },
  {
    name: 'an array query value',
    spec: 'GET /posts',
    args: "{ query: { tag: ['a', 'b'] } }",
    props: { id: '1', n: 1 },
    message: '["GET","/posts",{"query":{"tag":["a","b"]}}] data is undefined',
  },
  {
    name: 'an empty params object adds no scope',
    spec: 'GET /users',
    args: '{ params: {} }',
    props: { id: '1', n: 1 },
    message: '["GET","/users"] data is undefined',
  },
  {
    name: "the client's keyScope",
    clientKeyScope: 'v1',
    spec: 'GET /users',
    props: { id: '1', n: 1 },
    message: '["v1","GET","/users"] data is undefined',
  },
  {
    name: "the endpoint's keyScope wins",
    clientKeyScope: 'v1',
    endpointKeyScope: 'admin',
    spec: 'GET /users/:id',
    args: '{ params: { id: props.id } }',
    props: { id: '9', n: 1 },
    message: '["admin","GET","/users/:id",{"params":{"id":"9"}}] data is undefined',
  },
]
