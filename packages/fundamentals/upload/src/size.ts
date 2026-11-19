const UNITS: Record<string, number> = {
  b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, k: 1e3, m: 1e6, g: 1e9,
  kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4,
}

/**
 * A size in bytes from a number or text. `"10 MB"` is 10,000,000 (KB, MB, GB, TB are decimal, as on a disk label); `"10 MiB"` is
 * 10,485,760 (KiB, MiB, GiB, TiB are binary). A bare number is bytes. Throws a `[Pyreon]` RangeError for anything else.
 *
 * @example parseSize('10 MB') // => 10000000
 * @example parseSize('1.5 MiB') // => 1572864
 * @example parseSize(512) // => 512
 */
export function parseSize(value: number | string, fn = 'parseSize'): number {
  if (typeof value === 'number') {
    if (Number.isFinite(value) && value >= 0) return value
    throw new RangeError(`[Pyreon] ${fn}: a size must be a finite number of bytes from 0, got ${String(value)}. Pass bytes or text such as "10 MB".`)
  }
  const read = typeof value === 'string' ? readSize(value) : null
  const unit = read === null ? undefined : UNITS[read.unit.toLowerCase() || 'b']

  if (read === null || unit === undefined) throw new RangeError(`[Pyreon] ${fn}: cannot read the size ${JSON.stringify(value)}. Pass bytes or text such as "10 MB", "512 KB" or "1.5 MiB".`)

  return Math.round(Number(read.number) * unit)
}

const isDigit = (code: number): boolean => code >= 48 && code <= 57
const isLetter = (code: number): boolean => (code >= 65 && code <= 90) || (code >= 97 && code <= 122)

/**
 * Split `"10 MB"` into its number text and unit text with ONE left-to-right scan: digits, an optional fraction, optional
 * whitespace, letters, end. (The equivalent regular expression, with two adjacent optional runs of whitespace, backtracks
 * quadratically on a long run of spaces: CodeQL js/polynomial-redos.) `null` when the text is not that shape.
 */
function readSize(text: string): { number: string; unit: string } | null {
  const s = text.trim()
  let i = 0

  while (i < s.length && isDigit(s.charCodeAt(i))) i++
  if (i === 0) return null
  if (s.charCodeAt(i) === 46) {
    const fraction = ++i

    while (i < s.length && isDigit(s.charCodeAt(i))) i++
    if (i === fraction) return null
  }
  const number = s.slice(0, i)

  while (i < s.length && (s[i] as string).trim() === '') i++
  const start = i

  while (i < s.length && isLetter(s.charCodeAt(i))) i++

  return i === s.length ? { number, unit: s.slice(start, i) } : null
}

/** A size for a message: `1.5 MB`. Decimal units, one decimal at most. */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = -1

  do {
    n /= 1000
    i++
  } while (n >= 1000 && i < units.length - 1)

  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${units[i]}`
}
