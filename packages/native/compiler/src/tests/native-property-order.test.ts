// A string-keyed object lists its keys in the web's OWN-PROPERTY order on both native targets, and a decoded JSON
// object keeps the web's rule for a repeated key.
//
// Three divergences, found after #4541 made Map / Record iterate in insertion order (issue #4568):
//
// - A repeated key: the web's `JSON.parse('{"a":1,"a":3}')` keeps the LAST value at the key's first position. Swift's
//   `JSONDecoder` kept the FIRST value, for a `Record` and for a struct field alike. `PyreonJSON.decode` now drops
//   every earlier occurrence from the text before decoding. (kotlinx already keeps the last value.)
// - Array-index keys: a JavaScript object lists "0", "7", "42" (canonical integers up to 2^32 − 2) FIRST, ascending,
//   then every other key in insertion order — `{ b: 1, '2': 2, '1': 3 }` is `1,2,b`, from a literal, an assignment
//   or a decode. (Found on the way: `const r: Record<…> = {}; r[k] = v` did not compile on Swift — the subscript write
//   left `r` a `let`. An index write now makes its local mutable, as `=` and `push` already did.) Both targets listed plain insertion order. A `Map` keeps insertion order and lowers to the same
//   type, so the rule is applied where a RECORD is observed: `Object.keys` / `Object.values` lower to
//   `pyreonRecordKeys` / `pyreonRecordValues`, and `JSON.stringify` writes objects in that order.
// - iOS `PyreonStream` / `PyreonStorage` decoded with a bare `JSONDecoder` (hash key order, first value of a repeated
//   key). They now `import PyreonRuntime` and use `PyreonJSON`; their own Swift tests (run by the co-source gate,
//   which now builds the base runtime as the module the app links) lock that, and the storage writes the web's bytes.

import { describe, expect, it } from 'vitest'
import { canRunKotlin, canRunSwift, caseNames, mismatches, runKotlin, runSwift, runWeb } from './differential-harness'
import { transform } from './first-party-plugins'

const CORPUS = `
// Decodes sit in helpers so each case binds its result at function level, where the local is typed.
function rec(text: string): Record<string, number> { try { return JSON.parse(text) as Record<string, number> } catch { return { err: 1 } } }
type Row = { name: string; n: number }
function row(text: string): Row { try { return JSON.parse(text) as Row } catch { return { name: 'err', n: 0 } } }
type Box = { tags: Record<string, number> }
function box(text: string): Box { try { return JSON.parse(text) as Box } catch { return { tags: { err: 1 } } } }
export function c_decode_repeated(): string { return JSON.stringify(rec('{"a":1,"b":2,"a":3}')) }
export function c_decode_repeated_keys(): string { const r = rec('{"zeta":1,"alpha":2,"zeta":3,"mid":4,"k":5,"zeta":6}'); return Object.keys(r).join(',') + ' ' + Object.values(r).join(',') }
export function c_decode_index_keys(): string { return Object.keys(rec('{"b":1,"10":2,"2":3,"a":4,"1":5,"01":6,"-1":7,"4294967295":8,"4294967294":9,"0":10}')).join(',') }
export function c_decode_index_values(): string { return Object.values(rec('{"b":1,"10":2,"2":3,"a":4}')).join(',') }
export function c_decode_index_stringify(): string { return JSON.stringify(rec('{"b":1,"10":2,"2":3,"a":4}')) }
export function c_struct_repeated(): string { const r = row('{"name":"x","n":1,"n":2}'); return r.name + String(r.n) }
export function c_nested_repeated(): string { const b = box('{"tags":{"y":1,"x":2,"y":3},"tags":{"q":1,"7":2,"p":3,"q":4}}'); return JSON.stringify(b) + ' ' + Object.keys(b.tags).join(',') }
export function c_literal_index_keys(): string { const r: Record<string, number> = { b: 1, '2': 2, '1': 3, a: 4 }; return Object.keys(r).join(',') + ' ' + Object.values(r).join(',') + ' ' + JSON.stringify(r) }
export function c_assigned_index_keys(): string { const r: Record<string, number> = {}; r['b'] = 1; r['2'] = 2; r['zeta'] = 3; r['1'] = 4; r['b'] = 5; return Object.keys(r).join(',') + ' ' + JSON.stringify(r) }
export function c_map_keeps_insertion(): string { const m = new Map<string, number>([['b', 1], ['2', 2], ['1', 3]]); return [...m.keys()].join(',') }
`

describe('own-property order and repeated keys, end to end on both targets', () => {
  it('the corpus is what it claims', () => {
    const web = runWeb(CORPUS)
    for (const r of web) expect(r).not.toContain('err')
    expect(web[0]).toBe('{"a":3,"b":2}')
    expect(web[2]).toBe('0,1,2,10,4294967294,b,a,01,-1,4294967295')
  })

  it('Object.keys / Object.values of a Record lower to the own-property-order helpers on both targets', () => {
    const src = `${CORPUS}\nexport function H() { return null }`
    for (const target of ['swift', 'kotlin'] as const) {
      const code = transform(src, { target }).code ?? ''
      expect(code).toContain('pyreonRecordKeys(')
      expect(code).toContain('pyreonRecordValues(')
    }
  })

  it.runIf(canRunSwift())('Swift matches the web', () => {
    expect(mismatches(caseNames(CORPUS), runWeb(CORPUS), runSwift(CORPUS))).toEqual([])
  }, 600_000)

  it.runIf(canRunKotlin())('Kotlin matches the web', () => {
    expect(mismatches(caseNames(CORPUS), runWeb(CORPUS), runKotlin(CORPUS))).toEqual([])
  }, 600_000)
})
