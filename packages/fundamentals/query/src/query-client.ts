import type { Props, VNode, VNodeChild } from '@pyreon/core'
import { createContext, onMount, provide, useContext } from '@pyreon/core'
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
export function QueryClientProvider(props: QueryClientProviderProps): VNode {
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

/**
 * Returns the nearest QueryClient provided by <QueryClientProvider>.
 * Throws if called outside of one.
 */
export function useQueryClient(): QueryClient {
  const client = useContext(QueryClientContext)
  if (!client) {
    throw new Error(
      '[@pyreon/query] No QueryClient found. Wrap your app with <QueryClientProvider client={client}>.',
    )
  }
  return client
}
