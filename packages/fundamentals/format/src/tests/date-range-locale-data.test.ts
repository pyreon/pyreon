// #4807: a date range is the platform's CLDR interval pattern, never text Pyreon joins itself. `cs` writes a numeric
// range as "21.10.2026 – 27.10.2026" because that is CLDR's `yMd` interval for Czech (its single dates read "21. 10. 2026"),
// and engines ship different CLDR versions (Node and Bun disagree for sk and pl). So the contract is parity with the
// running engine's `Intl.DateTimeFormat#formatRange` for every locale and shape: expected strings come from `Intl`.
import { formatDateRange } from '../core'

const LOCALES = ['cs', 'sk', 'pl', 'de', 'fr', 'en-US', 'en-GB', 'ja', 'hu', 'ar', 'he', 'zh', 'ko', 'fi', 'pt-BR']

const SHAPES: Array<Intl.DateTimeFormatOptions | undefined> = [
  undefined,
  { dateStyle: 'short' },
  { dateStyle: 'long' },
  { dateStyle: 'full' },
  { year: 'numeric', month: 'numeric', day: 'numeric' },
  { year: 'numeric', month: 'short', day: 'numeric' },
  { month: 'long', day: 'numeric' },
  { dateStyle: 'medium', timeStyle: 'short' },
]

// Same month, next month, next year: the three interval shapes CLDR distinguishes.
const PAIRS: Array<[string, string]> = [
  ['2026-10-21T12:00:00Z', '2026-10-27T12:00:00Z'],
  ['2026-10-21T12:00:00Z', '2026-11-03T12:00:00Z'],
  ['2026-10-21T12:00:00Z', '2027-01-05T12:00:00Z'],
]

describe('formatDateRange is the platform interval pattern, in every locale (#4807)', () => {
  it.each(LOCALES)('%s', (locale) => {
    for (const shape of SHAPES) {
      const intl = new Intl.DateTimeFormat(locale, { ...(shape ?? { dateStyle: 'medium' }), timeZone: 'UTC' })
      for (const [a, b] of PAIRS) {
        const expected = intl.formatRange(new Date(a), new Date(b))
        expect(formatDateRange(a, b, { ...shape, locale, timeZone: 'UTC' }), `${locale} ${JSON.stringify(shape)} ${a}..${b}`).toBe(expected)
        // Reversed input is ordered, not re-joined.
        expect(formatDateRange(b, a, { ...shape, locale, timeZone: 'UTC' })).toBe(expected)
      }
    }
  })

  it('a calendar date range is the same interval pattern as the instants at noon UTC', () => {
    for (const locale of LOCALES) {
      const intl = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })
      expect(formatDateRange('2026-10-21', '2026-10-27', { locale })).toBe(intl.formatRange(Date.UTC(2026, 9, 21), Date.UTC(2026, 9, 27)))
    }
  })
})
