/**
 * One rule for a date-only target: it is a DAY, compared as a calendar day in the DISPLAY zone and never as hours, so "today",
 * "tomorrow", "yesterday" and "in 3 days" are literally true for a person in that zone, at any hour. (Reading it as UTC midnight
 * put the label hours or a whole day off for anyone far from UTC: at 10:00 in Tokyo `2026-11-18` was "1 hour ago". Reading it as
 * the display zone's midnight fixed the zone but still said "10 hours ago" for today and "in 12 hours" for tomorrow.)
 *
 * SHARED_TABLE is copied, verbatim, into `@pyreon/time`'s `relative-parity.test.ts` (neither package may import the other), where
 * `relativeDistance` must give the same words. Change both together. `OLD_UTC_RULE` records what the previous rule printed, so
 * the table also documents why the rule changed.
 */
import { formatRelativeTo } from '../core'

type Row = readonly [target: string, base: string, zone: string, words: string]

const SHARED_TABLE: readonly Row[] = [
  ['2026-11-18', '2026-11-18T01:00:00Z', 'Asia/Tokyo', 'today'],
  ['2026-11-18', '2026-11-18T01:00:00Z', 'UTC', 'today'],
  ['2026-11-18', '2026-11-17T20:00:00Z', 'America/Los_Angeles', 'tomorrow'],
  ['2026-11-18', '2026-11-18T10:00:00Z', 'Pacific/Kiritimati', 'yesterday'],
  ['2026-11-19', '2026-11-18T09:59:00Z', 'Pacific/Kiritimati', 'tomorrow'],
  ['2026-11-19', '2026-11-19T07:00:00Z', 'America/Los_Angeles', 'tomorrow'],
  ['2026-11-17', '2026-11-18T07:59:00Z', 'America/Los_Angeles', 'today'],
  ['2026-11-17', '2026-11-18T08:00:00Z', 'America/Los_Angeles', 'yesterday'],
  ['2026-11-19', '2026-11-18T08:00:00Z', 'America/Los_Angeles', 'tomorrow'],
  ['2026-09-06', '2026-09-06T05:00:00Z', 'America/Santiago', 'today'], // midnight does not exist (spring forward): the first instant after
  ['2026-11-01', '2026-11-01T06:00:00Z', 'America/Havana', 'today'], // midnight happens twice (fall back): the first
  ['2026-11-11', '2026-11-18T12:00:00Z', 'Pacific/Kiritimati', 'last week'],
  ['2026-11-18T12:00:00Z', '2026-11-18T13:00:00Z', 'Pacific/Kiritimati', '1 hour ago'], // instants are unchanged
  ['2026-11-16T13:00:00Z', '2026-11-18T01:00:00Z', 'UTC', '2 days ago'],
]

describe('a date-only target is a day, in the display zone', () => {
  it.each(SHARED_TABLE)('%s from %s in %s: %s', (target, base, zone, words) => {
    expect(formatRelativeTo(target, base, { locale: 'en-US', timeZone: zone })).toBe(words)
  })

  it('what the previous readings said for the three cases that motivated each change', () => {
    // UTC midnight first, then the display-zone midnight (hours), now the calendar day: only the last is literally true.
    const UTC_MIDNIGHT = ['1 hour ago', 'in 4 hours', '10 hours ago']
    const ZONE_MIDNIGHT = ['10 hours ago', 'in 12 hours', 'yesterday']
    const NOW = ['today', 'tomorrow', 'yesterday']
    const rows = [SHARED_TABLE[0], SHARED_TABLE[2], SHARED_TABLE[3]] as readonly Row[]

    rows.forEach(([target, base, zone], i) => {
      expect(formatRelativeTo(target, base, { locale: 'en-US', timeZone: zone })).toBe(NOW[i])
      expect(NOW[i]).not.toBe(UTC_MIDNIGHT[i])
    })
    expect(ZONE_MIDNIGHT[1]).not.toBe(NOW[1])
  })

  it('a due date is tomorrow all day, today all day, and counts days from there', () => {
    const zone = { locale: 'en-US', timeZone: 'Europe/Prague' }

    for (const hour of ['00:30', '06:00', '12:00', '23:59']) {
      expect(formatRelativeTo('2026-11-19', `2026-11-18T${hour}:00+01:00`, zone)).toBe('tomorrow')
      expect(formatRelativeTo('2026-11-18', `2026-11-18T${hour}:00+01:00`, zone)).toBe('today')
      expect(formatRelativeTo('2026-11-17', `2026-11-18T${hour}:00+01:00`, zone)).toBe('yesterday')
    }
    expect(formatRelativeTo('2026-11-21', '2026-11-18T12:00:00+01:00', zone)).toBe('in 3 days')
  })

  it('a date-time (a moment) still reads as elapsed hours under a day', () => {
    expect(formatRelativeTo('2026-11-18T00:00:00Z', '2026-11-18T10:00:00Z', { locale: 'en-US', timeZone: 'UTC' })).toBe('10 hours ago')
  })

  it('two calendar values compare as calendar days in every zone, including across a DST change', () => {
    for (const zone of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Prague']) {
      expect(formatRelativeTo('2026-11-17', '2026-11-18', { locale: 'en-US', timeZone: zone })).toBe('yesterday')
      expect(formatRelativeTo('2026-03-28', '2026-03-29', { locale: 'en-US', timeZone: zone })).toBe('yesterday')
      expect(formatRelativeTo('2026-03-30', '2026-03-29', { locale: 'en-US', timeZone: zone })).toBe('tomorrow')
    }
  })

  it('a date-only BASE is a day too: the instant is read as its calendar day in the zone', () => {
    expect(formatRelativeTo('2026-11-18T01:00:00Z', '2026-11-18', { locale: 'en-US', timeZone: 'Asia/Tokyo' })).toBe('today')
    expect(formatRelativeTo('2026-11-18T01:00:00Z', '2026-11-18', { locale: 'en-US', timeZone: 'America/Los_Angeles' })).toBe('yesterday') // the instant is the 17th there
  })
})
