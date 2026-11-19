import { add, addInstant, diff, monthGrid, offsetAt, toInstant, toPlainDate, toPlainDateTime, weekStartOf } from '../index'
import { FROM_INSTANT, TO_INSTANT } from './zone-table'

/**
 * Real-Chromium smoke. The value math is plain integer code, but time-zone offsets come from the engine's own `Intl` data
 * (ICU in Chromium, a different tzdata snapshot than Node's), so the hand-verified zone table runs here too.
 */
describe('@pyreon/time in real Chromium', () => {
  it.each(TO_INSTANT)('toInstant: $note', ({ zone, wall, mode, utc }) => {
    const text = wall as '2026-01-01T10:00'

    if (utc === 'reject') {
      expect(() => toInstant(text, zone, { disambiguation: mode })).toThrow(/\[Pyreon\] toInstant/)

      return
    }
    const [y, mo, d, h, mi, s] = utc

    expect(toInstant(text, zone, { disambiguation: mode })).toBe(Date.UTC(y, mo - 1, d, h, mi, s))
  })

  it.each(FROM_INSTANT)('toPlainDateTime / offsetAt: %s %j', (zone, utc, wall, offset) => {
    const t = Date.UTC(utc[0], utc[1] - 1, utc[2], utc[3], utc[4], utc[5])

    expect(toPlainDateTime(t, zone)).toBe(wall)
    expect(toPlainDate(t, zone)).toBe(wall.slice(0, 10))
    expect(offsetAt(t, zone)).toBe(offset)
  })

  it('calendar arithmetic and grids agree with the Node results', () => {
    expect(add('2026-01-31', { months: 1 })).toBe('2026-02-28')
    expect(diff('2026-11-18', '2026-12-24', 'day')).toBe(36)
    expect(monthGrid('2026-11')[0]![0]).toBe('2026-10-26')
    expect(addInstant(Date.UTC(2026, 2, 28, 11, 0), { days: 1 }, 'Europe/Prague')).toBe(Date.UTC(2026, 2, 29, 10, 0))
    expect(weekStartOf('en-US')).toBe(7)
    expect(weekStartOf('cs')).toBe(1)
  })
})
