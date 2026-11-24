import { addInstant, offsetAt, toInstant, toPlainDate, toPlainDateTime } from '../core'
import { FROM_INSTANT, TO_INSTANT } from './zone-table'

describe('hand-verified zone table (runs everywhere, no Temporal needed)', () => {
  it.each(TO_INSTANT)('toInstant: $note', ({ zone, wall, mode, utc }) => {
    const text = wall as '2026-01-01T10:00'

    if (utc === 'reject') {
      expect(() => toInstant(text, zone, { disambiguation: mode })).toThrow(/\[Pyreon\] toInstant: .* (does not exist|happens twice)/)

      return
    }
    const [y, mo, d, h, mi, sec] = utc

    expect(toInstant(text, zone, { disambiguation: mode })).toBe(Date.UTC(y, mo - 1, d, h, mi, sec))
  })

  it.each(FROM_INSTANT)('toPlainDateTime / offsetAt: %s %j', (zone, utc, wall, offset) => {
    const t = Date.UTC(utc[0], utc[1] - 1, utc[2], utc[3], utc[4], utc[5])

    expect(toPlainDateTime(t, zone)).toBe(wall)
    expect(toPlainDate(t, zone)).toBe(wall.slice(0, 10))
    expect(offsetAt(t, zone)).toBe(offset)
  })

  it('the Apia date 2011-12-30 never appears on any instant', () => {
    const start = Date.UTC(2011, 11, 29, 0, 0, 0)

    for (let t = start; t < start + 4 * 86_400_000; t += 15 * 60_000) expect(toPlainDate(t, 'Pacific/Apia')).not.toBe('2011-12-30')
  })

  it('addInstant: one day in a zone keeps the wall clock across DST, 24 hours does not', () => {
    const noonBefore = Date.UTC(2026, 2, 28, 11, 0) // 12:00 CET

    expect(addInstant(noonBefore, { days: 1 }, 'Europe/Prague')).toBe(Date.UTC(2026, 2, 29, 10, 0)) // 12:00 CEST, 23 hours later
    expect(addInstant(noonBefore, { hours: 24 })).toBe(Date.UTC(2026, 2, 29, 11, 0)) // 13:00 CEST
    expect(addInstant(noonBefore, { weeks: 1 }, 'Europe/Prague')).toBe(Date.UTC(2026, 3, 4, 10, 0))
    expect(addInstant(Date.UTC(2026, 9, 24, 10, 0), { days: 1 }, 'Europe/Prague')).toBe(Date.UTC(2026, 9, 25, 11, 0)) // 25-hour day
    expect(addInstant(Date.UTC(2026, 0, 31, 12, 0), { months: 1 }, 'UTC')).toBe(Date.UTC(2026, 1, 28, 12, 0))
    expect(() => addInstant(noonBefore, { days: 1 })).toThrow(/needs a time zone/)
  })
})
