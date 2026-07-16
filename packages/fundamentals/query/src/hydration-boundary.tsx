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
function HydrationBoundary(props: HydrationBoundaryProps): VNodeChild {
  const client = useQueryClient()
  if (props.state) hydrate(client, props.state, props.options)
  const ch = props.children
  return (typeof ch === 'function' ? (ch as () => VNodeChild)() : ch) as VNodeChild
}

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so the
// `useQueryClient()` (useContext) lookup + hydrate() run in Pyreon's setup
// frame, BEFORE children mount. Same rationale as QueryClientProvider.
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _HydrationBoundary = /* @__PURE__ */ nativeCompat(HydrationBoundary)
export { _HydrationBoundary as HydrationBoundary }