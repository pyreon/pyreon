// Sonification — a series played as pitch over time (the Highcharts
// sonification idea, sized down to what a chart actually needs): each value
// maps linearly to a frequency between `minHz` and `maxHz`, an oscillator
// steps through them over `duration`, and an optional `ChartLink` moves the
// linked charts' crosshair along with the sound so the eye and the ear read
// the same datum. Pure mapping + a small Web Audio driver with an injectable
// context; nothing module-level.

import type { ChartLink } from './link'
import type { Double } from './types'

export interface SonifyOptions {
  /** Total playback time in ms; default 2000. */
  duration?: Double | undefined
  /** Pitch range in Hz; default 220..880 (A3..A5). */
  minHz?: Double | undefined
  maxHz?: Double | undefined
  /** Value range mapped onto the pitch range; default the finite min/max of the values. */
  domain?: [Double, Double] | undefined
  waveform?: OscillatorType | undefined
  /** 0..1 gain; default 0.2. */
  volume?: Double | undefined
  /** Injectable Web Audio context (tests, shared contexts); default a new `AudioContext`. */
  context?: AudioContext | undefined
  /** Called as each datum starts sounding, with its index. */
  onStep?: ((index: number) => void) | undefined
  /** Move this link's crosshair datum along with the playback; reset to -1 at the end. */
  link?: ChartLink | undefined
}

export interface Sonification {
  /** Frequencies per datum (NaN for a gap, which plays as silence). */
  frequencies: Double[]
  /** Start playback; resolves when the last datum has sounded or `stop()` was called. */
  play(): Promise<void>
  stop(): void
  playing(): boolean
}

/** Linear value → frequency map; a value outside the domain clamps to the range's ends. */
export function valueToHz(value: Double, domain: [Double, Double], minHz: Double, maxHz: Double): Double {
  if (value !== value) return NaN
  const span = domain[1] - domain[0]
  const t = span <= 0.0 ? 0.5 : (value - domain[0]) / span
  const c = t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t
  return minHz + (maxHz - minHz) * c
}

const finiteDomain = (values: Double[]): [Double, Double] => {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v !== v || !Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return lo === Infinity ? [0.0, 1.0] : [lo, hi]
}

/**
 * Build a sonification of `values`. Nothing sounds until `play()`.
 *
 * @example
 * const s = sonifyValues(rows.map((r) => r.close), { duration: 3000, link })
 * <button onClick={() => void s.play()}>Play</button>
 */
export function sonifyValues(values: Double[], options: SonifyOptions = {}): Sonification {
  const duration = Math.max(50.0, options.duration ?? 2000.0)
  const minHz = options.minHz ?? 220.0
  const maxHz = options.maxHz ?? 880.0
  const domain = options.domain ?? finiteDomain(values)
  const volume = options.volume ?? 0.2
  const frequencies = values.map((v) => valueToHz(v, domain, minHz, maxHz))
  const n = frequencies.length
  const stepMs = n === 0 ? duration : duration / n

  let timers: ReturnType<typeof setTimeout>[] = []
  let osc: OscillatorNode | null = null
  let gainNode: GainNode | null = null
  let active = false
  let finish: (() => void) | null = null

  const clearTimers = (): void => {
    for (const t of timers) clearTimeout(t)
    timers = []
  }
  const settle = (): void => {
    if (!active) return
    active = false
    clearTimers()
    if (osc !== null) {
      try {
        osc.stop()
      } catch {
        // Already stopped — a second stop() throws InvalidStateError; nothing to do.
      }
      osc.disconnect()
      osc = null
    }
    if (gainNode !== null) {
      gainNode.disconnect()
      gainNode = null
    }
    options.link?.hover.set(-1)
    const done = finish
    finish = null
    if (done !== null) done()
  }

  const play = (): Promise<void> => {
    if (active) settle()
    active = true
    return new Promise<void>((resolve) => {
      finish = resolve
      if (n === 0) {
        settle()
        return
      }
      const ctx = options.context ?? new AudioContext()
      if (ctx.state === 'suspended') void ctx.resume()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = options.waveform ?? 'sine'
      o.connect(g)
      g.connect(ctx.destination)
      const t0 = ctx.currentTime
      const stepSec = stepMs / 1000.0
      g.gain.setValueAtTime(0.0, t0)
      for (let i = 0; i < n; i++) {
        const hz = frequencies[i]!
        const at = t0 + i * stepSec
        if (hz !== hz) {
          g.gain.setValueAtTime(0.0, at)
          continue
        }
        o.frequency.setValueAtTime(hz, at)
        g.gain.setValueAtTime(volume, at)
      }
      g.gain.setValueAtTime(0.0, t0 + n * stepSec)
      o.start(t0)
      o.stop(t0 + n * stepSec + 0.05)
      osc = o
      gainNode = g
      for (let i = 0; i < n; i++) {
        const idx = i
        timers.push(
          setTimeout(() => {
            if (!active) return
            options.link?.hover.set(idx)
            options.onStep?.(idx)
          }, Math.round(i * stepMs)),
        )
      }
      timers.push(setTimeout(settle, Math.round(n * stepMs) + 60))
    })
  }

  return {
    frequencies,
    play,
    stop: settle,
    playing: () => active,
  }
}
