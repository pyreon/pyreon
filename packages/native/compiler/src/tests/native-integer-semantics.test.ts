import { describe, expect, it } from 'vitest'
import { canRunKotlin, canRunSwift, caseNames, emitCorpus, mismatches, runKotlin, runSwift, runWeb } from './differential-harness'

/**
 * Integer arithmetic gives the web's results on both targets (`integer-arithmetic.ts`, the helpers in
 * `PyreonNumber.swift` / `PyreonNumber.kt`).
 *
 * Every case below compiled before and either crashed or printed a different number, with no warning:
 * - the bitwise operators were 64-bit (`3 << 31` was 6442450944, `1 << 32` was 4294967296; the web's are 32-bit);
 * - `(h * 31 + c) | 0`, the everyday 32-bit hash, TRAPPED in Swift (64-bit overflow) and WRAPPED in Kotlin before
 *   the `| 0` could fold it;
 * - an integer product past 2^63 trapped in Swift and wrapped (to 0, or negative) in Kotlin;
 * - past 2^53 the integer result kept digits the web's double does not have (`2^53 + 1`);
 * - `x % 0` trapped (Swift) / threw (Kotlin), and a Swift `Double % Double` did not compile;
 * - `Math.max(...[])` was `Int.min` / `Long.MIN_VALUE` where the web says -Infinity.
 *
 * Two web answers no 64-bit integer can hold are NOT matched, and are locked as the rule instead (identical on both
 * targets, never a crash): a result past ±2^63 saturates, and an integer `% 0` is 0 (NaN's integer value).
 *
 * Not covered here: an integer past 2^53 PRINTS its exact digits natively (`String(Int)`), where the web prints the
 * double's shortest form (`4611686014132420608` vs `4611686014132420600`). The VALUE is the web's (the cases compare
 * it by subtraction); the text is a separate number-to-text gap.
 */
// Shapes that COMPILED before and gave a different answer (or crashed).
const SILENT = `
function big(): number { const a = 2147483647; return a * a }
function hash(cs: number[]): number { let h = 7; for (const c of cs) { h = h * 31 + c } return h }
function hash32(cs: number[]): number { let h = 7; for (const c of cs) { h = (h * 31 + c) | 0 } return h }
function bump(x: number): number { let i = x; for (const k of [1]) { i++; i += 3 * k; i *= 2; i -= 1; i %= 5 } return i }
function grow(x: number): number { let i = x; for (const k of [1]) { i *= 4 * k } return i }
const CS = [104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100, 33, 33, 33, 33, 33]
export function c_shl(): string { const a = 3; return String(a << 31) }
export function c_shl_count_mod32(): string { const a = 1; return String(a << 32) + ',' + String(a << 33) }
export function c_or_zero(): string { const a = 2147483647; return String((a + 1) | 0) }
export function c_and(): string { const a = -1; return String(a & 0xfff) }
export function c_xor(): string { const a = 2147483647; return String((a * 3) ^ 1) }
export function c_shr(): string { const a = -16; return String(a >> 2) }
export function c_hash32(): string { return String(hash32(CS)) }
export function c_past_2_53(): string { const a = 9007199254; const b = 1001000; return String(a * b + 1) + ',' + String(a * b + 993) }
export function c_big_square(): string { return String(big() - 4611686014132420000) + ',' + String(big() * 2 - 9223372028264841000) }
export function c_overflow_saturates(): string { return String(big() * 8) + ',' + String(-big() * 8) + ',' + String(hash(CS)) }
export function c_compound(): string { return String(bump(4)) + ',' + String(grow(big() * 2)) }
export function c_rem(): string { const a = -7; const b = 2; return String(a % b) + ',' + String(a % 3) }
function zero(): number { const z = 0; return z }
export function c_rem_zero(): string { const a = 7; const b = zero(); return String(a % b) }
export function c_index_by_rem(): string { const xs = ['a', 'b', 'c']; const i = 7; return xs[i % xs.length]! }
`

// Shapes that had no lowering at all (\`>>>\` and \`~\` were warned, a bitwise operator over a Double and a Swift
// `Double % Double` did not compile, `Math.max(...[])` was Int.min on iOS and did not compile on Android), each now
// the web's answer.
const NEW = `
function d(x: number): number { return x }
export function c_max_empty(): string { const xs: number[] = []; return String(Math.max(...xs)) + ',' + String(Math.min(...xs)) }
export function c_max_int(): string { const xs = [3, 9, 2]; return String(Math.max(...xs)) + ',' + String(Math.min(...xs)) }
export function c_max_double(): string { const xs = [1.5, 2.5, 2]; return String(Math.max(...xs)) + ',' + String(Math.min(...xs)) }
export function c_max_no_args(): string { return String(Math.max()) + ',' + String(Math.min()) }
export function c_ushr(): string { const a = -16; return String(a >>> 2) + ',' + String(a >>> 0) }
export function c_not(): string { const a = 2147483647; return String(~(a * 2)) }
export function c_double_operands(): string { return String(d(2.7) | 0) + ',' + String(~d(-2.5)) + ',' + String(d(1e20) | 0) + ',' + String(d(-1e10) >> 1) + ',' + String(d(0 / 0) | 0) }
export function c_rem_double(): string { return String(d(7.5) % d(0)) + ',' + String(d(-7.5) % d(2)) }
`

const CORPUS = SILENT + NEW

/** The web's answers no 64-bit integer can hold; the native answer is the locked rule (see the header). */
const NATIVE_RULE: Record<string, string> = {
  c_overflow_saturates: '9223372036854775807,-9223372036854775808,9223372036854775807',
  c_rem_zero: '0',
  c_compound: '0,9223372036854775807',
}

function expected(corpus: string): string[] {
  return runWeb(corpus).map((w, i) => NATIVE_RULE[caseNames(corpus)[i]!] ?? w)
}

describe('integer arithmetic matches the web on both targets', () => {
  it('the corpus is what it claims', () => {
    const web = runWeb(CORPUS)
    const at = (n: string) => web[caseNames(CORPUS).indexOf(n)]
    expect(at('c_shl')).toBe('-2147483648')
    expect(at('c_past_2_53')).toBe('9016206453254000,9016206453254992')
    expect(at('c_max_empty')).toBe('-Infinity,Infinity')
    expect(at('c_rem_zero')).toBe('NaN')
    // The web's own answer here is not an integer; the native rule replaces it.
    expect(at('c_overflow_saturates')).toContain('e+')
  })

  it('every integer operator goes through the helpers, and nothing warns', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code, warnings } = emitCorpus(CORPUS, target)
      expect(warnings).toEqual([])
      for (const h of ['pyreonShl(', 'pyreonUshr(', 'pyreonBitNot(', 'pyreonMul(', 'pyreonAdd(', 'pyreonRem(', 'pyreonMax(']) {
        expect(code, `${target}: ${h}`).toContain(h)
      }
    }
  })

  for (const [label, corpus] of [['compiled before, now the web answer', SILENT], ['newly lowered', NEW]] as const) {
    it.runIf(canRunSwift())(`Swift (${label}): the web results, no trap`, () => {
      expect(mismatches(caseNames(corpus), expected(corpus), runSwift(corpus))).toEqual([])
    }, 600_000)

    it.runIf(canRunKotlin())(`Kotlin (${label}): the web results, no wrap`, () => {
      expect(mismatches(caseNames(corpus), expected(corpus), runKotlin(corpus))).toEqual([])
    }, 600_000)
  }
})
