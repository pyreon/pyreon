import { type CompilerPlugin, type MethodCallRecognizer } from '@pyreon/native-compiler/plugin-api'
import { httpFacts, httpRequestSource, scanHttp } from './endpoint'
import { MIDDLEWARE_EXPR, middlewareExprEmitter } from './middleware'
import { HTTP_PLUGIN_NAME } from './names'

export { HTTP_PLUGIN_NAME }

/**
 * The `@pyreon/http` native plugin: the endpoint DSL's compile-time half. It owns the scan of
 * `createHttp` / `client.endpoint()` declarations (metadata that emits nothing) and resolves a call
 * of an endpoint into a concrete request — the URL templated, the query serialised, literal headers
 * and a literal json body baked, a runtime `:param` rendered as native string interpolation.
 *
 * It declares no hook of its own: `useFetch` (`@pyreon/hooks`) and `useQuery` / `useStream`
 * (`@pyreon/query`) are owned by the packages an app imports them from, and read this plugin's
 * request source through `ParseContext.requests`.
 */
/**
 * An imperative call on a `createHttp` client — `api.get('/users/1')`, `api.post(…)`, `api.request(…)`.
 *
 * The client itself is compile-time METADATA (a base URL and options): it emits nothing, so there is no native object
 * for a method to be called on, and the emitted handler would reference an `api` that does not exist. The lowering
 * that does exist is endpoint → `useFetch` / `useQuery`, so the hint names it. `client.endpoint(…)` declarations are
 * left alone (the scan owns them).
 */
const recognizeClientCall: MethodCallRecognizer = (site, ctx) => {
  const receiver = site.receiver as { type?: string; name?: string }
  if (receiver.type !== 'Identifier' || receiver.name === undefined) return undefined
  if (!httpFacts(ctx).clients.has(receiver.name)) return undefined
  if (site.method === 'endpoint') return undefined
  return ctx.unsupported(
    site.node,
    `\`${receiver.name}.${site.method}(…)\` on an @pyreon/http client`,
    `the client is compile-time metadata with no native object, so imperative calls cannot lower. Declare the request as an endpoint — const e = ${receiver.name}.endpoint('GET /path') — and read it with useFetch<T>(e({ params })) or useQuery`,
  )
}

export const httpPlugin: CompilerPlugin = {
  name: HTTP_PLUGIN_NAME,
  apiVersion: 2,
  modules: ['@pyreon/http'],
  scanModule: scanHttp,
  requestSources: [httpRequestSource],
  // A client's lowered `use: [...]` array — see `middleware.ts`.
  exprs: { [MIDDLEWARE_EXPR]: middlewareExprEmitter },
  methodCalls: Object.fromEntries(
    ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'request'].map((m) => [m, recognizeClientCall]),
  ),
  // A client declared inside a component body is not the scanned file-scope form, so it would be copied through verbatim.
  tier2Calls: ['createHttp'],
  unlowered: {
    '@pyreon/http': {
      // `createHttp` LOWERS as part of the endpoint→useFetch resolution: a
      // same-file `const api = createHttp({ baseUrl })` + `const getUser =
      // api.endpoint('GET /users/:id')` let `useFetch<T>(getUser({ params }))`
      // resolve to a concrete URL + method (metadata only — createHttp emits
      // nothing). The remaining transport surface (a bare `endpoint(...)`
      // import, reactive params on `useFetch`) still fails native.
      supported: ['createHttp'],
      advice:
        'a same-file `const api = createHttp({ baseUrl })` + `const e = api.endpoint(\'GET /users/:id\')` DOES lower — `useFetch<T>(e({ params: { id: \'1\' } }))` resolves to a native fetch of the templated URL via PyreonFetch, and `useQuery<T>(() => e.query({ params: { id: \'1\' } }))` lowers to PyreonQuery. What stays web: reactive params on useFetch and a computed baseUrl. Middleware lowers only from INSIDE a literal `createHttp({ use: [bearer(…), retry(…), logger()] })` array — used anywhere else it stays web',
    },
  },
}
