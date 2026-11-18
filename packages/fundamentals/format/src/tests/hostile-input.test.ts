/**
 * Hostile input stays linear. A caller-supplied string reaches `parseDate` (and `parseNumber`): a regular expression with an
 * unbounded repeat that backtracks (CodeQL js/polynomial-redos) would take seconds on a 100 kB run of one character. Each case
 * is a 100,000-character adversarial string; the bound is generous (a linear scan takes milliseconds), so a quadratic regression
 * fails by orders of magnitude, not by a hair.
 */
import { parseDate, parseNumber, relativeFormatter } from '../core'

const N = 100_000
const BOUND_MS = 1500

function timed(fn: () => unknown): number {
  const t0 = performance.now()

  fn()

  return performance.now() - t0
}

describe('adversarial strings are rejected or read in linear time', () => {
  const cases: Array<[string, string]> = [
    ['only dots', '.'.repeat(N)],
    ['dots then a letter', '.'.repeat(N) + 'x'],
    ['a letter between dot runs', '.'.repeat(N / 2) + 'x' + '.'.repeat(N / 2)],
    ['a word then dots then a word', 'nov' + '.'.repeat(N) + 'x'],
    ['alternating dot and space', '. '.repeat(N / 2)],
    ['many separators', '/'.repeat(N)],
    ['digits', '1'.repeat(N)],
    ['digits and group marks', '1,'.repeat(N / 2)],
    ['spaces', ' '.repeat(N) + '1'],
    ['minus signs', '-'.repeat(N) + '1'],
  ]

  it.each(cases)('parseDate: %s', (_name, text) => {
    expect(timed(() => parseDate(text, { locale: 'en-US' }))).toBeLessThan(BOUND_MS)
    expect(parseDate(text, { locale: 'cs' })).toBeNull()
  })

  it.each(cases)('parseNumber: %s', (_name, text) => {
    expect(timed(() => parseNumber(text, { locale: 'en-US' }))).toBeLessThan(BOUND_MS)
  })

  it('a hostile value in an error message is described, not interpreted', () => {
    expect(() => relativeFormatter('x'.repeat(N) as never)).toThrow(/\[Pyreon\] relativeFormatter\(\)/)
  })
})
