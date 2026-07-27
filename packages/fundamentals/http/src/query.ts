/**
 * `@pyreon/http/query` — adapters for `@pyreon/query`.
 *
 * These emit PLAIN objects that structurally satisfy TanStack's option
 * shapes, so this module has no dependency on `@pyreon/query` at all — the
 * adapter direction is deliberate: query knows nothing about http, and http
 * knows nothing about query.
 *
 * Prefer `endpoint.query(...)` (see `endpoint.ts`) — it derives the key
 * from the same declaration as the URL, which is the drift this package
 * exists to prevent. `toQueryOptions` below is the escape hatch for ad-hoc
 * requests that do not warrant an endpoint.
 *
 * ## The cancellation contract
 *
 * `queryFn` receives `{ signal }` and it is always present. Forwarding it
 * is the whole point: `@pyreon/feature`'s hand-rolled client calls
 * `queryFn: () => http.getById(api, id)` with no signal at all, so
 * TanStack's cancellation is silently dead there today.
 */

import type { HttpClient } from './client'
import type { EndpointKey, QueryOptionsLike } from './endpoint'
import type { RequestOptions, Validator } from './types'

/** Options for {@link toQueryOptions}. */
export interface ToQueryOptions<T> extends Omit<RequestOptions, 'signal'> {
  /** Cache key. Defaults to `['GET', path, { params, query }]`. */
  queryKey?: EndpointKey | undefined
  /** Validates and types the response. */
  response?: Validator<T> | undefined
}

/**
 * Build `{ queryKey, queryFn }` for an ad-hoc GET.
 *
 * ```ts
 * const q = useQuery(() => toQueryOptions(api, `/users/${id()}`))
 * ```
 */
export function toQueryOptions<T = unknown>(
  client: HttpClient,
  path: string,
  options: ToQueryOptions<T> = {},
): QueryOptionsLike<T> {
  const { queryKey, response, ...requestOptions } = options

  const scope: Record<string, unknown> = {}
  if (requestOptions.params) scope.params = requestOptions.params
  if (requestOptions.query) scope.query = requestOptions.query

  return {
    queryKey:
      queryKey ?? (Object.keys(scope).length > 0 ? ['GET', path, scope] : ['GET', path]),
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<T> => {
      const request = client.get(path, { ...requestOptions, signal })
      return (response ? request.json(response as Validator<unknown>) : request.json()) as Promise<T>
    },
  }
}

export type { QueryOptionsLike, MutationOptionsLike } from './endpoint'
