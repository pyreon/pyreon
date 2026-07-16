/**
 * `@pyreon/testing/query` — test helpers for `@pyreon/query`.
 *
 *   renderWithQueryClient(<Todos/>)  // fresh, isolated, retry-off client
 *
 * Follows the TanStack Query testing convention: each test gets its OWN
 * `QueryClient` with `retry: false` (a failing query fails NOW instead of
 * retry-looping past the test timeout) and `gcTime: Infinity` (no
 * garbage-collect timers keeping the test process alive). Returns the render
 * result plus the `client` and a bound `setQueryData` passthrough for
 * seeding/patching cache state.
 *
 * Requires the optional peer `@pyreon/query`.
 */
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { QueryClientConfig } from '@pyreon/query'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import type { RenderOptions, RenderResult } from '@pyreon/testing'
import { render } from '@pyreon/testing'

/**
 * A `QueryClient` tuned for tests: `retry: false` (queries AND mutations) +
 * `gcTime: Infinity`. Pass a config to override — your `defaultOptions`
 * merge OVER the test defaults per option key.
 *
 * @example
 *   const client = createTestQueryClient()
 *   client.setQueryData(['todos'], [{ id: 1 }])
 */
export function createTestQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
        ...config.defaultOptions?.queries,
      },
      mutations: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
        ...config.defaultOptions?.mutations,
      },
    },
  })
}

export interface RenderWithQueryClientOptions extends RenderOptions {
  /** Bring your own client — e.g. one pre-seeded via `setQueryData`. Default: a fresh `createTestQueryClient()`. */
  client?: QueryClient
  /** Compose an OUTER wrapper around the provider tree. */
  wrapper?: (children: VNodeChild) => VNodeChild
}

export type RenderWithQueryClientResult = RenderResult & {
  /** The client the tree is running against. */
  client: QueryClient
  /** Bound passthrough — seed or patch cache entries mid-test. */
  setQueryData: QueryClient['setQueryData']
}

/**
 * Render `ui` under a `<QueryClientProvider>` with an isolated test client.
 *
 * @example
 *   const { client, setQueryData, findByText } = renderWithQueryClient(<Todos />)
 *   setQueryData(['todos'], [{ id: 1, title: 'write tests' }])
 *   await findByText('write tests')
 */
export function renderWithQueryClient(
  ui: VNodeChild,
  options: RenderWithQueryClientOptions = {},
): RenderWithQueryClientResult {
  const { client = createTestQueryClient(), wrapper, ...renderOptions } = options

  const tree = h(QueryClientProvider, { client }, ui)
  const result = render(wrapper ? wrapper(tree) : tree, renderOptions)

  return {
    ...result,
    client,
    setQueryData: client.setQueryData.bind(client),
  }
}
