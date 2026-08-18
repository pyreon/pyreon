import { isClient, onCleanup, signal } from '@pyreon/reactivity'

import { warnIfInsecureContext } from './secure-context'

/**
 * The slice of `WakeLockSentinel` this hook uses. `addEventListener` is
 * optional so an older engine that predates the event still works — it just
 * loses the re-acquire, which is exactly the pre-normalization behaviour.
 */
type Sentinel = {
  release: () => Promise<void>
  addEventListener?: (type: 'release', handler: () => void) => void
}

/** A held screen wake lock — the screen stays awake while `active()` is true. */
export type WakeLockControls = {
  /** True while the screen is being kept awake. */
  active: () => boolean
  /** True when the platform can hold a wake lock at all. */
  supported: () => boolean
  /** Acquire the lock. Resolves to whether it was actually acquired. */
  request: () => Promise<boolean>
  /** Release the lock. Safe to call when not held. */
  release: () => Promise<void>
}

/**
 * Keep the screen awake — for a video player, a navigation view, a recipe
 * step, anything the user watches without touching.
 *
 * ## The web default is NOT the native behaviour, so this normalizes it
 *
 * A `WakeLockSentinel` is released by the browser whenever the document
 * becomes hidden, and it is NOT reacquired when you come back — so on the web
 * a tab switch silently ends the lock. On iOS and Android the equivalent flag
 * survives backgrounding: the app resumes with the screen still held.
 *
 * Leaving that difference in place would make this hook mirrored rather than
 * 1:1 — the same call producing a screen that sleeps on one target and stays
 * lit on the other. So the web arm re-acquires on `visibilitychange` whenever
 * the caller has not released, which is the behaviour the native targets
 * already have.
 *
 * @example
 * ```tsx
 * const wake = useWakeLock()
 * onMount(() => { void wake.request() })
 * <Show when={() => wake.active()}><Badge>Screen stays on</Badge></Show>
 * ```
 */
export function useWakeLock(): WakeLockControls {
  const active = signal(false)
  // The caller's INTENT, distinct from whether a lock is currently held.
  // A browser-initiated release on tab-hide must not look like the caller
  // releasing, or the visibility handler could not tell them apart.
  let wanted = false
  let sentinel: Sentinel | null = null

  const supported = () => {
    const ok = isClient && typeof navigator !== 'undefined' && 'wakeLock' in navigator
    if (!ok) warnIfInsecureContext('useWakeLock')
    return ok
  }

  const acquire = async (): Promise<boolean> => {
    // Guard inline rather than through `supported()`. The SSR lint rule
    // cannot trace a cross-function guard, and an explicit early return
    // documents the contract at the site that actually touches the global.
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      warnIfInsecureContext('useWakeLock')
      return false
    }
    if (sentinel !== null) return active()
    try {
      const nav = navigator as Navigator & {
        wakeLock: { request: (t: string) => Promise<Sentinel> }
      }
      const held = await nav.wakeLock.request('screen')
      sentinel = held
      // The browser releases the sentinel itself when the document hides,
      // and tells us ONLY through this event. Without listening, `sentinel`
      // would stay non-null forever and the visibility handler below could
      // never re-acquire — the normalization would be documented but dead.
      held.addEventListener?.('release', () => {
        if (sentinel === held) {
          sentinel = null
          active.set(false)
        }
      })
      active.set(true)
      return true
    } catch {
      // A rejected request is an ordinary outcome, not an error worth
      // throwing: low battery and background tabs both refuse.
      active.set(false)
      return false
    }
  }

  if (isClient) {
    const onVisible = () => {
      if (wanted && document.visibilityState === 'visible' && sentinel === null) {
        void acquire()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    onCleanup(() => {
      document.removeEventListener('visibilitychange', onVisible)
      // A lock outliving its view keeps the user's screen lit with nothing
      // on it — the battery-drain shape of the listener-pile-up leak class.
      wanted = false
      void sentinel?.release()
      sentinel = null
    })
  }

  return {
    active,
    supported,
    request: () => {
      wanted = true
      return acquire()
    },
    release: async () => {
      wanted = false
      active.set(false)
      const held = sentinel
      sentinel = null
      await held?.release()
    },
  }
}
