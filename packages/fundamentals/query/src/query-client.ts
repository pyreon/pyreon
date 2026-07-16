import type { Props, VNode, VNodeChild } from '@pyreon/core'
import { createContext, nativeCompat, onMount, provide, useContext } from '@pyreon/core'
import type { QueryClient } from '@tanstack/query-core'

export interface QueryClientProviderProps extends Props {
  client: QueryClient
  children?: VNodeChild
}

export const QueryClientContext = createContext<QueryClient | null>(null)

/**
 * Provides a QueryClient to all descendant components via context.
 * Wrap your app root with this to enable useQuery / useMutation throughout the tree.
 *
 * @example
 * const client = new QueryClient()
 * mount(h(QueryClientProvider, { client }, h(App, null)), el)
 */
function QueryClientProvider(props: QueryClientProviderProps): VNode {
  provide(QueryClientContext, props.client)

  // client.mount() activates window focus refetching and online/offline handling.
  // client.unmount() unsubscribes focusManager + onlineManager when the provider leaves the tree.
  onMount(() => {
    props.client.mount()
    return () => props.client.unmount()
  })

  const ch = props.children
  return (typeof ch === 'function' ? (ch as () => VNodeChild)() : ch) as VNode
}

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// QueryClientProvider's provide() + onMount() (focusManager / onlineManager
// activation) run inside Pyreon's setup frame.
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _QueryClientProvider = /* @__PURE__ */ nativeCompat(QueryClientProvider)
export { _QueryClientProvider as QueryClientProvider }
/**
 * Returns the nearest QueryClient provided by <QueryClientProvider>.
 * Throws if called outside of one.
 */
export function useQueryClient(): QueryClient {
  const client = useContext(QueryClientContext)
  if (!client) {
    throw new Error(
      '[Pyreon] No QueryClient found. Wrap your app with <QueryClientProvider client={client}>.',
    )
  }
  return client
}
