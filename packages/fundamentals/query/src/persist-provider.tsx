import type { VNodeChild } from '@pyreon/core'
import { nativeCompat, onMount, provide } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { QueryClient } from '@tanstack/query-core'
import type { PersistQueryClientOptions } from '@tanstack/query-persist-client-core'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { IsRestoringContext } from './is-restoring'
import { QueryClientContext } from './query-client'

export interface PersistQueryClientProviderProps {
  /** The QueryClient to persist + provide. */
  client: QueryClient
  /** Persist options (persister, maxAge, buster, …) — `queryClient` is supplied for you. */
  persistOptions: Omit<PersistQueryClientOptions, 'queryClient'>
  /** Called after the cache is restored (mirrors TanStack). */
  onSuccess?: () => unknown | Promise<unknown>
  /** Called if restoration fails. */
  onError?: () => unknown | Promise<unknown>
  children?: VNodeChild
}

/**
 * Drop-in replacement for `<QueryClientProvider>` that ALSO restores the query
 * cache from a persister on mount and keeps it persisted on every change — the
 * offline / reload-survival story (mirrors TanStack's
 * `PersistQueryClientProvider`).
 *
 * It provides both the `QueryClient` and the reactive `isRestoring` flag, so
 * descendant `useQuery` calls DEFER their first fetch until restoration
 * completes (no redundant network request for data the cache is about to
 * restore). Gate UI on `useIsRestoring()` during the async restore window.
 *
 * Import from `@pyreon/query/persist`.
 *
 * @example
 * import { PersistQueryClientProvider, createSyncStoragePersister } from '@pyreon/query/persist'
 *
 * const persister = createSyncStoragePersister({ storage: localStorage })
 * <PersistQueryClientProvider client={client} persistOptions={{ persister }}>
 *   <App />
 * </PersistQueryClientProvider>
 */
export function PersistQueryClientProvider(props: PersistQueryClientProviderProps): VNodeChild {
  const isRestoring = signal(true)

  provide(QueryClientContext, props.client)
  provide(IsRestoringContext, () => isRestoring())

  onMount(() => {
    props.client.mount()
    let cancelled = false
    isRestoring.set(true)

    const [unsubscribe, restorePromise] = persistQueryClient({
      ...props.persistOptions,
      queryClient: props.client,
    })

    restorePromise
      .then(async () => {
        if (cancelled) return
        try {
          await props.onSuccess?.()
        } finally {
          isRestoring.set(false)
        }
      })
      .catch(async () => {
        if (cancelled) return
        try {
          await props.onError?.()
        } finally {
          isRestoring.set(false)
        }
      })

    return () => {
      cancelled = true
      unsubscribe()
      props.client.unmount()
    }
  })

  const ch = props.children
  return (typeof ch === 'function' ? (ch as () => VNodeChild)() : ch) as VNodeChild
}

// Marked native — provide() + onMount() must run in Pyreon's setup frame under
// compat runtimes (same rationale as QueryClientProvider).
nativeCompat(PersistQueryClientProvider)
