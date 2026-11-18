/**
 * RFC 5545 section 3.8.5.3 ("Recurrence Rule"), every example, as a fixed table. The table in `rfc5545-examples.ts` was read from
 * the text of the RFC; each case below parses the RFC's own DTSTART / EXDATE / RRULE lines with `parseRRule` and expands them.
 * The RFC lists times in America/New_York; occurrences are wall-clock times, so the lists compare directly.
 */
import { describe, expect, it } from 'vitest'
import { occurrences, parseRRule } from '../core'
import { RFC_EXAMPLES, type RfcExample } from './rfc5545-examples'

/**
 * Where the RFC text itself is wrong. Example "Every 3 hours from 9:00 AM to 5:00 PM" writes UNTIL=19970902T170000Z, but 17:00
 * UTC is 13:00 in New York, so the RFC's own list (09:00, 12:00, 15:00) cannot be right (RFC errata ID 3883 gives 210000Z). We
 * run the errata form for the RFC list, and assert what the printed text really means.
 */
const ERRATA: Record<number, { rrules: string[] }> = { 33: { rrules: ['FREQ=HOURLY;INTERVAL=3;UNTIL=19970902T210000Z'] } }

function textOf(ex: RfcExample, rrule: string): string {
  const lines = [`DTSTART;TZID=America/New_York:${ex.dtstart.replace(/[-:]/g, '')}00`]

  for (const e of ex.exdate) lines.push(`EXDATE;TZID=America/New_York:${e.replace(/[-:]/g, '')}00`)
  lines.push(`RRULE:${rrule}`)

  return lines.join('\n')
}

function expand(ex: RfcExample, rrule: string): string[] {
  const rule = parseRRule(textOf(ex, rrule))
  const wanted = ex.expect.length

  return [...occurrences(rule, { limit: ex.open ? Math.max(wanted * 3, 60) : 5000 })] as string[]
}

describe('RFC 5545 section 3.8.5.3 examples', () => {
  it('transcribed every example of the section', () => {
    expect(RFC_EXAMPLES).toHaveLength(39)
    expect(new Set(RFC_EXAMPLES.map((e) => e.id)).size).toBe(39)
  })

  for (const ex of RFC_EXAMPLES) {
    const rrules = ERRATA[ex.id]?.rrules ?? ex.rrules

    for (const [i, rrule] of rrules.entries()) {
      it(`#${ex.id} ${ex.title} [${rrule}]${rrules.length > 1 ? ` (form ${i + 1})` : ''}`, () => {
        const got = expand(ex, rrule)

        if (!ex.open) {
          expect(got).toEqual(ex.expect)

          return
        }
        // The RFC elides entries with "...": the listed ones must appear in order, and the part before the first elision is exact.
        const cut = ex.gaps.length > 0 ? ex.gaps[0]! + 1 : ex.expect.length

        expect(got.slice(0, cut)).toEqual(ex.expect.slice(0, cut))
        let at = 0

        for (const want of ex.expect) {
          const found = got.indexOf(want, at)

          expect(found, `${want} is listed by the RFC but was not produced`).toBeGreaterThanOrEqual(at)
          at = found + 1
        }
      })
    }
  }

  it('the printed UNTIL=19970902T170000Z reads as 13:00 New York, so only 09:00 and 12:00 (the RFC text lists 15:00 as well: an erratum)', () => {
    const ex = RFC_EXAMPLES.find((e) => e.id === 33)!

    expect(expand(ex, ex.rrules[0]!)).toEqual(['1997-09-02T09:00', '1997-09-02T12:00'])
  })
})
