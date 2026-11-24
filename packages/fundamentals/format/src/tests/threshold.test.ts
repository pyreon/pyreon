/**
 * `thresholdOf` (the `threshold: { after, as }` option of `useRelativeTime`) and `nextRelativeChange` (when a label next changes),
 * on their own: every accepted shape, every rejected shape with its message, and the schedule at the edges.
 */
import { nextRelativeChange, relativeTimeIn, thresholdOf } from '../datetime'

const DAY = 86_400_000
const HOUR = 3_600_000
const MIN = 60_000

describe('thresholdOf', () => {
  it('no threshold is none', () => {
    expect(thresholdOf('f', undefined)).toBeUndefined()
    expect(thresholdOf('f', {})).toBeUndefined()
    expect(thresholdOf('f', { threshold: null })).toBeUndefined()
  })

  it('after is milliseconds or a span of seconds, minutes, hours, days and weeks (summed), as defaults to medium', () => {
    expect(thresholdOf('f', { threshold: { after: 5000 } })).toEqual({ ms: 5000, as: 'medium' })
    expect(thresholdOf('f', { threshold: { after: { seconds: 30 } } })?.ms).toBe(30_000)
    expect(thresholdOf('f', { threshold: { after: { minutes: 2 } } })?.ms).toBe(2 * MIN)
    expect(thresholdOf('f', { threshold: { after: { hours: 3 } } })?.ms).toBe(3 * HOUR)
    expect(thresholdOf('f', { threshold: { after: { days: 1, hours: 12 } } })?.ms).toBe(36 * HOUR)
    expect(thresholdOf('f', { threshold: { after: { weeks: 2 }, as: 'long' } })).toEqual({ ms: 14 * DAY, as: 'long' })
    expect(thresholdOf('f', { threshold: { after: 1, as: { month: 'long' } } })?.as).toEqual({ month: 'long' })
  })

  it.each([
    ['a non-object', 7],
    ['a string', 'soon'],
    ['no after', {}],
    ['zero', { after: 0 }],
    ['a negative', { after: -5 }],
    ['NaN', { after: Number.NaN }],
    ['Infinity', { after: Infinity }],
    ['a string after', { after: '7 days' }],
    ['an empty span', { after: {} }],
    ['an unknown unit', { after: { fortnights: 1 } }],
    ['a month (no fixed length)', { after: { months: 1 } }],
    ['a non-number amount', { after: { days: '7' } }],
    ['a null after', { after: null }],
  ])('rejects %s with a [Pyreon] error that says how to write it', (_name, threshold) => {
    expect(() => thresholdOf('useRelativeTime', { threshold })).toThrow(/\[Pyreon\] useRelativeTime\(\): threshold must be \{ after, as\? \}/)
  })

  it('rejects an as that is neither a style nor options', () => {
    for (const as of [5, null, true]) {
      expect(() => thresholdOf('f', { threshold: { after: 1000, as } }), String(as)).toThrow(/threshold\.as must be a date style/)
    }
  })
})

describe('nextRelativeChange', () => {
  const NOW = Date.UTC(2026, 10, 18, 12, 0, 0)
  const th = (ms: number) => ({ ms, as: 'medium' as const })

  it('an invalid target never changes', () => {
    expect(nextRelativeChange('nonsense', NOW, 'UTC', undefined)).toBe(Infinity)
    expect(nextRelativeChange(undefined, NOW, 'UTC', undefined)).toBe(Infinity)
  })

  it('a past target beyond the threshold never changes again; a future one turns relative when it comes within it', () => {
    expect(nextRelativeChange(NOW - 10 * DAY, NOW, 'UTC', th(7 * DAY))).toBe(Infinity)
    expect(nextRelativeChange(NOW + 10 * DAY, NOW, 'UTC', th(7 * DAY))).toBe(NOW + 10 * DAY - 7 * DAY + 1)
  })

  it('a past target inside the threshold changes no later than the threshold; a date-only target changes at local midnight', () => {
    expect(nextRelativeChange(NOW - 2 * HOUR, NOW, 'UTC', th(5 * HOUR))).toBe(NOW + HOUR) // the next hour mark comes first
    expect(nextRelativeChange(NOW - 2.5 * HOUR, NOW, 'UTC', th(2.7 * HOUR))).toBe(NOW - 2.5 * HOUR + 2.7 * HOUR) // the threshold comes first
    expect(nextRelativeChange(NOW - 2 * DAY, NOW, 'UTC', th(2 * DAY + HOUR))).toBe(NOW - 2 * DAY + 2 * DAY + HOUR) // the threshold comes first
    expect(nextRelativeChange('2026-11-18', NOW, 'UTC', undefined)).toBe(Date.UTC(2026, 10, 19))
    expect(nextRelativeChange('2026-11-18', NOW, 'Asia/Tokyo', undefined)).toBe(Date.UTC(2026, 10, 18, 15)) // midnight in Tokyo
    expect(nextRelativeChange('2026-11-10', NOW, 'UTC', th(9 * DAY))).toBe(Date.UTC(2026, 10, 19)) // midnight comes before the threshold
    expect(nextRelativeChange('2026-11-10', NOW, 'UTC', th(8.5 * DAY + HOUR))).toBe(Date.UTC(2026, 10, 10) + 8.5 * DAY + HOUR) // the threshold comes first
  })

  it('under a minute is the second ticker, except the last second before a minute', () => {
    expect(nextRelativeChange(NOW - 20_000, NOW, 'UTC', undefined)).toBe('second')
    expect(nextRelativeChange(NOW - 59_500, NOW, 'UTC', undefined)).toBe(NOW - 59_500 + MIN)
    expect(nextRelativeChange(NOW + 20_000, NOW, 'UTC', undefined)).toBe('second')
  })
})

describe('relativeTimeIn with a threshold', () => {
  const NOW = Date.UTC(2026, 10, 18, 12, 0, 0)
  const o = { threshold: { after: { days: 7 } } }

  it('an invalid target is the fallback; a date-only target past the threshold is its own day', () => {
    expect(relativeTimeIn('en-US', 'UTC', 'nonsense', NOW, { ...o, fallback: '?' })).toBe('?')
    expect(relativeTimeIn('en-US', 'UTC', '2026-11-01', NOW, o)).toBe('Nov 1, 2026')
    expect(relativeTimeIn('en-US', 'UTC', NOW - 2 * DAY, NOW, o)).toBe('2 days ago')
  })
})
