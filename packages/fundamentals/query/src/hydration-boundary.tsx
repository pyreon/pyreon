import type { VNodeChild } from '@pyreon/core'
import { nativeCompat } from '@pyreon/core'
import type { DehydratedState, HydrateOptions } from '@tanstack/query-core'
import { hydrate } from '@tanstack/query-core'
import { useQueryClient } from './query-client'

export interface HydrationBoundaryProps {
  /**
   * Dehydrated cache produced by `dehydrate(queryClient)` on the server. The
   * queries/mutations it contains are merged into the nearest QueryClient
   * BEFORE children render, so a child's `useQuery` resolves from the
   * server-fetched cache instead of refetching.
   */
  state?: DehydratedState | null
  /** Forwarded to query-core's `hydrate` (e.g. `defaultOptions`). */
  options?: HydrateOptions
  children?: VNodeChild
}

/**
 * Hydrates a server-dehydrated query cache into the nearest QueryClient, then
 * renders its children — the ergonomic SSR companion to the `dehydrate` /
 * `hydrate` functions (mirrors TanStack's `<HydrationBoundary>`).
 *
 * Hydration happens once, synchronously, in component setup — before children
 * mount — so descendant `useQuery` calls see the hydrated data immediately
 * (no loading flash, no refetch). `state` is expected to be the static
 * dehydrated blob serialized from the server render.
 *
 * @example
 * // server: const state = dehydrate(queryClient)
 * // client:
 * h(QueryClientProvider, { client },
 *   h(HydrationBoundary, { state }, () => h(App, null)),
 * )
 */
export function HydrationBoundary(props: HydrationBoundaryProps): VNodeChild {
  const client = useQueryClient()
  if (props.state) hydrate(client, props.state, props.options)
  const ch = props.children
  return (typeof ch === 'function' ? (ch as () => VNodeChild)() : ch) as VNodeChild
}

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so the
// `useQueryClient()` (useContext) lookup + hydrate() run in Pyreon's setup
// frame, BEFORE children mount. Same rationale as QueryClientProvider.
nativeCompat(HydrationBoundary)
