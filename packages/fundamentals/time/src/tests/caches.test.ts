import { fallbackWeekInfo, weekCacheSize, weekendOf, weekStartOf } from '../calendar'
import { clearZoneCache, ZONE_LIMIT, zoneCacheSize } from '../zone'
import { isTimeZone, offsetAt, toInstant, toPlainDateTime } from '../core'

describe('bounded caches (leak class C): what evicts, and the proof', () => {
  it('the zone table never exceeds ZONE_LIMIT, evicts the oldest first, and an evicted zone still answers correctly', () => {
    clearZoneCache()
    const zones = Intl.supportedValuesOf('timeZone').filter((z) => z !== 'UTC')

    expect(zones.length).toBeGreaterThan(ZONE_LIMIT + 20)
    const expected = new Map<string, string>()

    for (const zone of zones.slice(0, ZONE_LIMIT + 30)) {
      expected.set(zone, toPlainDateTime(1_700_000_000_000, zone))
      expect(zoneCacheSize()).toBeLessThanOrEqual(ZONE_LIMIT)
    }
    expect(zoneCacheSize()).toBe(ZONE_LIMIT)
    // The first zones were evicted; asking again rebuilds them and gives the same answer.
    for (const zone of zones.slice(0, 40)) expect(toPlainDateTime(1_700_000_000_000, zone), zone).toBe(expected.get(zone))
    expect(zoneCacheSize()).toBeLessThanOrEqual(ZONE_LIMIT)
  })

  it('isTimeZone does not grow the table for invalid names, and the offset table is fixed-size per zone', () => {
    clearZoneCache()
    for (let i = 0; i < 200; i++) expect(isTimeZone(`Nowhere/Place${i}`)).toBe(false)
    expect(zoneCacheSize()).toBe(0)
    // 100k different instants in one zone cannot grow anything: the per-zone table is a fixed Float64Array pair.
    for (let i = 0; i < 100_000; i++) offsetAt(1_000_000_000_000 + i * 3_700_000, 'Europe/Prague')
    expect(zoneCacheSize()).toBe(1)
  })

  it('offset slots that collide overwrite each other and stay correct', () => {
    clearZoneCache()
    const a = Date.UTC(2026, 0, 1)
    const b = a + 600_000 * 32 * 7 // lands in the same slot
    const c = Date.UTC(2026, 6, 1)

    for (let round = 0; round < 3; round++) {
      expect(offsetAt(a, 'Europe/Prague')).toBe(60)
      expect(offsetAt(b, 'Europe/Prague')).toBe(60)
      expect(offsetAt(c, 'Europe/Prague')).toBe(120)
    }
  })

  it('a rejected zone name throws a [Pyreon] error that says how to fix it', () => {
    expect(() => toInstant('2026-01-01T10:00', 'Mars/Olympus')).toThrow(/\[Pyreon\] toInstant: unknown time zone "Mars\/Olympus".*isTimeZone/)
    expect(() => offsetAt(0, 5 as unknown as string)).toThrow(/\[Pyreon\] offsetAt: expected a time zone name/)
    expect(() => toPlainDateTime(Number.NaN, 'UTC')).toThrow(/Instant/)
    expect(() => toPlainDateTime(8.64e15, 'UTC')).toThrow(RangeError)
    expect(() => toPlainDateTime(-62_135_596_800_001, 'UTC')).toThrow(RangeError)
    expect(toPlainDateTime(-62_135_596_800_000, 'UTC')).toBe('0001-01-01T00:00:00')
    expect(toPlainDateTime(253_402_300_799_999, 'UTC')).toBe('9999-12-31T23:59:59.999')
  })

  it('the locale week table is bounded', () => {
    for (let a = 65; a < 91; a++) {
      for (let b = 65; b < 91; b++) weekStartOf(`en-${String.fromCharCode(a, b)}`)
    }
    expect(weekCacheSize()).toBeLessThanOrEqual(64)
    expect(weekStartOf('en-US')).toBe(7)
    expect(weekCacheSize()).toBeLessThanOrEqual(64)
  })
})

describe('weekStartOf and weekendOf', () => {
  it('platform data for well-known locales', () => {
    expect(weekStartOf('en-US')).toBe(7)
    expect(weekStartOf('cs')).toBe(1)
    expect(weekStartOf('cs-CZ')).toBe(1)
    expect(weekStartOf('en-GB')).toBe(1)
    expect(weekStartOf('de-DE')).toBe(1)
    expect(weekStartOf('ar-EG')).toBe(6)
    expect(weekendOf('en-US')).toEqual([6, 7])
    expect(weekendOf('cs')).toEqual([6, 7])
    expect(weekendOf('ar-EG')).toEqual([5, 6])
    expect(weekendOf('he-IL')).toEqual([5, 6])
  })

  it('a malformed or unknown tag answers Monday and does not throw', () => {
    expect(weekStartOf('not a locale')).toBe(1)
    expect(weekStartOf('')).toBe(1)
    expect(weekendOf('!!')).toEqual([6, 7])
  })

  it('the fallback table (used when Intl.Locale has no week data) covers the regions that differ from Monday and Saturday-Sunday', () => {
    expect(fallbackWeekInfo('US')).toEqual({ firstDay: 7, weekend: [6, 7] })
    expect(fallbackWeekInfo('JP').firstDay).toBe(7)
    expect(fallbackWeekInfo('CZ')).toEqual({ firstDay: 1, weekend: [6, 7] })
    expect(fallbackWeekInfo('GB').firstDay).toBe(1)
    expect(fallbackWeekInfo('EG')).toEqual({ firstDay: 6, weekend: [5, 6] })
    expect(fallbackWeekInfo('IL')).toEqual({ firstDay: 7, weekend: [5, 6] })
    expect(fallbackWeekInfo('AF')).toEqual({ firstDay: 6, weekend: [4, 5] })
    expect(fallbackWeekInfo('IR')).toEqual({ firstDay: 6, weekend: [5] })
    expect(fallbackWeekInfo('IN')).toEqual({ firstDay: 7, weekend: [7] })
    expect(fallbackWeekInfo('')).toEqual({ firstDay: 1, weekend: [6, 7] })
  })
})
