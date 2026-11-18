import { describe, expect, it } from 'vitest'
import { validateSwiftWithStubs } from '../validate'
import { canRunKotlin, canRunSwift, caseNames, emitCorpus, mismatches, runKotlin, runSwift, runWeb } from './differential-harness'
import { transform } from './first-party-plugins'

/**
 * An optional value turned into text reads as it does on the web.
 *
 * Swift's `"\(x)"` over an optional prints its DEBUG description and Kotlin's `"${x}"` prints `null`, and both
 * compiled with no PMTC warning:
 *   `` `f=${xs.find((x) => x > 1)}` `` → web `f=2`, iOS `f=Optional(2)`;
 *   absent → web `f=undefined`, iOS `f=nil`, Android `f=null`;
 *   `` `n=${u.nick}` `` (an optional field) → iOS `n=Optional("b")`.
 * Every such position (template literal, `'text' + x`, `String(x)`) now goes through the runtimes'
 * `pyreonOptionalText`, and the Swift typecheck gates REJECT any optional interpolation left in emitted code
 * (swiftc's own "debug description for an optional value" warning, read by `runSwiftcTypecheck`).
 */
const CORPUS = `
type Double = number
type U = { name: string; nick?: string; age: number | null; score?: Double }
function at(xs: number[], i: number): string { return \`v=\${xs.at(i)}\` }
function findv(xs: number[]): string { return \`f=\${xs.find((x) => x > 1)}\` }
function findLastv(xs: number[]): string { return \`l=\${xs.findLast((x) => x > 1)}\` }
function mget(k: string): string { const m = new Map<string, number>(); m.set('a', 1); return \`g=\${m.get(k)}\` }
function nick(u: U): string { return \`n=\${u.nick}\` }
function nickCat(u: U): string { return 'n=' + u.nick }
function nickStr(u: U): string { return String(u.nick) }
function age(u: U): string { return \`a=\${u.age}\` }
function score(u: U): string { return \`s=\${u.score}\` }
function chain(u: U | null): string { return \`c=\${u?.name}\` }
export function c_at_present(): string { return at([1, 2, 3], -1) }
export function c_at_absent(): string { return at([1, 2, 3], 7) }
export function c_find_present(): string { return findv([1, 2, 3]) }
export function c_find_absent(): string { return findv([1]) }
export function c_findlast_present(): string { return findLastv([1, 2, 3]) }
export function c_mget_present(): string { return mget('a') }
export function c_mget_absent(): string { return mget('b') }
export function c_nick_present(): string { return nick({ name: 'a', nick: 'b', age: null }) }
export function c_nick_absent(): string { return nick({ name: 'a', age: null }) }
export function c_nick_cat_present(): string { return nickCat({ name: 'a', nick: 'b', age: null }) }
export function c_nick_cat_absent(): string { return nickCat({ name: 'a', age: null }) }
export function c_nick_string_absent(): string { return nickStr({ name: 'a', age: null }) }
export function c_age_null(): string { return age({ name: 'a', age: null }) }
export function c_age_present(): string { return age({ name: 'a', age: 4 }) }
export function c_score_double(): string { return score({ name: 'a', age: null, score: 2.5 }) }
export function c_chain_absent(): string { return chain(null) }
export function c_chain_present(): string { return chain({ name: 'z', age: null }) }
`

describe('an optional value as text matches the web on both targets', () => {
  it('every optional interpoland goes through pyreonOptionalText with the TS type\'s absent spelling', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code } = emitCorpus(CORPUS, target)
      expect(code).toContain('pyreonOptionalText(')
      expect(code).toContain('"null")')
      expect(code).toContain('"undefined")')
    }
  })

  it.skipIf(!canRunSwift())('end to end: the compiled Swift agrees with the web on every case', () => {
    expect(mismatches(caseNames(CORPUS), runWeb(CORPUS), runSwift(CORPUS))).toEqual([])
  }, 600_000)

  it.skipIf(!canRunKotlin())('end to end: the compiled Kotlin agrees with the web on every case', () => {
    expect(mismatches(caseNames(CORPUS), runWeb(CORPUS), runKotlin(CORPUS))).toEqual([])
  }, 600_000)

  it('the Swift typecheck gate rejects an optional interpolated as a debug description', () => {
    const r = validateSwiftWithStubs('import SwiftUI\nfunc label(_ x: Int?) -> String { "v=\\(x)" }\n')
    if (r.skipped) return
    expect(r.ok).toBe(false)
    expect(r.error).toContain('debug description for an optional value')
    // …and accepts the lowered form.
    const ok = validateSwiftWithStubs(transform(`function label(x: number | undefined): string { return \`v=\${x}\` }
export function App() { return <Text>{label(1)}</Text> }`, { target: 'swift' }).code ?? '')
    expect(ok.error).toBeUndefined()
    expect(ok.ok).toBe(true)
  }, 180_000)
})
