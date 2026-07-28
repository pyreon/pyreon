// The web half of `useGeolocation`, which did not exist.
//
// PMTC has lowered `useGeolocation()` to `PyreonGeolocation` on both native
// targets since Phase 5, and the compiler's lowered-hook allowlist lists it —
// but there was no web implementation, no export, and no type anywhere in
// `packages/`. `import { useGeolocation } from '@pyreon/hooks'` did not
// resolve, so an app using it could not build for web at all.
//
// The SHAPE is the contract that makes it shared code. PMTC reads
// `geo.latitude` / `geo.start()` as MEMBERS on the native container, so the web
// object exposes exactly those names as getters over signals. Returning bare
// signals would force `geo.latitude()` on web and diverge from the native
// member read — the exact mismatch that made `@pyreon/form` non-shared.

import { describe, expect, it, vi } from 'vitest'
import { useGeolocation } from '../useGeolocation'

type WatchSuccess = (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void
type WatchError = (err: { message: string }) => void

/** Installs a controllable `navigator.geolocation`; returns the handles. */
function installGeolocation() {
  let success: WatchSuccess | undefined
  let failure: WatchError | undefined
  const clearWatch = vi.fn()
  const watchPosition = vi.fn((ok: WatchSuccess, err: WatchError) => {
    success = ok
    failure = err
    return 42
  })
  const original = (globalThis as { navigator?: unknown }).navigator
  Object.defineProperty(globalThis, 'navigator', {
    value: { geolocation: { watchPosition, clearWatch } },
    configurable: true,
    writable: true,
  })
  return {
    watchPosition,
    clearWatch,
    emit: (latitude: number, longitude: number, accuracy = 5) =>
      success?.({ coords: { latitude, longitude, accuracy } }),
    fail: (message: string) => failure?.({ message }),
    restore: () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: original,
        configurable: true,
        writable: true,
      })
    },
  }
}

describe('useGeolocation (web)', () => {
  it('reports nulls before any fix — matching the native Double?', () => {
    const g = installGeolocation()
    try {
      const geo = useGeolocation()
      expect(geo.latitude).toBeNull()
      expect(geo.longitude).toBeNull()
      expect(geo.accuracy).toBeNull()
      expect(geo.error).toBeNull()
      expect(geo.isTracking).toBe(false)
      // Nothing starts on construction — a watch is a battery cost, so it is
      // opt-in, same as the native container.
      expect(g.watchPosition).not.toHaveBeenCalled()
    } finally {
      g.restore()
    }
  })

  it('start() watches, and a fix updates every field', () => {
    const g = installGeolocation()
    try {
      const geo = useGeolocation()
      geo.start()
      expect(geo.isTracking).toBe(true)
      g.emit(37.3349, -122.009, 8)
      expect(geo.latitude).toBe(37.3349)
      expect(geo.longitude).toBe(-122.009)
      expect(geo.accuracy).toBe(8)
      expect(geo.error).toBeNull()
    } finally {
      g.restore()
    }
  })

  it('start() is idempotent — a second call does not open a second watch', () => {
    const g = installGeolocation()
    try {
      const geo = useGeolocation()
      geo.start()
      geo.start()
      expect(g.watchPosition).toHaveBeenCalledTimes(1)
    } finally {
      g.restore()
    }
  })

  it('stop() clears the watch and is safe before start / twice', () => {
    const g = installGeolocation()
    try {
      const geo = useGeolocation()
      // Before start: must not throw and must not call clearWatch(undefined).
      geo.stop()
      expect(g.clearWatch).not.toHaveBeenCalled()

      geo.start()
      geo.stop()
      expect(g.clearWatch).toHaveBeenCalledWith(42)
      expect(geo.isTracking).toBe(false)

      geo.stop()
      expect(g.clearWatch).toHaveBeenCalledTimes(1)
    } finally {
      g.restore()
    }
  })

  it('an error surfaces AND clears isTracking', () => {
    const g = installGeolocation()
    try {
      const geo = useGeolocation()
      geo.start()
      g.fail('User denied Geolocation')
      // Prefixed for identification (the `no-error-without-prefix` gate), but
      // the browser's own message must still survive — an app reporting these
      // needs the actual cause, not just a framework tag.
      expect(geo.error).toContain('[Pyreon]')
      expect(geo.error).toContain('User denied Geolocation')
      // A denial ends the watch on every browser; leaving isTracking stuck
      // true would misreport the state forever.
      expect(geo.isTracking).toBe(false)
    } finally {
      g.restore()
    }
  })

  it('after an error, start() can open a fresh watch', () => {
    const g = installGeolocation()
    try {
      const geo = useGeolocation()
      geo.start()
      g.fail('timeout')
      geo.start()
      expect(g.watchPosition).toHaveBeenCalledTimes(2)
      // The retry clears the stale error rather than leaving it visible.
      expect(geo.error).toBeNull()
    } finally {
      g.restore()
    }
  })

  it('is SSR-safe: no navigator means an error, not a throw', () => {
    const original = (globalThis as { navigator?: unknown }).navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    try {
      const geo = useGeolocation()
      expect(() => geo.start()).not.toThrow()
      expect(geo.error).toContain('[Pyreon]')
      expect(geo.error).toContain('unavailable')
      expect(geo.isTracking).toBe(false)
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: original,
        configurable: true,
        writable: true,
      })
    }
  })

  it('forwards PositionOptions', () => {
    const g = installGeolocation()
    try {
      useGeolocation({ enableHighAccuracy: true, timeout: 1234, maximumAge: 99 }).start()
      expect(g.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
        enableHighAccuracy: true,
        timeout: 1234,
        maximumAge: 99,
      })
    } finally {
      g.restore()
    }
  })

  // The shared-code contract: these names are what PMTC emits as members on
  // the native container. A rename here silently breaks the native targets,
  // which resolve nothing at compile time — they match on NAME.
  it('exposes the exact member names the native containers use', () => {
    const g = installGeolocation()
    try {
      const geo = useGeolocation()
      for (const field of ['latitude', 'longitude', 'accuracy', 'error', 'isTracking']) {
        expect(field in geo, `missing reactive field: ${field}`).toBe(true)
      }
      expect(typeof geo.start).toBe('function')
      expect(typeof geo.stop).toBe('function')
    } finally {
      g.restore()
    }
  })
})
