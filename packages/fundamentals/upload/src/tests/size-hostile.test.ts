/**
 * `parseSize` reads caller text (an `accept`-style option, a config value, a form field). Its scan is linear: a regular
 * expression with two adjacent optional runs of whitespace backtracks quadratically (CodeQL js/polynomial-redos). Each case is a
 * 100,000-character hostile string; the bound is generous, so a quadratic regression fails by orders of magnitude.
 */
import { parseSize } from '../size'

const N = 100_000
const BOUND_MS = 1500

function rejectsFast(text: string): void {
  const t0 = performance.now()

  expect(() => parseSize(text)).toThrow(/cannot read the size/)
  expect(performance.now() - t0).toBeLessThan(BOUND_MS)
}

describe('parseSize on hostile text', () => {
  it('rejects 100 kB of whitespace after a number in linear time', () => {
    rejectsFast('0' + ' '.repeat(N) + '!')
    rejectsFast('0' + ' '.repeat(N) + '1')
    rejectsFast('1.5' + ' '.repeat(N) + 'M B')
  })

  it('rejects long runs of digits, dots and letters in linear time', () => {
    rejectsFast('1'.repeat(N) + '.')
    rejectsFast('1.'.repeat(N / 2))
    rejectsFast('0 ' + 'a'.repeat(N) + '!')
    rejectsFast(' '.repeat(N))
    rejectsFast('\t\n '.repeat(N / 3) + 'x')
  })

  it('still reads the shapes it always read', () => {
    expect(parseSize('10 MB')).toBe(10_000_000)
    expect(parseSize('  1.5   MiB  ')).toBe(1_572_864)
    expect(parseSize('512')).toBe(512)
    expect(parseSize('2k')).toBe(2000)
    expect(parseSize('7 KB')).toBe(7000) // a no-break space is whitespace, as before
    expect(parseSize('0' + ' '.repeat(N) + 'KB')).toBe(0) // a long gap is valid and linear
  })

  it('rejects the shapes it always rejected', () => {
    for (const bad of ['', 'MB', '1.', '.5', '1..5', '10 M B', '10 parsecs', '-1 MB', '1e3', '10 MB!']) {
      expect(() => parseSize(bad), bad).toThrow(/cannot read the size/)
    }
  })

  it('agrees with the previous regular expression on every short string of its alphabet', () => {
    const UNITS: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, k: 1e3, m: 1e6, g: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 }
    const previous = (v: string): number | null => {
      const m = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(v)
      const unit = m === null ? undefined : UNITS[(m[2] ?? '').toLowerCase() || 'b']

      return m === null || unit === undefined ? null : Math.round(Number(m[1]) * unit)
    }
    const alphabet = ['1', '5', '.', ' ', 'k', 'B', 'M', 'x']
    let checked = 0
    const walk = (prefix: string, depth: number): void => {
      let actual: number | null

      try {
        actual = parseSize(prefix)
      } catch {
        actual = null
      }
      expect(actual, JSON.stringify(prefix)).toBe(previous(prefix))
      checked++
      if (depth > 0) for (const c of alphabet) walk(prefix + c, depth - 1)
    }

    walk('', 5)
    expect(checked).toBeGreaterThan(30000)
  })
})
