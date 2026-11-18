import { HOUR, MINUTE } from './civil'
import { badRange, badValue, show } from './errors'

const CALENDAR_UNITS = ['years', 'months', 'weeks', 'days']
const TIME_UNITS = ['hours', 'minutes', 'seconds', 'milliseconds']

/**
 * A duration of working or slot time in milliseconds. Only hours, minutes, seconds and milliseconds count; calendar units and
 * unknown fields are errors, so a typo never silently counts as zero. `sign` says what is allowed: any sign, zero or more, or
 * strictly positive.
 */
export function timeMs(fn: string, name: string, d: unknown, sign: 'any' | 'nonNegative' | 'positive'): number {
  if (typeof d !== 'object' || d === null || Array.isArray(d)) return badValue(fn, `${name} to be a Duration such as { hours: 8 } or { minutes: 30 }`, d)
  let ms = 0

  for (const key of Object.keys(d)) {
    const v = (d as Record<string, unknown>)[key]

    if (v === undefined) continue
    if (CALENDAR_UNITS.includes(key)) return badRange(fn, `${name} ${show(d)} has calendar units (${key}); it is counted in hours, minutes and seconds.${key === 'days' ? ' Use addBusinessDays for days.' : ''}`)
    if (!TIME_UNITS.includes(key)) return badRange(fn, `${name} has the unknown field ${show(key)}; use hours, minutes, seconds or milliseconds.`)
    if (typeof v !== 'number' || !Number.isFinite(v)) return badValue(fn, `${name}.${key} to be a finite number`, v)
    ms += v * (key === 'hours' ? HOUR : key === 'minutes' ? MINUTE : key === 'seconds' ? 1000 : 1)
  }
  ms = Math.round(ms)
  if (!Number.isFinite(ms) || Math.abs(ms) > 1e15) return badRange(fn, `${name} ${show(d)} is too large.`)
  if (sign === 'positive' && ms <= 0) return badRange(fn, `${name} must be positive, got ${show(d)}. A slot with no length has no start to offer.`)
  if (sign === 'nonNegative' && ms < 0) return badRange(fn, `${name} must be zero or positive, got ${show(d)}.`)

  return ms
}
