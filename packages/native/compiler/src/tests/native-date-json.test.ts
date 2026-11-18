// A `Date` struct field crosses JSON as the web's ISO string on both native targets (issue #4567).
//
// Natively a date is its epoch milliseconds, a `Double` (date-lowering.ts). `parseTypeAnnotation` used to turn the
// `Date` type into a plain fractional number, so a field typed `Date` was a `Double` to the decoder as well: the ISO
// string every server sends ("2024-01-02T03:04:05.000Z") failed the WHOLE decode on iOS and Android — a fetch's data
// stayed empty, a `JSON.parse` threw — and `JSON.stringify` wrote the milliseconds where the web writes the string.
// The type now keeps a `date` mark, and a struct field carrying it is declared with the runtimes' ISO-string codec
// (date-json.ts): Swift property wrappers (`PyreonDate.swift`), kotlinx serializers (`PyreonDateJson.kt`, compiled
// here against the REAL kotlinx-serialization jars). The field's value is still the `Double`.
//
// Known limit, stated rather than hidden: the web's `JSON.parse` does not revive dates, so a decoded field is the
// server's own TEXT there and `JSON.stringify` echoes it unchanged. Natively it is a date and is written back as
// `toISOString()`. The two agree for every string `toISOString` produces (what a JavaScript server sends); a
// non-canonical one (`2024-01-02T04:04:05+01:00`, no milliseconds) is re-written in canonical form.

import { describe, expect, it } from 'vitest'
import { canRunKotlin, canRunSwift, caseNames, mismatches, runKotlin, runSwift, runWeb } from './differential-harness'
import { transform } from './first-party-plugins'

const CORPUS = `
type Ev = { id: number; at: Date; seen?: Date; all: Date[] }
function ev(text: string): Ev { try { return JSON.parse(text) as Ev } catch { return { id: -1, at: new Date(0), all: [] } } }
const FULL = '{"id":1,"at":"2024-01-02T03:04:05.678Z","seen":"1999-12-31T23:59:59.000Z","all":["2020-02-29T00:00:00.000Z","1970-01-01T00:00:00.000Z"]}'
export function c_decode_roundtrip(): string { return JSON.stringify(ev(FULL)) }
export function c_decode_optional_missing(): string { return JSON.stringify(ev('{"id":2,"at":"2024-01-02T03:04:05.678Z","all":[]}')) }
export function c_decode_reads_as_date(): string { const e = ev(FULL); const d = new Date(e.at); return String(d.getUTCFullYear()) + '-' + String(d.getUTCMonth()) + '-' + String(d.getUTCDate()) + ' ' + String(d.getTime()) }
export function c_decode_list(): string { const e = ev(FULL); return e.all.map((a) => String(new Date(a).getTime())).join(',') }
export function c_decode_null_at(): string { return JSON.stringify(ev('{"id":3,"at":null,"all":[]}')) }
export function c_decode_far_year(): string { return JSON.stringify(ev('{"id":4,"at":"+012345-06-07T08:09:10.011Z","all":[]}')) }
export function c_encode_constructed(): string { const e: Ev = { id: 5, at: new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 6)), all: [new Date(Date.UTC(2001, 8, 9))] }; return JSON.stringify(e) }
export function c_encode_invalid(): string { const e: Ev = { id: 6, at: new Date('not a date'), all: [] }; return JSON.stringify(e) }
`

describe('a Date field crosses JSON as the ISO string', () => {
  it('the corpus is what it claims', () => {
    const web = runWeb(CORPUS)
    expect(web[0]).toBe(
      '{"id":1,"at":"2024-01-02T03:04:05.678Z","seen":"1999-12-31T23:59:59.000Z","all":["2020-02-29T00:00:00.000Z","1970-01-01T00:00:00.000Z"]}',
    )
    expect(web[7]).toBe('{"id":6,"at":null,"all":[]}')
  })

  it('the struct declares each Date field with the ISO codec, and nothing else changes', () => {
    const src = `${CORPUS}\nexport function H() { return null }`
    const swift = transform(src, { target: 'swift' })
    expect(swift.code).toContain('struct Ev: Codable {\n  var id: Int\n  @PyreonISODate var at: Double\n  @PyreonOptionalISODate var seen: Double? = nil\n  @PyreonISODates var all: [Double]\n}')
    const kotlin = transform(src, { target: 'kotlin' })
    expect(kotlin.code).toContain(
      'data class Ev(var id: Long, @Serializable(with = PyreonDateSerializer::class) var at: Double, @Serializable(with = PyreonDateSerializer::class) var seen: Double? = null, @Serializable(with = PyreonDateListSerializer::class) var all: List<Double>)',
    )
    expect([...swift.warnings, ...kotlin.warnings].filter((w) => w.includes('Date'))).toEqual([])
  })

  it('a Date nested deeper than a field has no codec and is named', () => {
    const src = `type Cal = { days: Record<string, Date> }\nexport function H() { const c: Cal = { days: {} }; return <Text>{String(Object.keys(c.days).length)}</Text> }`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.join('\n')).toContain('`Cal.days` holds a `Date` inside another type')
    }
  })

  it.runIf(canRunSwift())('Swift matches the web', () => {
    expect(mismatches(caseNames(CORPUS), runWeb(CORPUS), runSwift(CORPUS))).toEqual([])
  }, 600_000)

  it.runIf(canRunKotlin())('Kotlin matches the web', () => {
    expect(mismatches(caseNames(CORPUS), runWeb(CORPUS), runKotlin(CORPUS))).toEqual([])
  }, 600_000)
})
