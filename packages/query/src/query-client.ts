import { createContext, pushContext, popContext, onMount, onUnmount, useContext } from "@pyreon/core"
import type { VNodeChild, VNode } from "@pyreon/core"
import type { QueryClient } from "@tanstack/query-core"
import type { Props } from "@pyreon/core"

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
export function QueryClientProvider(props: QueryClientProviderProps): VNode {
  // Push synchronously so all descendant component functions see the context.
  // Pop on unmount (matches the HeadProvider pattern in @pyreon/head).
  const frame = new Map([[QueryClientContext.id, props.client]])
  pushContext(frame)

  // client.mount() activates window focus refetching and online/offline handling.
  // client.unmount() unsubscribes focusManager + onlineManager when the provider leaves the tree.
  onMount(() => {
    props.client.mount()
    return () => props.client.unmount()
  })

  onUnmount(() => popContext())

  const ch = props.children
  return (typeof ch === "function" ? (ch as () => VNodeChild)() : ch) as VNode
}

/**
 * Returns the nearest QueryClient provided by <QueryClientProvider>.
 * Throws if called outside of one.
 */
export function useQueryClient(): QueryClient {
  const client = useContext(QueryClientContext)
  if (!client) {
    throw new Error(
      "[pyreon/query] No QueryClient found. Wrap your app with <QueryClientProvider client={client}>.",
    )
  }
  return client
}
