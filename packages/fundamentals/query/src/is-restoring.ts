import type { VNodeChild } from '@pyreon/core'
import { createReactiveContext, nativeCompat, provide, useContext } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'

/**
 * Reactive flag: is the QueryClient cache currently being restored from a
 * persister? Provided by `<PersistQueryClientProvider>` (or a manual
 * `<IsRestoringProvider>`); defaults to `false` (no restoration in progress)
 * when no provider is mounted.
 */
export const IsRestoringContext = createReactiveContext<boolean>(false)

/**
 * Reactive accessor — `true` while the persisted cache is being restored.
 * Gate UI on it (a splash / skeleton) during async restore. Returns
 * `() => false` when there's no persistence layer.
 *
 * @example
 * const isRestoring = useIsRestoring()
 * <Show when={() => !isRestoring()} fallback={<Splash />}>{() => <App />}</Show>
 */
export function useIsRestoring(): () => boolean {
  return useContext(IsRestoringContext)
}

export interface IsRestoringProviderProps {
  /** Boolean or accessor — the restoring flag descendants read via `useIsRestoring()`. */
  value: boolean | (() => boolean)
  children?: VNodeChild
}

/**
 * Provides the `isRestoring` flag to descendants. Usually you don't render this
 * directly — `<PersistQueryClientProvider>` provides it for you. Use it
 * standalone only for a custom restoration flow.
 */
function IsRestoringProvider(props: IsRestoringProviderProps): VNodeChild {
  provide(IsRestoringContext, () =>
    typeof props.value === 'function' ? (props.value as () => boolean)() : props.value,
  )
  const ch = props.children
  return (typeof ch === 'function' ? (ch as () => VNodeChild)() : ch) as VNodeChild
}

// Marked native so provide() runs in Pyreon's setup frame under compat runtimes.
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _IsRestoringProvider = /* @__PURE__ */ nativeCompat(IsRestoringProvider)
export { _IsRestoringProvider as IsRestoringProvider }
/**
 * Subscribe `observer` via `listener`, DEFERRING the subscription until
 * `isRestoring()` is `false`. The faithful-to-TanStack gate that keeps a query
 * from firing a network fetch the about-to-be-restored cache would make
 * redundant.
 *
 * When no `<PersistQueryClientProvider>` is mounted, `isRestoring()` is always
 * `false`, so the inner effect subscribes SYNCHRONOUSLY on its first run —
 * byte-equivalent to a bare `observer.subscribe(listener)` (Pyreon effects run
 * immediately on creation). During restoration the subscription is held off;
 * once `isRestoring` flips to `false` the effect re-runs and subscribes (the
 * observer then reconciles against the now-restored cache).
 *
 * Returns an unsubscribe. Subscribes at most once (`isRestoring` only ever
 * transitions `true → false`).
 */
export function subscribeWhenRestored<TResult>(
  observer: { subscribe(listener: (result: TResult) => void): () => void },
  isRestoring: () => boolean,
  listener: (result: TResult) => void,
): () => void {
  let unsub: (() => void) | null = null
  effect(() => {
    if (unsub) return
    if (isRestoring()) return
    unsub = observer.subscribe(listener)
  })
  return () => unsub?.()
}
