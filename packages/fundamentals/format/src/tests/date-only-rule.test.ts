/**
 * One rule for a date-only target: it is the day it names, i.e. that day's midnight in the DISPLAY zone, so "yesterday",
 * "today" and "tomorrow" are literally true for a person in that zone. (Reading it as UTC midnight put the label hours or a
 * whole day off for anyone far from UTC: at 10:00 in Tokyo `2026-11-18` was "1 hour ago"; at midnight on the 19th in Kiritimati
 * it was "10 hours ago" although the 18th was already yesterday.)
 *
 * SHARED_TABLE is copied, verbatim, into `@pyreon/time`'s `relative-parity.test.ts` (neither package may import the other), where
 * `relativeDistance` must give the same words. Change both together. `OLD_UTC_RULE` records what the previous rule printed, so
 * the table also documents why the rule changed.
 */
import { formatRelativeTo } from '../core'

type Row = readonly [target: string, base: string, zone: string, words: string]

const SHARED_TABLE: readonly Row[] = [
  ['2026-11-18', '2026-11-18T01:00:00Z', 'Asia/Tokyo', '10 hours ago'],
  ['2026-11-18', '2026-11-18T01:00:00Z', 'UTC', '1 hour ago'],
  ['2026-11-18', '2026-11-17T20:00:00Z', 'America/Los_Angeles', 'in 12 hours'],
  ['2026-11-18', '2026-11-18T10:00:00Z', 'Pacific/Kiritimati', 'yesterday'],
  ['2026-11-19', '2026-11-18T09:59:00Z', 'Pacific/Kiritimati', 'in 1 minute'],
  ['2026-11-19', '2026-11-19T07:00:00Z', 'America/Los_Angeles', 'in 1 hour'],
  ['2026-11-17', '2026-11-18T07:59:00Z', 'America/Los_Angeles', '23 hours ago'],
  ['2026-11-17', '2026-11-18T08:00:00Z', 'America/Los_Angeles', 'yesterday'],
  ['2026-11-19', '2026-11-18T08:00:00Z', 'America/Los_Angeles', 'tomorrow'],
  ['2026-09-06', '2026-09-06T05:00:00Z', 'America/Santiago', '1 hour ago'], // midnight does not exist (spring forward): the first instant after
  ['2026-11-01', '2026-11-01T06:00:00Z', 'America/Havana', '2 hours ago'], // midnight happens twice (fall back): the first
  ['2026-11-11', '2026-11-18T12:00:00Z', 'Pacific/Kiritimati', 'last week'],
  ['2026-11-18T12:00:00Z', '2026-11-18T13:00:00Z', 'Pacific/Kiritimati', '1 hour ago'], // instants are unchanged
  ['2026-11-16T13:00:00Z', '2026-11-18T01:00:00Z', 'UTC', '2 days ago'],
]

describe('a date-only target is the day it names, in the display zone', () => {
  it.each(SHARED_TABLE)('%s from %s in %s: %s', (target, base, zone, words) => {
    expect(formatRelativeTo(target, base, { locale: 'en-US', timeZone: zone })).toBe(words)
  })

  it('what the UTC-midnight rule said for the three cases that motivated the change', () => {
    // Computed by hand from the old rule (target read as 00:00 UTC): each was untrue for a person in the zone.
    const OLD_UTC_RULE = ['1 hour ago', 'in 4 hours', '10 hours ago']
    const NOW = ['10 hours ago', 'in 12 hours', 'yesterday']
    const rows = [SHARED_TABLE[0], SHARED_TABLE[2], SHARED_TABLE[3]] as readonly Row[]

    rows.forEach(([target, base, zone], i) => {
      expect(formatRelativeTo(target, base, { locale: 'en-US', timeZone: zone })).toBe(NOW[i])
      expect(NOW[i]).not.toBe(OLD_UTC_RULE[i])
    })
  })

  it('two calendar values compare as calendar days in every zone, including across a DST change', () => {
    for (const zone of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Prague']) {
      expect(formatRelativeTo('2026-11-17', '2026-11-18', { locale: 'en-US', timeZone: zone })).toBe('yesterday')
      expect(formatRelativeTo('2026-03-28', '2026-03-29', { locale: 'en-US', timeZone: zone })).toBe('yesterday')
      expect(formatRelativeTo('2026-03-30', '2026-03-29', { locale: 'en-US', timeZone: zone })).toBe('tomorrow')
    }
  })

  it('a date-only BASE is read the same way (the day it names, in the zone)', () => {
    expect(formatRelativeTo('2026-11-18T01:00:00Z', '2026-11-18', { locale: 'en-US', timeZone: 'Asia/Tokyo' })).toBe('in 10 hours')
    expect(formatRelativeTo('2026-11-18T01:00:00Z', '2026-11-18', { locale: 'en-US', timeZone: 'UTC' })).toBe('in 1 hour')
  })
})
