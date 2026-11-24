/**
 * Count the regex executions and string-method calls a SYNCHRONOUS function
 * makes — a load-immune way to prove a "linear, no backtracking" claim.
 *
 * WHY THIS EXISTS
 *
 * A ReDoS fix replaces a backtracking regex with string scans. The test that
 * locks it used to time the function at two sizes ({@link expectSubQuadratic}
 * in `./complexity`), and a ratio of two timings can still flip under load:
 * `isMarkdownId`'s went red in `Coverage (Full)` at 29.6x against a bound of
 * 24, because the run had grown its input to 20 MB strings and was measuring
 * the allocator. Worse, its input never reached the old regex's quadratic case,
 * so it also passed against the vulnerable code.
 *
 * Counting has neither problem. Every regex method (`test`, `match`,
 * `replace`, `split`, `search`, `matchAll`) reaches `RegExp.prototype.exec`
 * once that is patched, so `regexSources` lists every pattern that ran; and
 * the string-method count at two input sizes says whether a per-character
 * loop of builtin calls exists. The verdict is a pure function of the code.
 *
 * LIMITS: indexed access (`s[i]`) and `for…of` are not counted, so a loop
 * written that way is invisible here; pair this with a review of the loop, or
 * keep a {@link expectSubQuadratic} for that shape. The function must be
 * synchronous: the patches are removed when it returns.
 */

export const COUNTED_STRING_METHODS = [
  'at',
  'charAt',
  'charCodeAt',
  'codePointAt',
  'endsWith',
  'includes',
  'indexOf',
  'lastIndexOf',
  'match',
  'matchAll',
  'replace',
  'replaceAll',
  'search',
  'slice',
  'split',
  'startsWith',
  'substr',
  'substring',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'trimEnd',
  'trimStart',
] as const

export interface StringOpsTrace<T> {
  result: T
  /** `/source/flags` of every regex execution, in order (one entry per `exec`). */
  regexSources: string[]
  /** Calls to any of {@link COUNTED_STRING_METHODS}. */
  stringCalls: number
  /**
   * Characters `indexOf` examined, summed over its calls: from the start
   * position to the end of the match, or to the end of the string on a miss.
   * A scan that re-searches the same stretch from every position makes a
   * linear number of calls but a quadratic number of these.
   */
  indexOfScanned: number
}

/** The stretch one `indexOf` call reads (see `StringOpsTrace.indexOfScanned`). */
function indexOfSpan(subject: string, args: unknown[], found: number): number {
  const from = Math.min(Math.max(Math.trunc(Number(args[1] ?? 0)) || 0, 0), subject.length)
  return found === -1 ? subject.length - from : found + String(args[0]).length - from
}

type AnyFn = (this: unknown, ...args: unknown[]) => unknown
type CountedMethod = (typeof COUNTED_STRING_METHODS)[number]

export function countStringOps<T>(fn: () => T): StringOpsTrace<T> {
  const regexSources: string[] = []
  let stringCalls = 0
  let indexOfScanned = 0
  const strProto = String.prototype as unknown as Record<CountedMethod, AnyFn>
  const rxProto = RegExp.prototype as unknown as { exec: AnyFn }
  const originals = COUNTED_STRING_METHODS.map((m) => [m, strProto[m]] as const)
  const originalExec = rxProto.exec
  // Nothing between patching and restoring calls a counted method (the
  // bookkeeping is array pushes and template literals), so every count
  // belongs to `fn`.
  for (const [name, original] of originals) {
    strProto[name] = function (this: unknown, ...args: unknown[]) {
      stringCalls++
      const result = original.apply(this, args)
      if (name === 'indexOf') indexOfScanned += indexOfSpan(String(this), args, result as number)

      return result
    }
  }
  rxProto.exec = function (this: unknown, ...args: unknown[]) {
    const rx = this as RegExp
    regexSources.push(`/${rx.source}/${rx.flags}`)
    return originalExec.apply(this, args)
  }
  try {
    const result = fn()

    return { result, regexSources, stringCalls, indexOfScanned }
  } finally {
    for (const [name, original] of originals) strProto[name] = original
    rxProto.exec = originalExec
  }
}
