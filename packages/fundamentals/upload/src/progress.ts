import type { Progress } from './types'

/**
 * Bytes as a `Progress`: `loaded` is clamped into `0..total`; `ratio` is 0 to 1 (0 for an empty file until it is `complete`).
 *
 * @example progressOf(50, 200) // => { loaded: 50, total: 200, ratio: 0.25 }
 * @example progressOf(0, 0, true) // => { loaded: 0, total: 0, ratio: 1 }
 */
export function progressOf(loaded: number, total: number, complete = false): Progress {
  const t = Number.isFinite(total) && total > 0 ? total : 0
  const l = Number.isFinite(loaded) ? Math.min(Math.max(0, loaded), t) : 0

  if (t === 0) return { loaded: l, total: t, ratio: complete ? 1 : 0 }

  return { loaded: l, total: t, ratio: l / t }
}

/**
 * The progress of several files at once: bytes added up, so a big file weighs more than a small one.
 *
 * @example sumProgress([{ loaded: 50, total: 100, ratio: 0.5 }, { loaded: 0, total: 100, ratio: 0 }]).ratio // => 0.25
 */
export function sumProgress(list: readonly Progress[]): Progress {
  let loaded = 0
  let total = 0

  for (const p of list) {
    loaded += p.loaded
    total += p.total
  }

  if (total === 0) return { loaded, total, ratio: list.length > 0 && list.every((p) => p.ratio === 1) ? 1 : 0 }

  return { loaded, total, ratio: loaded / total }
}

/** Progress that never goes back: the larger of what was shown and what is reported. A retry restarts from zero on the wire, not on screen. */
export function monotonic(shown: number, reported: number): number {
  return reported > shown ? reported : shown
}

/** Estimated time left in milliseconds, or `null` while the speed is unknown or zero. */
export function remainingMs(loaded: number, total: number, speed: number | null): number | null {
  if (speed === null || speed <= 0) return null

  return Math.max(0, Math.round(((total - loaded) / speed) * 1000))
}

export interface SpeedMeter {
  /** Record that `loaded` bytes were sent by time `now` (ms). */
  record(loaded: number, now: number): void
  /** Bytes per second, smoothed; `null` until two samples at least 250 ms apart exist. */
  speed(): number | null
  reset(): void
}

/** A smoothed speed (exponential moving average, weight `alpha` for the newest interval). */
export function createSpeedMeter(alpha = 0.3): SpeedMeter {
  let lastLoaded = 0
  let lastTime = -1
  let ema: number | null = null

  return {
    record(loaded, now) {
      if (lastTime < 0) {
        lastLoaded = loaded
        lastTime = now

        return
      }
      const dt = now - lastTime

      if (dt < 250) return
      const instant = (Math.max(0, loaded - lastLoaded) / dt) * 1000

      ema = ema === null ? instant : alpha * instant + (1 - alpha) * ema
      lastLoaded = loaded
      lastTime = now
    },
    speed: () => ema,
    reset() {
      lastLoaded = 0
      lastTime = -1
      ema = null
    },
  }
}
