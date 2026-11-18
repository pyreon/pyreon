import type { Disambiguation } from '../core'

/**
 * Hand-verified zone cases. They run in Node (the unit suite) and in real Chromium (the browser smoke), because the zone
 * data behind `Intl` differs between engines. Each expected value was worked out from the published transition rules, not
 * copied from the implementation, and the oracle suite re-checks every row against Temporal where it exists.
 *
 * `utc` is `[year, month(1-12), day, hour, minute, second]`, or `'reject'` when the call must throw.
 */
export interface ToInstantRow {
  note: string
  zone: string
  wall: string
  mode: Disambiguation
  utc: readonly [number, number, number, number, number, number] | 'reject'
}

export const TO_INSTANT: readonly ToInstantRow[] = [
  // Europe/Prague, 2026-03-29: 02:00 CET jumps to 03:00 CEST at 01:00Z. 02:00-02:59 does not exist.
  { note: 'Prague gap, compatible shifts forward', zone: 'Europe/Prague', wall: '2026-03-29T02:30', mode: 'compatible', utc: [2026, 3, 29, 1, 30, 0] },
  { note: 'Prague gap, later shifts forward', zone: 'Europe/Prague', wall: '2026-03-29T02:30', mode: 'later', utc: [2026, 3, 29, 1, 30, 0] },
  { note: 'Prague gap, earlier shifts back', zone: 'Europe/Prague', wall: '2026-03-29T02:30', mode: 'earlier', utc: [2026, 3, 29, 0, 30, 0] },
  { note: 'Prague gap, reject', zone: 'Europe/Prague', wall: '2026-03-29T02:30', mode: 'reject', utc: 'reject' },
  { note: 'Prague, last minute before the gap', zone: 'Europe/Prague', wall: '2026-03-29T01:59:59', mode: 'reject', utc: [2026, 3, 29, 0, 59, 59] },
  { note: 'Prague, first moment after the gap', zone: 'Europe/Prague', wall: '2026-03-29T03:00', mode: 'reject', utc: [2026, 3, 29, 1, 0, 0] },
  // Europe/Prague, 2026-10-25: 03:00 CEST falls back to 02:00 CET at 01:00Z. 02:00-02:59 happens twice.
  { note: 'Prague overlap, compatible is the first', zone: 'Europe/Prague', wall: '2026-10-25T02:30', mode: 'compatible', utc: [2026, 10, 25, 0, 30, 0] },
  { note: 'Prague overlap, earlier', zone: 'Europe/Prague', wall: '2026-10-25T02:30', mode: 'earlier', utc: [2026, 10, 25, 0, 30, 0] },
  { note: 'Prague overlap, later', zone: 'Europe/Prague', wall: '2026-10-25T02:30', mode: 'later', utc: [2026, 10, 25, 1, 30, 0] },
  { note: 'Prague overlap, reject', zone: 'Europe/Prague', wall: '2026-10-25T02:30', mode: 'reject', utc: 'reject' },
  // America/New_York, 2026-03-08 02:00 EST -> 03:00 EDT (07:00Z), 2026-11-01 02:00 EDT -> 01:00 EST (06:00Z).
  { note: 'New York gap, compatible', zone: 'America/New_York', wall: '2026-03-08T02:30', mode: 'compatible', utc: [2026, 3, 8, 7, 30, 0] },
  { note: 'New York gap, earlier', zone: 'America/New_York', wall: '2026-03-08T02:30', mode: 'earlier', utc: [2026, 3, 8, 6, 30, 0] },
  { note: 'New York overlap, earlier', zone: 'America/New_York', wall: '2026-11-01T01:30', mode: 'earlier', utc: [2026, 11, 1, 5, 30, 0] },
  { note: 'New York overlap, later', zone: 'America/New_York', wall: '2026-11-01T01:30', mode: 'later', utc: [2026, 11, 1, 6, 30, 0] },
  { note: 'New York, an ordinary summer time', zone: 'America/New_York', wall: '2026-07-04T12:00', mode: 'reject', utc: [2026, 7, 4, 16, 0, 0] },
  // America/St_Johns, UTC-3:30 (-2:30 in summer). 2026-03-08 02:00 NST -> 03:00 NDT at 05:30Z.
  { note: 'St. Johns half-hour zone, gap compatible', zone: 'America/St_Johns', wall: '2026-03-08T02:30', mode: 'compatible', utc: [2026, 3, 8, 6, 0, 0] },
  { note: 'St. Johns half-hour zone, gap earlier', zone: 'America/St_Johns', wall: '2026-03-08T02:30', mode: 'earlier', utc: [2026, 3, 8, 5, 0, 0] },
  { note: 'St. Johns winter', zone: 'America/St_Johns', wall: '2026-01-15T12:00', mode: 'reject', utc: [2026, 1, 15, 15, 30, 0] },
  // Asia/Kathmandu, UTC+5:45 all year.
  { note: 'Kathmandu 45-minute offset', zone: 'Asia/Kathmandu', wall: '2026-06-01T12:00', mode: 'reject', utc: [2026, 6, 1, 6, 15, 0] },
  // Australia/Lord_Howe, +10:30, +11:00 in summer: a 30-minute shift. 2026-10-04 02:00 -> 02:30 at 15:30Z on Oct 3; 2026-04-05 02:00 -> 01:30 at 15:00Z on Apr 4.
  { note: 'Lord Howe 30-minute gap, compatible', zone: 'Australia/Lord_Howe', wall: '2026-10-04T02:15', mode: 'compatible', utc: [2026, 10, 3, 15, 45, 0] },
  { note: 'Lord Howe 30-minute gap, earlier', zone: 'Australia/Lord_Howe', wall: '2026-10-04T02:15', mode: 'earlier', utc: [2026, 10, 3, 15, 15, 0] },
  { note: 'Lord Howe 30-minute overlap, earlier', zone: 'Australia/Lord_Howe', wall: '2026-04-05T01:45', mode: 'earlier', utc: [2026, 4, 4, 14, 45, 0] },
  { note: 'Lord Howe 30-minute overlap, later', zone: 'Australia/Lord_Howe', wall: '2026-04-05T01:45', mode: 'later', utc: [2026, 4, 4, 15, 15, 0] },
  // Pacific/Apia skipped 2011-12-30 entirely: 2011-12-29 24:00 (-10) became 2011-12-31 00:00 (+14), at 2011-12-30T10:00Z.
  { note: 'Apia skipped day, compatible', zone: 'Pacific/Apia', wall: '2011-12-30T12:00', mode: 'compatible', utc: [2011, 12, 30, 22, 0, 0] },
  { note: 'Apia skipped day, earlier', zone: 'Pacific/Apia', wall: '2011-12-30T12:00', mode: 'earlier', utc: [2011, 12, 29, 22, 0, 0] },
  { note: 'Apia skipped day, reject', zone: 'Pacific/Apia', wall: '2011-12-30T12:00', mode: 'reject', utc: 'reject' },
  { note: 'Apia, the PlainDate of the skipped day is the start of the next one', zone: 'Pacific/Apia', wall: '2011-12-30', mode: 'compatible', utc: [2011, 12, 30, 10, 0, 0] },
  // A zone that changed its rules: Moscow went from +04:00 to +03:00 on 2014-10-26 (02:00 -> 01:00 local, at 22:00Z on the 25th).
  { note: 'Moscow rule change, overlap earlier', zone: 'Europe/Moscow', wall: '2014-10-26T01:30', mode: 'earlier', utc: [2014, 10, 25, 21, 30, 0] },
  { note: 'Moscow rule change, overlap later', zone: 'Europe/Moscow', wall: '2014-10-26T01:30', mode: 'later', utc: [2014, 10, 25, 22, 30, 0] },
  // Brazil's DST began at midnight on 2018-11-04, so the date's own midnight did not exist: its start of day is 01:00 (-02:00) = 03:00Z.
  { note: 'Sao Paulo midnight gap, PlainDate is the start of day', zone: 'America/Sao_Paulo', wall: '2018-11-04', mode: 'compatible', utc: [2018, 11, 4, 3, 0, 0] },
  { note: 'UTC never has gaps', zone: 'UTC', wall: '2026-03-29T02:30', mode: 'reject', utc: [2026, 3, 29, 2, 30, 0] },
  { note: 'Tokyo', zone: 'Asia/Tokyo', wall: '2026-11-18T14:30', mode: 'reject', utc: [2026, 11, 18, 5, 30, 0] },
]

/** `[zone, [y, m, d, h, mi, s] UTC, expected wall PlainDateTime, offset in minutes]`. */
export const FROM_INSTANT: readonly (readonly [string, readonly [number, number, number, number, number, number], string, number])[] = [
  ['Europe/Prague', [2026, 1, 1, 0, 0, 0], '2026-01-01T01:00', 60],
  ['Europe/Prague', [2026, 7, 1, 0, 0, 0], '2026-07-01T02:00', 120],
  ['Europe/Prague', [2026, 3, 29, 0, 59, 59], '2026-03-29T01:59:59', 60],
  ['Europe/Prague', [2026, 3, 29, 1, 0, 0], '2026-03-29T03:00', 120],
  ['Europe/Prague', [2026, 10, 25, 0, 59, 59], '2026-10-25T02:59:59', 120],
  ['Europe/Prague', [2026, 10, 25, 1, 0, 0], '2026-10-25T02:00', 60],
  ['America/St_Johns', [2026, 1, 1, 0, 0, 0], '2025-12-31T20:30', -210],
  ['America/St_Johns', [2026, 7, 1, 0, 0, 0], '2026-06-30T21:30', -150],
  ['Asia/Kathmandu', [2026, 1, 1, 0, 0, 0], '2026-01-01T05:45', 345],
  ['Australia/Lord_Howe', [2026, 1, 1, 0, 0, 0], '2026-01-01T11:00', 660],
  ['Australia/Lord_Howe', [2026, 7, 1, 0, 0, 0], '2026-07-01T10:30', 630],
  ['Pacific/Apia', [2011, 12, 30, 9, 59, 59], '2011-12-29T23:59:59', -600],
  ['Pacific/Apia', [2011, 12, 30, 10, 0, 0], '2011-12-31T00:00', 840],
  ['Africa/Casablanca', [2026, 6, 1, 0, 0, 0], '2026-06-01T01:00', 60],
  ['Asia/Tokyo', [2026, 1, 1, 0, 0, 0], '2026-01-01T09:00', 540],
  ['UTC', [2026, 11, 18, 14, 30, 0], '2026-11-18T14:30', 0],
  ['America/Sao_Paulo', [2019, 1, 15, 12, 0, 0], '2019-01-15T10:00', -120],
  ['America/Sao_Paulo', [2019, 7, 15, 12, 0, 0], '2019-07-15T09:00', -180],
  ['Europe/Moscow', [2013, 7, 1, 0, 0, 0], '2013-07-01T04:00', 240],
  ['Europe/Moscow', [2015, 1, 1, 0, 0, 0], '2015-01-01T03:00', 180],
]
