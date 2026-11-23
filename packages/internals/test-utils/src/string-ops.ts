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
}

type AnyFn = (this: unknown, ...args: unknown[]) => unknown
type CountedMethod = (typeof COUNTED_STRING_METHODS)[number]

export function countStringOps<T>(fn: () => T): StringOpsTrace<T> {
  const regexSources: string[] = []
  let stringCalls = 0
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
      return original.apply(this, args)
    }
  }
  rxProto.exec = function (this: unknown, ...args: unknown[]) {
    const rx = this as RegExp
    regexSources.push(`/${rx.source}/${rx.flags}`)
    return originalExec.apply(this, args)
  }
  try {
    const result = fn()

    return { result, regexSources, stringCalls }
  } finally {
    for (const [name, original] of originals) strProto[name] = original
    rxProto.exec = originalExec
  }
}
