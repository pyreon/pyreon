import { isClient, onCleanup, signal } from '@pyreon/reactivity'

/**
 * Insets, in CSS pixels, that content must avoid: notch / Dynamic Island,
 * home indicator, gesture bar, rounded corners.
 */
export type SafeAreaInsets = {
  top: number
  right: number
  bottom: number
  left: number
}

const ZERO: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * The safe-area insets of the current display.
 *
 * This is the one device fact a multiplatform app cannot work around at the
 * app level: without it, content draws under the notch and the home indicator,
 * or every screen pads by a hard-coded guess that is wrong on the next device.
 *
 * Returns ONE accessor rather than four, because the values change together —
 * a rotation moves all of them, and reading them from separate accessors
 * invites a torn pair.
 *
 * ## Where the numbers come from
 *
 * - web — `env(safe-area-inset-*)`, read off a probe element, since CSS
 *   environment variables are not exposed to script any other way. Requires
 *   `viewport-fit=cover` in the viewport meta; without it the browser reports
 *   zeros, which is correct (nothing is obscured) rather than broken.
 * - iOS — `safeAreaInsets`
 * - Android — `WindowInsets`
 *
 * @example
 * ```tsx
 * const safe = useSafeArea()
 * <Stack style={() => ({ paddingTop: `${safe().top}px` })}>…</Stack>
 * ```
 */
export function useSafeArea(): () => SafeAreaInsets {
  const insets = signal<SafeAreaInsets>(ZERO)

  if (isClient) {
    // A probe element is the only way to read env() from script: the values
    // exist in the CSS environment, not on any DOM object. It is inert —
    // fixed, zero-size, no pointer events, aria-hidden — so it can never
    // affect layout or be announced.
    const probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:0',
      'height:0',
      'visibility:hidden',
      'pointer-events:none',
      'padding-top:env(safe-area-inset-top,0px)',
      'padding-right:env(safe-area-inset-right,0px)',
      'padding-bottom:env(safe-area-inset-bottom,0px)',
      'padding-left:env(safe-area-inset-left,0px)',
    ].join(';')

    const read = () => {
      const cs = getComputedStyle(probe)
      const px = (v: string) => {
        const n = Number.parseFloat(v)
        return Number.isFinite(n) ? n : 0
      }
      const next: SafeAreaInsets = {
        top: px(cs.paddingTop),
        right: px(cs.paddingRight),
        bottom: px(cs.paddingBottom),
        left: px(cs.paddingLeft),
      }
      const cur = insets.peek()
      // Only write on a real change: this runs on every resize, and an
      // unconditional set would re-run every consumer on a horizontal drag
      // that never moved an inset.
      if (
        next.top !== cur.top ||
        next.right !== cur.right ||
        next.bottom !== cur.bottom ||
        next.left !== cur.left
      ) {
        insets.set(next)
      }
    }

    document.body.append(probe)
    read()

    // Rotation and window resize both move these. `orientationchange` fires
    // before the new metrics settle on some engines, so resize is the
    // load-bearing one and orientation is belt-and-braces.
    window.addEventListener('resize', read)
    window.addEventListener('orientationchange', read)
    onCleanup(() => {
      window.removeEventListener('resize', read)
      window.removeEventListener('orientationchange', read)
      probe.remove()
    })
  }

  return insets
}
