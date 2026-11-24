/**
 * Exact order and exact ranges for number-like values (number, bigint, decimal string).
 *
 * `Intl.NumberFormat#format` formats a decimal string exactly on every engine, but `formatRange` does not: V8 turns
 * string ends into doubles first, so `formatRange('12345678901234567.11', '12345678901234567.19')` becomes
 * `~12,345,678,901,234,567.11` (JavaScriptCore is exact). So a range with a non-number end takes its STRUCTURE (which
 * parts are shared, the separator, the approximately sign) from `formatRangeToParts` on doubles, and its DIGITS from
 * `formatToParts` of each exact end. Two plain numbers still go straight to `formatRange`.
 */

type Exact = number | bigint | string
type Part = { type: string; value: string; source?: string }

const NUMERIC = new Set(['integer', 'group', 'decimal', 'fraction'])

/** The exact decimal text of a finite double (every double is a finite decimal), e.g. `0.1` is `0.1000000000000000055511151231257827021181583404541015625`. */
function doubleText(d: number): string {
  if (Number.isInteger(d)) return BigInt(d).toString()
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, d)
  const bits = view.getBigUint64(0)
  const exponent = Number((bits >> 52n) & 0x7ffn)
  const mantissa = exponent === 0 ? bits & 0xfffffffffffffn : (bits & 0xfffffffffffffn) | (1n << 52n)
  // A non-integer double is mantissa * 2^-k = mantissa * 5^k / 10^k.
  const k = 1075 - (exponent === 0 ? 1 : exponent)
  const digits = (mantissa * 5n ** BigInt(k)).toString().padStart(k + 1, '0')
  const text = `${digits.slice(0, digits.length - k)}.${digits.slice(digits.length - k)}`.replace(/0+$/, '')

  return (d < 0 ? '-' : '') + text
}

function textOf(v: Exact): string {
  return typeof v === 'string' ? v : typeof v === 'bigint' ? v.toString() : doubleText(v)
}

/** Compare two decimal strings exactly (`-?digits(.digits)?`, leading zeros allowed). */
function compareDecimal(a: string, b: string): number {
  const negA = a.charCodeAt(0) === 45
  const negB = b.charCodeAt(0) === 45
  if (negA !== negB) return negA ? -1 : 1
  const [ia = '', fa = ''] = (negA ? a.slice(1) : a).split('.')
  const [ib = '', fb = ''] = (negB ? b.slice(1) : b).split('.')
  const intA = ia.replace(/^0+(?=\d)/, '')
  const intB = ib.replace(/^0+(?=\d)/, '')
  const width = Math.max(fa.length, fb.length)
  const x = `${intA.padStart(intB.length, '0')}.${fa.padEnd(width, '0')}`
  const y = `${intB.padStart(intA.length, '0')}.${fb.padEnd(width, '0')}`
  const order = x < y ? -1 : x > y ? 1 : 0

  return negA ? -order : order
}

/** Whether `a > b` exactly, across numbers, bigints and decimal strings (JS compares number and bigint exactly itself). */
export function greater(a: Exact, b: Exact): boolean {
  if (typeof a !== 'string' && typeof b !== 'string') return a > b
  const x = Number(a)
  const y = Number(b)
  // Number() is monotonic: different doubles decide.
  if (x !== y) return x > y
  // Equal and infinite: only a number can be infinite; a decimal string beyond the double range is finite.
  if (!Number.isFinite(x)) return typeof a === 'number' ? typeof b !== 'number' && x > 0 : typeof b === 'number' && y < 0

  return compareDecimal(textOf(a), textOf(b)) > 0
}

/** The next double above `d` (finite `d`). */
function nextUp(d: number): number {
  if (d === 0) return Number.MIN_VALUE
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, d)
  const bits = view.getBigInt64(0)
  view.setBigInt64(0, d > 0 ? bits + 1n : bits - 1n)

  return view.getFloat64(0)
}

/** The runs of numeric parts (integer, group, decimal, fraction) of `parts`, each as its joined text. */
function numericRuns(parts: readonly Part[]): string[] {
  const runs: string[] = []
  let run: string | undefined
  for (const part of parts) {
    if (NUMERIC.has(part.type)) run = (run ?? '') + part.value
    else if (run !== undefined) {
      runs.push(run)
      run = undefined
    }
  }
  if (run !== undefined) runs.push(run)

  return runs
}

const join = (parts: readonly Part[]): string => parts.reduce((text, part) => text + part.value, '')

/** Parts that carry meaning beside the digits: everything but digits, literals (spacing, the range separator) and `~`. */
function significant(parts: readonly Part[]): string {
  let key = ''
  for (const part of parts) {
    if (!NUMERIC.has(part.type) && part.type !== 'literal' && part.type !== 'approximatelySign') key += `${part.type}\u0001${part.value}\u0002`
  }

  return key
}

/** The layout as one end sees it: its own parts and the shared ones (a collapsed currency or compact suffix). */
const viewOf = (layout: readonly Part[], source: string): Part[] => layout.filter((p) => (p.source ?? 'shared') === source || (p.source ?? 'shared') === 'shared')

/**
 * Rewrite the layout's numeric runs with the exact ones, per source (`startRange`, `endRange`, or `shared` for an
 * approximately-equal range). `undefined` when anything beside the digits differs between the layout and the exact end:
 * the double rounded across a power of ten (a compact suffix K to M, an exponent E17 to E18) or a plural form changed
 * (French "dollar" / "dollars", a long unit name).
 */
function substitute(layout: readonly Part[], ends: Record<string, readonly Part[]>): string | undefined {
  for (const [source, parts] of Object.entries(ends)) {
    if (significant(viewOf(layout, source)) !== significant(parts)) return undefined
  }
  const runs: Record<string, string[]> = {}
  for (const [source, parts] of Object.entries(ends)) runs[source] = numericRuns(parts)
  const used: Record<string, number> = {}
  let out = ''
  let inRun = false
  for (const part of layout) {
    if (!NUMERIC.has(part.type)) {
      inRun = false
      out += part.value
      continue
    }
    if (inRun) continue
    inRun = true
    const source = part.source ?? 'shared'
    const index = used[source] ?? 0
    const run = runs[source]?.[index]
    if (run === undefined) return undefined
    used[source] = index + 1
    out += run
  }
  for (const source of Object.keys(runs)) if ((used[source] ?? 0) !== runs[source]?.length) return undefined

  return out
}

/** The range separator of a layout: the literal parts between the start's last part and the end's first. */
function separatorOf(layout: readonly Part[]): string {
  const lastStart = layout.findLastIndex((p) => p.source === 'startRange')
  const firstEnd = layout.findIndex((p) => p.source === 'endRange')

  return lastStart === -1 || firstEnd === -1 ? '' : join(layout.slice(lastStart + 1, firstEnd))
}

/** Two distinct doubles from `lo` up that format distinctly: the range layout of distinct ends. */
function distinctLayout(intl: Intl.NumberFormat, d1: number, d2: number): Part[] {
  let hi = d2
  for (let i = 0; i < 64 && (hi <= d1 || intl.format(hi) === intl.format(d1)); i++) hi = nextUp(hi <= d1 ? d1 : hi)

  return intl.formatRangeToParts(d1, hi) as Part[]
}

/**
 * `intl.formatRange(lo, hi)` with exact digits for bigint and decimal-string ends; `lo <= hi` already (see {@link greater}).
 * Equal formatted ends keep `Intl`'s approximately form. When the doubles cannot stand in for the exact ends (beyond the
 * double range, or a different suffix, exponent or plural form), the two exact ends are joined by the locale's separator.
 */
export function exactRange(intl: Intl.NumberFormat, lo: Exact, hi: Exact): string {
  if (typeof lo === 'number' && typeof hi === 'number') return intl.formatRange(lo, hi)
  const low = intl.formatToParts(lo as `${number}`) as Part[]
  const high = intl.formatToParts(hi as `${number}`) as Part[]
  const d1 = Number(lo)
  const d2 = Number(hi)
  const finite = Number.isFinite(d1) && Number.isFinite(d2)
  if (join(low) === join(high)) {
    const layout = finite ? (intl.formatRangeToParts(d1, d1) as Part[]) : undefined
    const exact = layout === undefined ? undefined : substitute(layout, { shared: low })
    if (exact !== undefined) return exact
    // The locale's approximately sign, placed as it places it for a small value, around the exact text.
    const approx = intl.formatRangeToParts(1, 1) as Part[]
    const at = approx.findIndex((p) => p.type !== 'approximatelySign' && p.type !== 'literal')
    const text = join(low)
    const one = join(intl.formatToParts(1) as Part[])

    return at === -1 ? text : join(approx).replace(one, text)
  }
  const layout = finite ? distinctLayout(intl, d1, d2) : undefined
  const exact = layout === undefined ? undefined : substitute(layout, { startRange: low, endRange: high })
  if (exact !== undefined) return exact

  return join(low) + separatorOf(layout ?? distinctLayout(intl, 1, 2)) + join(high)
}
