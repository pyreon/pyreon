import { describe, expect, it } from 'vitest'
import { date, formatDate } from './format'

const at = (iso: string): number => Date.parse(iso)

describe('formatDate — UTC, every token', () => {
  const t = at('2024-03-07T09:05:04Z')
  it.each([
    ['YYYY-MM-DD', '2024-03-07'],
    ['D MMMM YYYY', '7 March 2024'],
    ['MMM YY', 'Mar 24'],
    ['M/D', '3/7'],
    ['HH:mm:ss', '09:05:04'],
    ['H[h]', '9h'],
    ['[Q] MMM', 'Q Mar'],
    ['YYYY [year]', '2024 year'],
  ])('%s → %s', (pattern, want) => {
    expect(formatDate(t, pattern)).toBe(want)
  })

  it('agrees with the platform calendar across leap days, century years and before 1970', () => {
    for (const iso of ['2000-02-29T00:00:00Z', '1900-03-01T23:59:59Z', '1969-12-31T12:00:00Z', '2100-12-31T00:00:00Z', '1600-01-01T00:00:00Z']) {
      const d = new Date(iso)
      const want = `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
      expect(formatDate(d.getTime(), 'YYYY-MM-DD HH:mm'), iso).toBe(want)
    }
  })

  it('an unclosed bracket prints the rest literally; a non-finite value prints nothing', () => {
    expect(formatDate(t, 'YYYY [open')).toBe('2024 open')
    expect(formatDate(Number.NaN, 'YYYY')).toBe('')
    expect(formatDate(Infinity, 'YYYY')).toBe('')
  })

  it('date(pattern) is the formatter form', () => {
    expect(date('MMM YYYY')(t)).toBe('Mar 2024')
  })
})
