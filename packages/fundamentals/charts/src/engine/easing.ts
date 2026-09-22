/**
 * ECharts' easing vocabulary — the names `animationEasing` /
 * `animationEasingUpdate` accept, each mapping `t` in 0..1 to eased progress.
 *
 * These are the zrender curves ECharts itself uses (Penner's equations), so an
 * option that asks for `elasticOut` moves the way it does in ECharts. Pure
 * arithmetic over one `Double`: nothing here touches a platform, so the module
 * can join the generated native engine unchanged.
 */
import type { Double } from './types'

export type EasingName =
  | 'linear'
  | 'quadraticIn' | 'quadraticOut' | 'quadraticInOut'
  | 'cubicIn' | 'cubicOut' | 'cubicInOut'
  | 'quarticIn' | 'quarticOut' | 'quarticInOut'
  | 'quinticIn' | 'quinticOut' | 'quinticInOut'
  | 'sinusoidalIn' | 'sinusoidalOut' | 'sinusoidalInOut'
  | 'exponentialIn' | 'exponentialOut' | 'exponentialInOut'
  | 'circularIn' | 'circularOut' | 'circularInOut'
  | 'elasticIn' | 'elasticOut' | 'elasticInOut'
  | 'backIn' | 'backOut' | 'backInOut'
  | 'bounceIn' | 'bounceOut' | 'bounceInOut'

export const EASING_NAMES: readonly EasingName[] = [
  'linear',
  'quadraticIn', 'quadraticOut', 'quadraticInOut',
  'cubicIn', 'cubicOut', 'cubicInOut',
  'quarticIn', 'quarticOut', 'quarticInOut',
  'quinticIn', 'quinticOut', 'quinticInOut',
  'sinusoidalIn', 'sinusoidalOut', 'sinusoidalInOut',
  'exponentialIn', 'exponentialOut', 'exponentialInOut',
  'circularIn', 'circularOut', 'circularInOut',
  'elasticIn', 'elasticOut', 'elasticInOut',
  'backIn', 'backOut', 'backInOut',
  'bounceIn', 'bounceOut', 'bounceInOut',
]

const PI = 3.141592653589793

function bounceOut(k: Double): Double {
  if (k < 1.0 / 2.75) return 7.5625 * k * k
  if (k < 2.0 / 2.75) {
    const m = k - 1.5 / 2.75
    return 7.5625 * m * m + 0.75
  }
  if (k < 2.5 / 2.75) {
    const m = k - 2.25 / 2.75
    return 7.5625 * m * m + 0.9375
  }
  const m = k - 2.625 / 2.75
  return 7.5625 * m * m + 0.984375
}

/**
 * Ease `t` (clamped to 0..1) by the named curve. An unknown name is linear,
 * so a typo slows nothing down; `isEasingName` lets a caller report it.
 */
export function ease(name: string, tIn: Double): Double {
  const k = tIn < 0.0 ? 0.0 : tIn > 1.0 ? 1.0 : tIn
  if (name === 'quadraticIn') return k * k
  if (name === 'quadraticOut') return k * (2.0 - k)
  if (name === 'quadraticInOut') {
    const m = k * 2.0
    if (m < 1.0) return 0.5 * m * m
    const n = m - 1.0
    return -0.5 * (n * (n - 2.0) - 1.0)
  }
  if (name === 'cubicIn') return k * k * k
  if (name === 'cubicOut') {
    const m = k - 1.0
    return m * m * m + 1.0
  }
  if (name === 'cubicInOut') {
    const m = k * 2.0
    if (m < 1.0) return 0.5 * m * m * m
    const n = m - 2.0
    return 0.5 * (n * n * n + 2.0)
  }
  if (name === 'quarticIn') return k * k * k * k
  if (name === 'quarticOut') {
    const m = k - 1.0
    return 1.0 - m * m * m * m
  }
  if (name === 'quarticInOut') {
    const m = k * 2.0
    if (m < 1.0) return 0.5 * m * m * m * m
    const n = m - 2.0
    return -0.5 * (n * n * n * n - 2.0)
  }
  if (name === 'quinticIn') return k * k * k * k * k
  if (name === 'quinticOut') {
    const m = k - 1.0
    return m * m * m * m * m + 1.0
  }
  if (name === 'quinticInOut') {
    const m = k * 2.0
    if (m < 1.0) return 0.5 * m * m * m * m * m
    const n = m - 2.0
    return 0.5 * (n * n * n * n * n + 2.0)
  }
  if (name === 'sinusoidalIn') return 1.0 - Math.cos((k * PI) / 2.0)
  if (name === 'sinusoidalOut') return Math.sin((k * PI) / 2.0)
  if (name === 'sinusoidalInOut') return 0.5 * (1.0 - Math.cos(PI * k))
  if (name === 'exponentialIn') return k === 0.0 ? 0.0 : Math.pow(1024.0, k - 1.0)
  if (name === 'exponentialOut') return k === 1.0 ? 1.0 : 1.0 - Math.pow(2.0, -10.0 * k)
  if (name === 'exponentialInOut') {
    if (k === 0.0) return 0.0
    if (k === 1.0) return 1.0
    const m = k * 2.0
    if (m < 1.0) return 0.5 * Math.pow(1024.0, m - 1.0)
    return 0.5 * (-Math.pow(2.0, -10.0 * (m - 1.0)) + 2.0)
  }
  if (name === 'circularIn') return 1.0 - Math.sqrt(1.0 - k * k)
  if (name === 'circularOut') {
    const m = k - 1.0
    return Math.sqrt(1.0 - m * m)
  }
  if (name === 'circularInOut') {
    const m = k * 2.0
    if (m < 1.0) return -0.5 * (Math.sqrt(1.0 - m * m) - 1.0)
    const n = m - 2.0
    return 0.5 * (Math.sqrt(1.0 - n * n) + 1.0)
  }
  // zrender's elastic curves: amplitude 0.1 raised to 1, period 0.4.
  if (name === 'elasticIn') {
    if (k === 0.0) return 0.0
    if (k === 1.0) return 1.0
    const s = 0.4 / 4.0
    const m = k - 1.0
    return -(Math.pow(2.0, 10.0 * m) * Math.sin(((m - s) * (2.0 * PI)) / 0.4))
  }
  if (name === 'elasticOut') {
    if (k === 0.0) return 0.0
    if (k === 1.0) return 1.0
    const s = 0.4 / 4.0
    return Math.pow(2.0, -10.0 * k) * Math.sin(((k - s) * (2.0 * PI)) / 0.4) + 1.0
  }
  if (name === 'elasticInOut') {
    if (k === 0.0) return 0.0
    if (k === 1.0) return 1.0
    const s = 0.4 / 4.0
    const m = k * 2.0 - 1.0
    if (m < 0.0) return -0.5 * (Math.pow(2.0, 10.0 * m) * Math.sin(((m - s) * (2.0 * PI)) / 0.4))
    return Math.pow(2.0, -10.0 * m) * Math.sin(((m - s) * (2.0 * PI)) / 0.4) * 0.5 + 1.0
  }
  if (name === 'backIn') {
    const s = 1.70158
    return k * k * ((s + 1.0) * k - s)
  }
  if (name === 'backOut') {
    const s = 1.70158
    const m = k - 1.0
    return m * m * ((s + 1.0) * m + s) + 1.0
  }
  if (name === 'backInOut') {
    const s = 1.70158 * 1.525
    const m = k * 2.0
    if (m < 1.0) return 0.5 * (m * m * ((s + 1.0) * m - s))
    const n = m - 2.0
    return 0.5 * (n * n * ((s + 1.0) * n + s) + 2.0)
  }
  if (name === 'bounceIn') return 1.0 - bounceOut(1.0 - k)
  if (name === 'bounceOut') return bounceOut(k)
  if (name === 'bounceInOut') {
    if (k < 0.5) return (1.0 - bounceOut(1.0 - k * 2.0)) * 0.5
    return bounceOut(k * 2.0 - 1.0) * 0.5 + 0.5
  }
  return k
}

/** Whether `name` is one of ECharts' easing names. */
export function isEasingName(name: string): boolean {
  for (const n of EASING_NAMES) if (n === name) return true
  return false
}
