// useHaptics — fire-and-forget haptic feedback.
//
// A cross-platform imperative hook (no reactive state): call a method
// on a user tap to trigger device haptics. Mirrors the shape the PMTC
// native compiler recognizes — `const h = useHaptics(); h.impact('light')`
// lowers to `PyreonHaptics` on iOS (UIImpactFeedbackGenerator etc.) and
// Android (Compose LocalHapticFeedback), and runs `navigator.vibrate` on
// the web.
//
// HONEST platform note: web + Android are COARSER than iOS. iOS exposes
// five impact styles + three notification types + a distinct selection
// tick (the full UIFeedbackGenerator family). The web maps each to a
// `navigator.vibrate` duration/pattern (a crude buzz, and a no-op on
// desktop / unsupported browsers). Android's Compose `LocalHapticFeedback`
// exposes only two feedback types, so several styles collapse onto the
// nearest available constant. The API surface is uniform; the fidelity is
// not — that is a genuine platform difference, not a bug.

/** iOS impact-generator styles (the richest surface; web/Android approximate). */
export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid'
/** Notification-feedback outcomes. */
export type HapticNotificationType = 'success' | 'warning' | 'error'

export interface UseHapticsResult {
  /** A physical impact (button press, toggle). Defaults to `'medium'`. */
  impact: (style?: HapticImpactStyle) => void
  /** A semantic outcome (form submit success, validation error). */
  notification: (type: HapticNotificationType) => void
  /** A light tick for a discrete selection change (picker, segmented control). */
  selection: () => void
}

// Web `navigator.vibrate` approximations. Durations in ms; notification
// uses a buzz-pause-buzz pattern so the three outcomes feel distinct.
const IMPACT_MS: Record<HapticImpactStyle, number> = {
  light: 10,
  medium: 20,
  heavy: 30,
  soft: 15,
  rigid: 25,
}
const NOTIFICATION_PATTERN: Record<HapticNotificationType, number[]> = {
  success: [10, 50, 10],
  warning: [20, 40, 20],
  error: [30, 30, 30, 30, 30],
}

/**
 * Trigger device haptics imperatively.
 *
 * @example
 * ```tsx
 * const haptics = useHaptics()
 *
 * <button onClick={() => { save(); haptics.notification('success') }}>
 *   Save
 * </button>
 * ```
 */
export function useHaptics(): UseHapticsResult {
  const vibrate = (pattern: number | number[]): void => {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    try {
      navigator.vibrate(pattern)
    } catch {
      // Some browsers throw on certain patterns / when the page is
      // backgrounded — a haptic is best-effort, never fatal.
    }
  }

  return {
    impact: (style = 'medium') => vibrate(IMPACT_MS[style] ?? IMPACT_MS.medium),
    notification: (type) => vibrate(NOTIFICATION_PATTERN[type] ?? NOTIFICATION_PATTERN.warning),
    selection: () => vibrate(5),
  }
}
