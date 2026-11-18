import { describe, expect, it } from 'vitest'
import { canRunKotlin, canRunSwift, caseNames, mismatches, runKotlin, runSwift, runWeb } from './differential-harness'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * A JSON payload the web decodes, decodes to the same value natively.
 *
 * Each of these compiled with no warning and lost data or failed the whole decode on device:
 * - a QUOTED member name in a type (`'content-type': string`, the shape of an HTTP header map) was dropped from the
 *   struct — the field simply was not there after a decode, and a literal's value vanished from `JSON.stringify`;
 * - Kotlin rejected `3.0` for a field PMTC types as an integer (kotlinx `Long`), so one whole number written with a
 *   fraction failed the entire decode; Swift's `JSONDecoder` already accepted it;
 * - Swift could not decode `Record<number, T>` at all (a JSON object; the map only read a `[k, v, …]` array) and
 *   encoded it as an array.
 *
 * Not matched yet, so not in the corpus: the web enumerates INTEGER-LIKE keys ascending whatever order the text has.
 * Swift inserts `Record<number, T>` keys sorted; Kotlin keeps the document's order (and neither target reorders an
 * integer-like key of a string-keyed `Record`).
 * - `@pyreon/validation`'s `number()` was typed `Int`, so a schema the web accepts `1.5` for rejected it natively.
 */
const CORPUS = `
type Hdr = { 'content-type': string; status: number; 'x-request-id'?: string }
type Cnt = { n: number; items: number[] }
type Book = { title: string; ratings: Record<number, string> }
function decHdr(): Hdr { return JSON.parse('{"content-type":"text/html","status":200,"x-request-id":"r1"}') as Hdr }
function decCnt(): Cnt { return JSON.parse('{"n":3.0,"items":[1.0,2e0,-0.0]}') as Cnt }
function decRec(): Record<number, string> { return JSON.parse('{"1":"a","20":"b"}') as Record<number, string> }
function decBook(): Book { return JSON.parse('{"title":"t","ratings":{"3":"ok","5":"great"}}') as Book }
export function c_quoted_keys(): string { try { return JSON.stringify(decHdr()) } catch { return 'err' } }
export function c_quoted_literal(): string { const h: Hdr = { 'content-type': 'a', status: 1 }; return JSON.stringify(h) }
export function c_whole_double_for_int(): string { try { const c = decCnt(); return String(c.n + 1) + ',' + String(c.items[1]! + c.items[0]!) } catch { return 'err' } }
export function c_record_number_keys(): string { try { return JSON.stringify(decRec()) } catch { return 'err' } }
export function c_record_number_nested(): string { try { return JSON.stringify(decBook()) } catch { return 'err' } }
`

describe('a JSON payload decodes to the web value on both targets', () => {
  it('the corpus is what it claims', () => {
    const web = runWeb(CORPUS)
    expect(web).not.toContain('err')
    expect(web[caseNames(CORPUS).indexOf('c_record_number_keys')]).toBe('{"1":"a","20":"b"}')
  })

  it('a quoted member name is a struct field on both targets', () => {
    const sw = transform(`${CORPUS}\nexport function H() { return null }`, { target: 'swift' }).code ?? ''
    expect(sw).toMatch(/struct Hdr: Codable \{\n  var contentType: String\n/)
    expect(sw).toContain('case contentType = "content-type"')
    const kt = transform(`${CORPUS}\nexport function H() { return null }`, { target: 'kotlin' }).code ?? ''
    expect(kt).toContain('data class Hdr(var `content-type`: String, var status: Long, var `x-request-id`: String? = null)')
  })

  it.runIf(canRunSwift())('Swift decodes the web value', () => {
    expect(mismatches(caseNames(CORPUS), runWeb(CORPUS), runSwift(CORPUS))).toEqual([])
  }, 600_000)

  it.runIf(canRunKotlin())('Kotlin decodes the web value', () => {
    expect(mismatches(caseNames(CORPUS), runWeb(CORPUS), runKotlin(CORPUS))).toEqual([])
  }, 600_000)
})

const SCHEMA = `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({
  price: z.number(),
  qty: z.number().int(),
  discount: z.number().optional(),
}))
`

describe('a schema number() accepts a fraction natively, as on the web', () => {
  it('number() is a Double, number().int() an integer, on both targets', () => {
    const sw = transform(SCHEMA, { target: 'swift' }).code ?? ''
    expect(sw).toContain('var price: Double = 0')
    expect(sw).toContain('var qty: Int = 0')
    expect(sw).toContain('var discount: Double? = nil')
    expect(sw).toContain('input["price"] as? Double')
    const kt = transform(SCHEMA, { target: 'kotlin' }).code ?? ''
    expect(kt).toContain('var price: Double = 0.0')
    expect(kt).toContain('var discount: Double? = null')
    expect(kt).toContain('(input["price"] as? Number)?.toDouble()')
  })

  it.runIf(isSwiftcAvailable())('swiftc accepts it (stubs)', () => {
    const r = validateSwiftWithStubs(transform(SCHEMA, { target: 'swift' }).code ?? '')
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(isKotlincAvailable())('kotlinc accepts it', () => {
    const r = validateKotlin(transform(SCHEMA, { target: 'kotlin' }).code ?? '')
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)
})
