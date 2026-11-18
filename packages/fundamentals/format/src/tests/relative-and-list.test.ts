import { formatList, formatRelativeTo } from '../core'

const en = { locale: 'en-US' }
const BASE = Date.UTC(2026, 10, 18, 12, 0, 0)
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H
const rel = (v: number, u: Intl.RelativeTimeFormatUnit) => new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' }).format(v, u)

describe('formatRelativeTo picks the unit and truncates toward zero', () => {
  it.each([
    [0, -0, 'second'],
    [30 * S, 30, 'second'],
    [59 * S + 999, 59, 'second'],
    [60 * S, 1, 'minute'],
    [5 * M, 5, 'minute'],
    [59 * M + 40 * S, 59, 'minute'],
    [60 * M, 1, 'hour'],
    [23 * H + 59 * M, 23, 'hour'],
    [24 * H, 1, 'day'],
    [36 * H, 1, 'day'],
    [6 * D + 23 * H, 6, 'day'],
    [7 * D, 1, 'week'],
    [29 * D, 4, 'week'],
    [30.4375 * D, 1, 'month'],
    [200 * D, 6, 'month'],
    [364 * D, 11, 'month'],
    [365.25 * D, 1, 'year'],
    [1000 * D, 2, 'year'],
  ] as const)('%d ms ahead', (ms, n, unit) => {
    expect(formatRelativeTo(BASE + ms, BASE, en)).toBe(rel(Object.is(n, -0) ? 0 : n, unit))
    if (ms !== 0) expect(formatRelativeTo(BASE - ms, BASE, en)).toBe(rel(-n, unit))
  })

  it('reads naturally', () => {
    expect(formatRelativeTo(BASE + 5 * M, BASE, en)).toBe('in 5 minutes')
    expect(formatRelativeTo(BASE - D, BASE, en)).toBe('yesterday')
    expect(formatRelativeTo(BASE + D, BASE, en)).toBe('tomorrow')
    expect(formatRelativeTo(BASE, BASE, en)).toBe('now')
    expect(formatRelativeTo(BASE - 3 * H, BASE, en)).toBe('3 hours ago')
  })

  it('accepts every date-like input, and numeric / style options', () => {
    expect(formatRelativeTo('2026-11-17', '2026-11-18', en)).toBe('yesterday')
    expect(formatRelativeTo(new Date(BASE + 2 * H), new Date(BASE), en)).toBe('in 2 hours')
    expect(formatRelativeTo('2026-11-18T14:00:00Z', '2026-11-18T12:00:00Z', en)).toBe('in 2 hours')
    expect(formatRelativeTo(BASE - D, BASE, { ...en, numeric: 'always' })).toBe('1 day ago')
    expect(formatRelativeTo(BASE - 3 * H, BASE, { ...en, style: 'short' })).toBe('3 hr. ago')
    expect(formatRelativeTo(BASE - D, BASE, 'always')).toBe(new Intl.RelativeTimeFormat(undefined, { numeric: 'always' }).format(-1, 'day'))
  })

  it('never says "60 minutes"', () => {
    expect(formatRelativeTo(BASE + 59 * M + 59 * S, BASE, en)).toBe('in 59 minutes')
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
