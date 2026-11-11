/**
 * Linear-time replacements for "opener, run of non-closer characters, closer"
 * regexes run over author content.
 *
 * A pattern like `/<[^>]+>/g` or `/!?\[([^\]]*)\]\([^)]*\)/g` is QUADRATIC
 * when the closer is missing: the negated class admits the opener, so every
 * opener scans to the end of the input before failing, and the engine then
 * retries at the next opener. `'['.repeat(1e5)` took seconds. The scanners
 * below produce exactly the regex's matches (same leftmost-first,
 * non-overlapping order, same captures) but remember the next closer, so each
 * character is examined a constant number of times.
 *
 * Differential lock: `tests/_linear-scan-equivalence.test.ts` compares every
 * scanner with the regex it replaces on randomized markdown-shaped input.
 */

/**
 * `from → source.indexOf(ch, from)`, memoized for non-decreasing `from`: the
 * first `ch` at or after an earlier `from` is still the first one at or after
 * a later `from` as long as it lies at or past it — and when there was none,
 * there is none later either. A decreasing `from` falls back to `indexOf`.
 */
function nextIndexOf(source: string, ch: string): (from: number) => number {
  let lastFrom = -1
  let lastHit = -1
  return (from) => {
    if (from >= lastFrom && lastFrom !== -1 && (lastHit === -1 || lastHit >= from)) return lastHit
    lastFrom = from
    lastHit = source.indexOf(ch, from)
    return lastHit
  }
}

/**
 * Exactly `source.replace(/O([^C]{minInner,})C/g, (_, inner) => replace(inner))`
 * for single characters `O !== C` (`minInner` 0 is `*`, 1 is `+`), in linear
 * time. `replace` is called in match order, as `String#replace` calls it.
 */
export function replaceDelimited(
  source: string,
  open: string,
  close: string,
  minInner: 0 | 1,
  replace: (inner: string) => string,
): string {
  const closeFrom = nextIndexOf(source, close)
  let out = ''
  let last = 0
  let i = source.indexOf(open)
  while (i !== -1) {
    const j = closeFrom(i + 1)
    // No closer after this opener means none after any later opener either.
    if (j === -1) break
    if (j - i - 1 >= minInner) {
      out += source.slice(last, i) + replace(source.slice(i + 1, j))
      last = j + 1
      i = source.indexOf(open, last)
    } else {
      i = source.indexOf(open, i + 1)
    }
  }
  return last === 0 ? source : out + source.slice(last)
}

/**
 * Exactly the first capture of `source.match(/O([^C]{minInner,})C/)` (or
 * `null`) for single characters `O !== C`, in linear time.
 */
export function firstDelimited(source: string, open: string, close: string, minInner: 0 | 1): string | null {
  let i = source.indexOf(open)
  while (i !== -1) {
    const j = source.indexOf(close, i + 1)
    if (j === -1) return null
    if (j - i - 1 >= minInner) return source.slice(i + 1, j)
    i = source.indexOf(open, i + 1)
  }
  return null
}

/**
 * Exactly `source.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')` — markdown
 * link / image syntax reduced to its text — in linear time.
 */
export function replaceMarkdownLinks(source: string): string {
  const bracketFrom = nextIndexOf(source, ']')
  const parenFrom = nextIndexOf(source, ')')
  let out = ''
  let last = 0
  let b = source.indexOf('[')
  while (b !== -1) {
    const j = bracketFrom(b + 1)
    if (j === -1) break
    if (source.charCodeAt(j + 1) !== 40 /* ( */) {
      b = source.indexOf('[', b + 1)
      continue
    }
    const k = parenFrom(j + 2)
    // No `)` after this `](` means none after any later `](` either.
    if (k === -1) break
    // The regex tries the position BEFORE `[` first, so a preceding `!`
    // (not already consumed by the previous match) belongs to this match.
    const start = b - 1 >= last && source.charCodeAt(b - 1) === 33 /* ! */ ? b - 1 : b
    out += source.slice(last, start) + source.slice(b + 1, j)
    last = k + 1
    b = source.indexOf('[', last)
  }
  return last === 0 ? source : out + source.slice(last)
}

const isAsciiLetter = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
/** `[\w-]`: ASCII letters, digits, `_` and `-`. */
const isWordOrDash = (c: number): boolean =>
  isAsciiLetter(c) || (c >= 48 && c <= 57) || c === 95 /* _ */ || c === 45 /* - */

/**
 * Exactly
 * `source.replace(/([A-Za-z][\w-]*)=("([^"]*)"|'([^']*)')/g, (_, k, _q, dq, sq) => replace(k, dq ?? sq))`
 * in linear time. The regex was quadratic on a long `[\w-]` run with no `=`:
 * it retried at every letter of the run and rescanned the run each time.
 *
 * Every letter in one `[\w-]` run shares the run's end, so the run either
 * matches at its FIRST letter or nowhere — that is what lets the scan skip a
 * failed run whole.
 */
export function replaceQuotedPairs(source: string, replace: (key: string, value: string) => string): string {
  const quoteFrom = { '"': nextIndexOf(source, '"'), "'": nextIndexOf(source, "'") }
  let out = ''
  let last = 0
  let i = 0
  const n = source.length
  while (i < n) {
    if (!isAsciiLetter(source.charCodeAt(i))) {
      i++
      continue
    }
    let q = i + 1
    while (q < n && isWordOrDash(source.charCodeAt(q))) q++
    const quote = source[q + 1]
    if (source.charCodeAt(q) === 61 /* = */ && (quote === '"' || quote === "'")) {
      const r = quoteFrom[quote](q + 2)
      if (r !== -1) {
        out += source.slice(last, i) + replace(source.slice(i, q), source.slice(q + 2, r))
        last = r + 1
        i = last
        continue
      }
    }
    i = q
  }
  return last === 0 ? source : out + source.slice(last)
}
