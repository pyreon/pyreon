import { describe, expect, it } from 'vitest'
import { canRunKotlin, canRunSwift, caseNames, emitCorpus, mismatches, runKotlin, runSwift, runWeb } from './differential-harness'

/**
 * Splitting a string into pieces gives the web's pieces on both targets (`pyreonSplit` / `pyreonCodePoints` in
 * `PyreonSlice.swift` / `PyreonSlice.kt`).
 *
 * What compiled before and answered differently, with no warning:
 * - `str.split('')` was ONE element on iOS (`components(separatedBy: "")` returns the whole string) and had an extra
 *   empty string at each end on Android (Kotlin's `split("")`), where the web splits into UTF-16 code units:
 *   `'a🙂'.split('')` is three elements, `''.split('')` is none. The reverse-a-string idiom
 *   `s.split('').reverse().join('')` returned `s` unchanged on iOS.
 * - `[...str]` and `Array.from(str)` iterate CODE POINTS on the web. Android counted UTF-16 units (`[...'a🙂b'].length`
 *   was 4) and iOS counted grapheme clusters (a flag, or a letter plus a combining mark, was one element).
 *
 * Swift cannot hold half of a surrogate pair in a `String`, so `split('')` of an astral character gives two U+FFFD
 * elements on iOS: the count matches, the halves do not. The corpus states that limit rather than hiding it.
 */
// Shapes that compiled before and answered differently.
const SILENT = `
function s(x: string): string { return x }
export function c_split_empty_count(): string { return String(s('a🙂').split('').length) }
export function c_split_empty_bmp(): string { return s('héllo').split('').join('|') }
export function c_split_empty_receiver(): string { return String(s('').split('').length) + ',' + String(s('').split(',').length) }
export function c_split_reverse(): string { return s('stressed').split('').reverse().join('') }
export function c_split_limit(): string { return s('abc').split('', 2).join('|') + ',' + s('a,b,c').split(',', 2).join('|') }
export function c_split_separator(): string { return s(',a,,b,').split(',').join('|') + ',' + s('a::b::c').split('::').length }
export function c_split_astral_count(): string { return String(s('🙂🙂x').split('').length) }
export function c_spread_code_points(): string { return String([...s('a🙂b')].length) + ',' + String([...s('🇨🇿e\\u0301')].length) }
`

// Shapes that did not compile before (a Swift \`[Character]\` / Kotlin \`List<Char>\` where strings were expected).
const NEW = `
function t(x: string): string { return x }
export function c_spread_join(): string { return [...t('a🙂b')].join('|') }
export function c_array_from(): string { return Array.from(t('a🙂b')).join('|') + ',' + String(Array.from(t('🇨🇿')).length) }
`

const CORPUS = SILENT + NEW

describe('splitting a string gives the web pieces on both targets', () => {
  it('the corpus is what it claims', () => {
    const web = runWeb(CORPUS)
    const at = (n: string) => web[caseNames(CORPUS).indexOf(n)]
    expect(at('c_split_empty_count')).toBe('3')
    expect(at('c_split_empty_receiver')).toBe('0,1')
    expect(at('c_spread_code_points')).toBe('3,4')
  })

  it('both targets go through the runtime helpers, with no warning', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code, warnings } = emitCorpus(CORPUS, target)
      expect(warnings).toEqual([])
      expect(code).toContain('pyreonSplit(')
      expect(code).toContain('pyreonCodePoints(')
      expect(code).not.toContain('components(separatedBy')
    }
  })

  for (const [label, corpus] of [['compiled before', SILENT], ['newly lowered', NEW]] as const) {
    it.runIf(canRunSwift())(`Swift (${label}): the web pieces`, () => {
      expect(mismatches(caseNames(corpus), runWeb(corpus), runSwift(corpus))).toEqual([])
    }, 600_000)

    it.runIf(canRunKotlin())(`Kotlin (${label}): the web pieces`, () => {
      expect(mismatches(caseNames(corpus), runWeb(corpus), runKotlin(corpus))).toEqual([])
    }, 600_000)
  }
})
