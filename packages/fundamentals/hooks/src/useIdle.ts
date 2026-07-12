import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/** Activity events that reset the idle timer by default. */
const DEFAULT_EVENTS: readonly string[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
]

export interface UseIdleOptions {
  /** DOM events (on `document`) that count as activity. Defaults to pointer / key / scroll. */
  events?: readonly string[]
  /** Start in the idle state before any timer elapses (default `false`). */
  initialState?: boolean
}

/**
 * Reactive user-idle detection — `true` once no activity event has fired for
 * `timeoutMs`, back to `false` on the next interaction. Every listener and the
 * timer are removed on unmount.
 *
 * Common uses: auto-logout, "are you still there?" prompts, presence
 * away-status, pausing background work.
 *
 * SSR-safe (the listeners register in `onMount`, so the server just holds the
 * initial state).
 *
 * @param timeoutMs - inactivity window before going idle (default 60000)
 *
 * @example
 * ```tsx
 * const idle = useIdle(30_000)
 * effect(() => { if (idle()) showAwayBanner() })
 * ```
 */
export function useIdle(timeoutMs = 60_000, options?: UseIdleOptions): () => boolean {
  const idle = signal(options?.initialState ?? false)

  onMount(() => {
    const events = options?.events ?? DEFAULT_EVENTS
    // Initialized straight away, so `clearTimeout(timer)` is always valid (no
    // `| undefined` guard needed) and the idle countdown starts on mount.
    let timer = setTimeout(() => idle.set(true), timeoutMs)

    const onActivity = () => {
      idle.set(false) // no-op notify when already active (Object.is gate)
      clearTimeout(timer)
      timer = setTimeout(() => idle.set(true), timeoutMs)
    }

    for (const e of events) document.addEventListener(e, onActivity, { passive: true })

    return () => {
      clearTimeout(timer)
      for (const e of events) document.removeEventListener(e, onActivity)
    }
  })

  return idle
}

export default useIdle
