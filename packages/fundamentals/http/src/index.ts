/**
 * `@pyreon/http` — the transport layer under `@pyreon/query`.
 *
 * ## Positioning
 *
 * This package owns HOW a request is made: URL building, headers, body
 * encoding, cancellation, typed errors, and optional response validation.
 * It owns NO cache, NO dedup-by-key, and NO reactive container — those
 * already have owners (`@pyreon/query`, `useFetch`, `createResource`).
 *
 * That split is not a fresh opinion; the native runtime already made it and
 * wrote it down:
 *
 * > `PyreonFetch` is the reactive RESULT container with an injected
 * > fetcher; `PyreonHttp` is the request/response layer that fetcher uses.
 *
 * `@pyreon/http` is the web sibling of `PyreonHttp`.
 *
 * ## Everything is optional
 *
 * The core has ZERO dependencies — no `@pyreon/reactivity`, no
 * `@pyreon/validation`, no `@pyreon/query`. Each capability is a separate,
 * separately-imported layer, so an unused one costs nothing:
 *
 * | Layer | Entry | Cost when unused |
 * |---|---|---|
 * | client, errors, endpoints | `@pyreon/http` | — |
 * | retry / dedupe / auth / logging | `@pyreon/http/middleware` | not imported |
 * | Standard Schema validation | `@pyreon/http/schema` | not imported |
 * | TanStack adapters | `@pyreon/http/query` | not imported |
 * | network-free mocking | `@pyreon/http/mock` | not imported |
 *
 * Validation in particular is three tiers, and only the third costs a
 * dependency:
 *
 * ```ts
 * .json<User>()                 // 0 — unchecked cast, zero cost
 * .json(isUser)                 // 1 — any (raw: unknown) => T, zero deps
 * .json(UserSchema)             // 2 — needs `schema: standardSchema`
 * ```
 *
 * @example
 * ```ts
 * import { createHttp } from '@pyreon/http'
 * import { retry, bearer } from '@pyreon/http/middleware'
 * import { standardSchema } from '@pyreon/http/schema'
 *
 * export const api = createHttp({
 *   baseUrl: '/api',
 *   schema: standardSchema,
 *   use: [bearer(() => session().token), retry({ limit: 2 })],
 * })
 *
 * export const getUser = api.endpoint('GET /users/:id', { response: UserSchema })
 *
 * await getUser({ params: { id: '1' } })                    // typed + validated
 * useQuery(() => getUser.query({ params: { id: id() } }))   // key + fn + signal
 * ```
 */

export { createHttp, type HttpClient } from './client'

export {
  defineEndpoint,
  type CallArgs,
  type Endpoint,
  type EndpointArgs,
  type EndpointKey,
  type EndpointOptions,
  type EndpointSpec,
  type MutationOptionsLike,
  type PathParamNames,
  type QueryOptionsLike,
  type ResponseOf,
} from './endpoint'

export {
  AbortError,
  ClientError,
  HttpError,
  NetworkError,
  ParseError,
  RequestError,
  ResponseValidationError,
  ServerError,
  TimeoutError,
  isAbortError,
} from './errors'

export { compose } from './chain'
export {
  getAmbientRequest,
  resolveAgainstAmbientOrigin,
  type AmbientRequest,
  type RequestSource,
} from './request-context'
export { createFetchTransport, fetchTransport, toHttpResponse } from './transport'
export { type HttpResponsePromise } from './response'
export { applyPathParams, buildQuery, buildUrl, isAbsoluteUrl, joinUrl } from './url'

export type {
  HttpClientConfig,
  HttpMethod,
  HttpMiddleware,
  HttpRequest,
  HttpResponse,
  Next,
  ParseFn,
  PathParams,
  QueryParams,
  QueryValue,
  RequestOptions,
  SchemaOutput,
  SchemaResolver,
  StandardSchemaShape,
  Transport,
  ValidateMode,
  Validator,
} from './types'
