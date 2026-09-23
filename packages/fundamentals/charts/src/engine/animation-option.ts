/**
 * ECharts' animation keys → the one animation a chart host plays.
 *
 * ECharts animates by default: an entrance of 1000 ms `cubicOut`, and an
 * update tween of 300 ms `cubicInOut` whenever the option changes. `animation:
 * false` turns both off, and so does a series longer than
 * `animationThreshold` (2000 datums by default). The keys may sit on the
 * option or on a series; a series value wins over the option's.
 *
 * The host tweens the WHOLE draw list at once, so two series asking for
 * different timings cannot both be honoured, and a FUNCTION duration or delay
 * (ECharts' per-datum stagger) has nothing to act on yet. Each of those is
 * named in a warning rather than silently flattened.
 */
import type { Double } from './types'
import { isEasingName } from './easing'

export interface ChartAnimation {
  /** Play the entrance. */
  enter: boolean
  enterMs: Double
  enterEasing: string
  enterDelay: Double
  /** Tween between successive options. */
  update: boolean
  updateMs: Double
  updateEasing: string
  updateDelay: Double
}

export const ECHARTS_ANIMATION_DEFAULTS: ChartAnimation = {
  enter: true,
  enterMs: 1000.0,
  enterEasing: 'cubicOut',
  enterDelay: 0.0,
  update: true,
  updateMs: 300.0,
  updateEasing: 'cubicInOut',
  updateDelay: 0.0,
}

/** ECharts' default `animationThreshold`: a series longer than this is drawn without animation. */
export const ECHARTS_ANIMATION_THRESHOLD = 2000

/** The option / series keys this module reads. */
export const ANIMATION_KEYS: readonly string[] = [
  'animation',
  'animationThreshold',
  'animationDuration',
  'animationEasing',
  'animationDelay',
  'animationDurationUpdate',
  'animationEasingUpdate',
  'animationDelayUpdate',
]

type AnimationWarnCode = 'series-option-unsupported' | 'option-key-unsupported'
export type AnimationWarn = (code: AnimationWarnCode, path: string, message: string) => void

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const seriesLength = (s: Record<string, unknown>): number => {
  const d = s['data']
  if (Array.isArray(d)) return d.length
  const nodes = s['nodes'] ?? s['links']
  return Array.isArray(nodes) ? nodes.length : 0
}

/**
 * Resolve the animation an option asks for. `report` receives each key that is
 * present but cannot be honoured as written.
 */
export function resolveAnimation(option: Record<string, unknown>, report?: AnimationWarn): ChartAnimation {
  const warn: AnimationWarn = report ?? (() => undefined)
  const raw = option['series']
  const series: Record<string, unknown>[] = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter(isObj)

  /**
   * One key, read off the option and every series. Series values that agree
   * override the option's; series that disagree are named, and the first one
   * wins, because the host has a single timeline.
   */
  const pick = (key: string): { value: unknown; path: string } | undefined => {
    const own = series.map((s, i) => ({ value: s[key], path: `series[${i}].${key}` })).filter((e) => e.value !== undefined)
    if (own.length > 0) {
      const first = own[0]!
      if (own.some((e) => typeof e.value !== 'function' && e.value !== first.value)) {
        // ledger: presentation.animation
        warn('series-option-unsupported', first.path, `series ask for different ${key} values; one animation plays for the whole chart, so ${first.path} is used.`)
      }
      return first
    }
    return option[key] === undefined ? undefined : { value: option[key], path: key }
  }

  const out: ChartAnimation = { ...ECHARTS_ANIMATION_DEFAULTS }
  const flag = pick('animation')
  if (flag !== undefined && flag.value === false) {
    out.enter = false
    out.update = false
  }

  const thresholdRaw = pick('animationThreshold')
  const threshold = thresholdRaw !== undefined && typeof thresholdRaw.value === 'number' ? thresholdRaw.value : ECHARTS_ANIMATION_THRESHOLD
  if (series.some((s) => seriesLength(s) > threshold)) {
    out.enter = false
    out.update = false
  }

  const duration = (key: string, fallback: Double): Double => {
    const v = pick(key)
    if (v === undefined) return fallback
    if (typeof v.value === 'number' && Number.isFinite(v.value) && v.value >= 0) return v.value
    if (typeof v.value === 'function') {
      // ledger: presentation.animation
      warn('series-option-unsupported', v.path, `a per-datum ${key} function has no single-timeline form; ${fallback} ms is used.`)
      return fallback
    }
    // ledger: invalid-input
    warn('series-option-unsupported', v.path, `${key} takes a non-negative number of milliseconds; ${fallback} ms is used.`)
    return fallback
  }
  const easing = (key: string, fallback: string): string => {
    const v = pick(key)
    if (v === undefined) return fallback
    if (typeof v.value === 'string' && isEasingName(v.value)) return v.value
    // ledger: invalid-input
    warn('series-option-unsupported', v.path, `${key} "${String(v.value)}" is not an ECharts easing; ${fallback} is used.`)
    return fallback
  }

  out.enterMs = duration('animationDuration', out.enterMs)
  out.enterDelay = duration('animationDelay', out.enterDelay)
  out.enterEasing = easing('animationEasing', out.enterEasing)
  out.updateMs = duration('animationDurationUpdate', out.updateMs)
  out.updateDelay = duration('animationDelayUpdate', out.updateDelay)
  out.updateEasing = easing('animationEasingUpdate', out.updateEasing)
  if (out.enterMs <= 0.0) out.enter = false
  if (out.updateMs <= 0.0) out.update = false
  return out
}
