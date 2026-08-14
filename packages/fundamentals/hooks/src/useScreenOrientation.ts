import { isClient, onCleanup, signal } from '@pyreon/reactivity'

/** Which way round the display currently is. */
export type ScreenOrientation = 'portrait' | 'landscape'

export type OrientationState = {
  /** `'portrait'` | `'landscape'` — the part that crosses all three targets. */
  type: () => ScreenOrientation
  /** Rotation in degrees: 0 / 90 / 180 / 270. Carries primary vs secondary. */
  angle: () => number
}

/**
 * Which way the display is currently oriented.
 *
 * ## Read-only, deliberately
 *
 * Orientation *locking* is not part of this hook. It does not cross: on the
 * web `screen.orientation.lock()` is Chromium-only and requires fullscreen;
 * on iOS it is an app-level declaration (`supportedInterfaceOrientations`),
 * not something a view can ask for. A `lock()` that silently no-ops on two of
 * three targets is worse than one that says what it covers — the same call
 * the `useBluetooth` surface makes about GATT.
 *
 * `type` is normalised to `'portrait' | 'landscape'` because that is what is
 * true everywhere; the primary/secondary distinction the web exposes lives in
 * `angle`, so nothing is lost.
 *
 * @example
 * ```tsx
 * const o = useScreenOrientation()
 * <Show when={() => o.type() === 'landscape'}><WideLayout /></Show>
 * ```
 */
export function useScreenOrientation(): OrientationState {
  const read = (): { type: ScreenOrientation; angle: number } => {
    if (!isClient || typeof screen === 'undefined') {
      // SSR has no display. Portrait is the honest default: it is what a
      // phone-first render should assume, and the value corrects on mount.
      return { type: 'portrait', angle: 0 }
    }
    const so = (screen as Screen & { orientation?: { type?: string; angle?: number } })
      .orientation
    if (so?.type !== undefined) {
      return {
        type: so.type.startsWith('landscape') ? 'landscape' : 'portrait',
        angle: typeof so.angle === 'number' ? so.angle : 0,
      }
    }
    // Older engines without Screen Orientation API: derive from geometry.
    // Equal width and height is square — call it portrait rather than
    // inventing a third state no target can express.
    return {
      type: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
      angle: 0,
    }
  }

  const state = signal(read())

  if (isClient) {
    const update = () => {
      const next = read()
      const cur = state.peek()
      // Resize fires continuously during a drag; only a real change should
      // wake consumers.
      if (next.type !== cur.type || next.angle !== cur.angle) state.set(next)
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    onCleanup(() => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    })
  }

  return {
    type: () => state().type,
    angle: () => state().angle,
  }
}
