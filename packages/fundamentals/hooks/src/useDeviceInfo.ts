import { isClient } from '@pyreon/reactivity'

/** Which platform the code is running on. */
export type DevicePlatform = 'web' | 'ios' | 'android'

/** Physical screen geometry, in CSS pixels plus the backing scale factor. */
export type DeviceScreen = {
  width: number
  height: number
  /** Backing-store ratio — `devicePixelRatio` / `UIScreen.scale` / `density`. */
  scale: number
}

export type DeviceInfo = {
  /** `'web'` | `'ios'` | `'android'`. Known at COMPILE time on native. */
  platform: () => DevicePlatform
  /** Device model. **Empty string on web** — see the hook docs. */
  model: () => string
  /** OS version. **Empty string on web** — see the hook docs. */
  osVersion: () => string
  /** True when the primary input is touch. */
  isTouch: () => boolean
  /** Screen geometry. */
  screen: () => DeviceScreen
}

/**
 * Describe the device the app is running on — for branching behaviour by
 * platform, sizing to the real screen, and attaching device context to
 * analytics or a support ticket.
 *
 * ## What crosses, and what deliberately does not
 *
 * `platform`, `isTouch` and `screen` are true on all three targets.
 *
 * `model` and `osVersion` are **empty strings on the web**, and that is a
 * decision rather than an oversight. The browser has no reliable API for
 * either: `navigator.platform` is deprecated, User-Agent Client Hints are
 * Chromium-only, and parsing the UA string is a well-known source of wrong
 * answers that silently rot as browsers change their strings. Returning `''`
 * says "not knowable here"; returning a guess would put a plausible lie into
 * exactly the places these fields are used — analytics and support tickets —
 * where a wrong answer is worse than a missing one.
 *
 * Branch on `platform()` before reading them, or treat empty as unknown.
 *
 * @example
 * ```tsx
 * const device = useDeviceInfo()
 * <Show when={() => device.platform() !== 'web'}>
 *   <Text>{device.model()} · {device.osVersion()}</Text>
 * </Show>
 * ```
 */
export function useDeviceInfo(): DeviceInfo {
  // Read once: none of these change for the lifetime of a web document.
  // (Native re-reads per composition, where a fold or rotation can move
  // `screen` — the runtimes expose it as observable state for that reason.)
  const touch =
    isClient && typeof navigator !== 'undefined'
      ? navigator.maxTouchPoints > 0 || 'ontouchstart' in globalThis
      : false

  const geometry: DeviceScreen =
    isClient && typeof screen !== 'undefined'
      ? {
          width: screen.width,
          height: screen.height,
          scale: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
        }
      : { width: 0, height: 0, scale: 1 }

  return {
    platform: () => 'web',
    // Not knowable on the web — see the hook docs for why this is not a guess.
    model: () => '',
    osVersion: () => '',
    isTouch: () => touch,
    screen: () => geometry,
  }
}
