import type { VNodeChild } from '@pyreon/core'
import { nativeCompat, onMount, provide } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { QueryClient } from '@tanstack/query-core'
import type { PersistQueryClientOptions } from '@tanstack/query-persist-client-core'
import { IsRestoringContext } from './is-restoring'
import { persistQueryClient } from './persist-mutations'
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
 * A paused mutation is persisted (as TanStack persists it), and so is one
 * whose request is in flight when its `mutationKey` resolves to a function
 * registered with `client.setMutationDefaults(mutationKey, { mutationFn })`,
 * until it settles; both are resumed once restoration settles. Never one
 * marked `meta: { persist: false }`. Another tab takes a mutation over only
 * once the tab that owns it has closed. A function cannot be serialised, so a
 * restored mutation finds its function by `mutationKey`. Delivery is
 * at-least-once: make the endpoint idempotent. See `shouldPersistMutation`.
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
function PersistQueryClientProvider(props: PersistQueryClientProviderProps): VNodeChild {
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

    // A persisted mutation whose owner page is gone is restored as paused
    // (persist-mutations.ts). Nothing resumes it by itself: query-core
    // only resumes on an offline -> online transition or a focus event, and a
    // page that loads while already online and focused sees neither. So resume
    // once restoration settles (the same step TanStack's own persist providers
    // take). A no-op when nothing is paused; a still-offline client keeps them
    // paused.
    const settle = (): void => {
      isRestoring.set(false)
      void props.client.resumePausedMutations()
    }

    restorePromise
      .then(async () => {
        if (cancelled) return
        try {
          await props.onSuccess?.()
        } finally {
          settle()
        }
      })
      .catch(async () => {
        if (cancelled) return
        try {
          await props.onError?.()
        } finally {
          settle()
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
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _PersistQueryClientProvider = /* @__PURE__ */ nativeCompat(PersistQueryClientProvider)
export { _PersistQueryClientProvider as PersistQueryClientProvider }
