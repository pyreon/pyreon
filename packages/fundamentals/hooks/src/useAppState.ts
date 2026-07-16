import { isClient, onCleanup, signal } from '@pyreon/reactivity'

/** App lifecycle phase — the cross-platform union `useAppState` reports. */
export type AppStatePhase = 'active' | 'background' | 'inactive'

/**
 * Reactive app lifecycle phase:
 * - `'active'` — foreground AND focused (the app is front-and-center)
 * - `'inactive'` — visible but NOT focused (a transitional state — another
 *   window is focused, or the app is mid-transition)
 * - `'background'` — hidden (tab switched away, window minimized, app backgrounded)
 *
 * Mirrors the native lifecycle channels — SwiftUI `ScenePhase` /
 * `UIApplication` notifications and Android `ProcessLifecycleOwner` — so ONE
 * shared source reads the same value on web + iOS + Android. Returns an
 * accessor (read `state()` in a reactive scope). SSR-safe: reports `'active'`
 * on the server.
 *
 * @example
 * ```tsx
 * const state = useAppState()
 * // Pause a live poll while the app isn't in the foreground:
 * <Show when={() => state() === 'active'}><LivePoll /></Show>
 * ```
 */
export function useAppState(): () => AppStatePhase {
  const phase = signal<AppStatePhase>(computeAppPhase())

  if (isClient) {
    const update = () => phase.set(computeAppPhase())
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    onCleanup(() => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    })
  }

  return phase
}

/** Derive the current phase from the DOM visibility + focus state. */
function computeAppPhase(): AppStatePhase {
  if (!isClient) return 'active'
  if (document.visibilityState === 'hidden') return 'background'
  return document.hasFocus() ? 'active' : 'inactive'
}
