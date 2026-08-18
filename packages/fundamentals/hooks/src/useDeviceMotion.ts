import { isClient, onCleanup, signal } from '@pyreon/reactivity'

import { warnIfInsecureContext } from './secure-context'

/** Three-axis reading. Units are m/s² for acceleration, deg/s for rotation. */
export type Vec3 = { x: number; y: number; z: number }

const ZERO: Vec3 = { x: 0, y: 0, z: 0 }

export type DeviceMotionControls = {
  /** True when the platform exposes motion sensors. */
  supported: () => boolean
  /** True while updates are flowing. */
  active: () => boolean
  /**
   * Begin updates. Resolves to whether they started — iOS Safari gates motion
   * behind a permission prompt that must be triggered by a user gesture, and
   * a denial is an ordinary `false`.
   */
  start: () => Promise<boolean>
  /** Stop updates. Safe when not started. */
  stop: () => void
  /** Acceleration including gravity. */
  acceleration: () => Vec3
  /** Rotation rate. */
  rotation: () => Vec3
}

/**
 * Device motion — shake gestures, tilt controls, step-ish detection.
 *
 * ## Why `start()` exists rather than listening on mount
 *
 * iOS Safari gates `DeviceMotionEvent` behind a permission prompt that only
 * works when triggered by a user gesture, and the native targets both want an
 * explicit start/stop so the sensor is not draining battery for a screen
 * nobody is looking at. An always-on hook would be wrong on all three.
 *
 * @example
 * ```tsx
 * const motion = useDeviceMotion()
 * <Button onClick={() => motion.start()}>Enable tilt</Button>
 * <Show when={() => motion.active()}><Tilt v={motion.rotation()} /></Show>
 * ```
 */
export function useDeviceMotion(): DeviceMotionControls {
  const active = signal(false)
  const acceleration = signal<Vec3>(ZERO)
  const rotation = signal<Vec3>(ZERO)

  const supported = () => isClient && typeof DeviceMotionEvent !== 'undefined'

  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity
    if (a) acceleration.set({ x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 })
    const r = e.rotationRate
    if (r) rotation.set({ x: r.beta ?? 0, y: r.gamma ?? 0, z: r.alpha ?? 0 })
  }

  const stop = () => {
    if (!isClient) return
    window.removeEventListener('devicemotion', onMotion)
    active.set(false)
  }

  if (isClient) {
    // A sensor left running past its view drains battery for a screen nobody
    // is looking at — the quiet cost of an unstopped listener here.
    onCleanup(stop)
  }

  return {
    supported,
    active,
    acceleration,
    rotation,
    stop,

    start: async (): Promise<boolean> => {
      if (!supported()) {
        warnIfInsecureContext('useDeviceMotion')
        return false
      }
      if (active()) return true
      const DME = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>
      }
      // iOS Safari only. Elsewhere the method is absent and motion flows
      // without a prompt — so its ABSENCE is a grant, not a failure.
      if (typeof DME.requestPermission === 'function') {
        try {
          if ((await DME.requestPermission()) !== 'granted') return false
        } catch {
          // Thrown when not called from a user gesture. Ordinary, not fatal.
          return false
        }
      }
      window.addEventListener('devicemotion', onMotion)
      active.set(true)
      return true
    },
  }
}
