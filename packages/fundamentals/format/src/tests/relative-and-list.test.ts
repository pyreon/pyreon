import { formatList, formatRelativeTo } from '../core'

const en = { locale: 'en-US' }
const BASE = Date.UTC(2026, 10, 18, 12, 0, 0)
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H
const rel = (v: number, u: Intl.RelativeTimeFormatUnit) => new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' }).format(v, u)

describe('formatRelativeTo: elapsed time under a day, calendar distance from a day on', () => {
  const utc = { ...en, timeZone: 'UTC' }

  it.each([
    [0, 'second', 0],
    [30 * S, 'second', 30],
    [59 * S + 999, 'second', 59],
    [60 * S, 'minute', 1],
    [5 * M, 'minute', 5],
    [59 * M + 40 * S, 'minute', 59],
    [60 * M, 'hour', 1],
    [23 * H + 59 * M, 'hour', 23],
  ] as const)('%d ms ahead is %s %d (elapsed, truncated toward zero)', (ms, unit, n) => {
    expect(formatRelativeTo(BASE + ms, BASE, utc)).toBe(rel(n, unit))
    if (ms !== 0) expect(formatRelativeTo(BASE - ms, BASE, utc)).toBe(rel(-n, unit))
  })

  it('reads naturally', () => {
    expect(formatRelativeTo(BASE + 5 * M, BASE, utc)).toBe('in 5 minutes')
    expect(formatRelativeTo(BASE - D, BASE, utc)).toBe('yesterday')
    expect(formatRelativeTo(BASE + D, BASE, utc)).toBe('tomorrow')
    expect(formatRelativeTo(BASE, BASE, utc)).toBe('now')
    expect(formatRelativeTo(BASE - 3 * H, BASE, utc)).toBe('3 hours ago')
  })

  it('never says "60 minutes"', () => {
    expect(formatRelativeTo(BASE + 59 * M + 59 * S, BASE, utc)).toBe('in 59 minutes')
  })

  it('accepts every date-like input, and numeric / style options', () => {
    expect(formatRelativeTo('2026-11-17', '2026-11-18', utc)).toBe('yesterday')
    expect(formatRelativeTo(new Date(BASE + 2 * H), new Date(BASE), utc)).toBe('in 2 hours')
    expect(formatRelativeTo('2026-11-18T14:00:00Z', '2026-11-18T12:00:00Z', utc)).toBe('in 2 hours')
    expect(formatRelativeTo(BASE - D, BASE, { ...utc, numeric: 'always' })).toBe('1 day ago')
    expect(formatRelativeTo(BASE - 3 * H, BASE, { ...utc, style: 'short' })).toBe('3 hr. ago')
    expect(formatRelativeTo(BASE - D, BASE, 'always')).toBe(new Intl.RelativeTimeFormat(undefined, { numeric: 'always' }).format(-1, 'day'))
  })
})

describe('formatList', () => {
  it('strings, iterables, sets, generators', () => {
    expect(formatList(['a', 'b', 'c'], en)).toBe('a, b, and c')
    expect(formatList(new Set(['a', 'b']), en)).toBe('a and b')
    expect(formatList((function* () { yield 'x'; yield 'y' })(), en)).toBe('x and y')
    expect(formatList(['solo'], en)).toBe('solo')
  })
  it('a bare string is one item, not its characters', () => {
    expect(formatList('abc' as never, en)).toBe('abc')
  })
  it('non-string items are stringified, nullish entries skipped', () => {
    expect(formatList([1, 2, null, undefined, 3] as never, en)).toBe('1, 2, and 3')
  })
  it('empty returns the fallback', () => {
    expect(formatList([], { ...en, fallback: 'none' })).toBe('none')
    expect(formatList([null], { ...en, fallback: 'none' })).toBe('none')
    expect(formatList([])).toBe('')
  })
  it('presets', () => {
    expect(formatList(['a', 'b', 'c'], 'or')).toBe(new Intl.ListFormat(undefined, { type: 'disjunction' }).format(['a', 'b', 'c']))
  })
})
