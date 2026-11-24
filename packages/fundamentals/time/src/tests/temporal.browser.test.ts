/// <reference lib="esnext.temporal" />
import { addInstant, diff, offsetAt, toInstant, toPlainDate, toPlainDateTime } from '../core'
import type { Disambiguation } from '../core'
import { int, pick, rng } from './rng'

/**
 * A reduced seeded sample of the Temporal differential suite, run against the BROWSER's own `Temporal` and `Intl`, because
 * engines ship different time-zone data. It runs where `Temporal` exists (current Chromium) and reports itself skipped
 * elsewhere; the full suite is `oracle.test.ts` (Node 26 and Bun).
 */
const HAS_TEMPORAL = typeof (globalThis as { Temporal?: unknown }).Temporal === 'object'
const ZONES = ['Europe/Prague', 'America/New_York', 'America/St_Johns', 'Asia/Kathmandu', 'Australia/Lord_Howe', 'Pacific/Apia', 'Africa/Casablanca', 'Asia/Tokyo', 'UTC']
const MODES: readonly Disambiguation[] = ['compatible', 'earlier', 'later', 'reject']

describe.skipIf(!HAS_TEMPORAL)('zone functions against the browser Temporal', () => {
  it.each(ZONES)('toPlainDateTime, offsetAt, toInstant (four modes) and addInstant in %s', (zone) => {
    const r = rng(900 + zone.length)
    const transitions: number[] = []
    let z = Temporal.Instant.fromEpochMilliseconds(Date.UTC(2005, 0, 1)).toZonedDateTimeISO(zone)

    for (let k = 0; k < 80; k++) {
      const next = z.getTimeZoneTransition('next')

      if (next === null || next.year > 2040) break
      transitions.push(next.epochMilliseconds)
      z = next
    }
    for (let i = 0; i < 250; i++) {
      const t = transitions.length > 0 && r() < 0.6 ? pick(r, transitions) + int(r, -7_200_000, 7_200_000) : int(r, Date.UTC(1950, 0, 1), Date.UTC(2060, 0, 1))
      const zdt = Temporal.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(zone)

      expect(Temporal.PlainDateTime.from(toPlainDateTime(t, zone)).equals(zdt.toPlainDateTime()), `${zone} ${t}`).toBe(true)
      expect(toPlainDate(t, zone)).toBe(zdt.toPlainDate().toString())
      expect(offsetAt(t, zone) * 60_000, `${zone} ${t}`).toBe(zdt.offsetNanoseconds / 1e6)
      const wall = zdt.toPlainDateTime().add({ minutes: int(r, -150, 150) })
      const mode = pick(r, MODES)
      let want: number | 'throws'

      try {
        want = wall.toZonedDateTime(zone, { disambiguation: mode }).epochMilliseconds
      } catch {
        want = 'throws'
      }
      if (want === 'throws') expect(() => toInstant(wall.toString() as '2026-01-01T10:00', zone, { disambiguation: mode })).toThrow(/\[Pyreon\]/)
      else expect(toInstant(wall.toString() as '2026-01-01T10:00', zone, { disambiguation: mode }), `${zone} ${wall.toString()} ${mode}`).toBe(want)
      expect(addInstant(t, { days: 3, hours: 5 }, zone)).toBe(zdt.add({ days: 3, hours: 5 }).epochMilliseconds)
      expect(diff(t, t + 40 * 86_400_000, 'day', { zone })).toBe(zdt.until(Temporal.Instant.fromEpochMilliseconds(t + 40 * 86_400_000).toZonedDateTimeISO(zone), { largestUnit: 'day', smallestUnit: 'day', roundingMode: 'trunc' }).days)
    }
  })
})
