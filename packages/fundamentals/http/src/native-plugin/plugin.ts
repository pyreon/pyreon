import { NATIVE_COMPILER_PLUGIN_API_VERSION, type CompilerPlugin } from '@pyreon/native-compiler/plugin-api'
import { httpRequestSource, scanHttp } from './endpoint'
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
export const httpPlugin: CompilerPlugin = {
  name: HTTP_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/http'],
  scanModule: scanHttp,
  requestSources: [httpRequestSource],
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
        'a same-file `const api = createHttp({ baseUrl })` + `const e = api.endpoint(\'GET /users/:id\')` DOES lower — `useFetch<T>(e({ params: { id: \'1\' } }))` resolves to a native fetch of the templated URL via PyreonFetch, and `useQuery<T>(() => e.query({ params: { id: \'1\' } }))` lowers to PyreonQuery. What stays web: reactive params and a computed baseUrl',
    },
  },
}
