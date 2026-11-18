import { defineManifest } from '@pyreon/manifest'
import { fpEntries } from './manifest-fp'

/**
 * Every `// =>` line in an example is executed by `src/tests/manifest-examples.test.ts` and compared with the value after
 * the arrow, so the output shown in the docs is the output the code produces.
 */
export default defineManifest({
  name: '@pyreon/time',
  title: 'Dates and Times',
  tagline: 'Dates and times as plain strings and numbers: ISO values, DST-correct zone math, calendar grids, no classes',
  description:
    'Plain-data date and time values for Pyreon: a date is the string `"2026-11-18"`, an instant is epoch milliseconds, and every operation is one tree-shakeable function (`add`, `diff`, `startOf`, `monthGrid`, `toInstant`). Calendar math is proleptic Gregorian integer arithmetic with no `Date` object on the path; time zones come from `Intl` with one cached formatter per zone, and `toInstant` implements Temporal\'s four disambiguation modes for DST gaps and overlaps. Checked against `Temporal` with seeded differential tests. `@pyreon/time/core` and `/fp` have no dependencies; `@pyreon/time` reads the ambient clock and time zone of `@pyreon/ambient` and adds the clock hooks `useToday`, `useCountdown`, `useElapsed` and `useRelative`, which update on shared, aligned tickers. Experimental.',
  category: 'universal',
  multiplatform: {
    tier: 'web-only',
    rationale:
      'not lowered by PMTC yet: the package is pure computation on strings and numbers (an Instant is epoch milliseconds, exactly how a date is represented natively), so it can become `shared` once the Swift and Kotlin ports of the same functions exist; until then the compiler warns on import rather than miscompiling',
  },
  peerDeps: ['@pyreon/core', '@pyreon/reactivity'],
  features: [
    'Values are plain data: PlainDate "2026-11-18", PlainTime "14:30", PlainDateTime, PlainYearMonth, Instant (epoch ms)',
    'One function per operation: add, subtract, diff, between, startOf, endOf, compare, min, max, clamp, eachDay, monthGrid',
    'Month and year addition clamps the day (Jan 31 + 1 month = Feb 28), ISO week numbers, month 1-12 and weekday 1 (Mon) - 7 (Sun)',
    'DST-correct zones: toInstant with compatible / earlier / later / reject, toPlainDateTime, offsetAt, addInstant',
    'Zone data comes from Intl: no bundled tz database, one cached formatter per zone, bounded caches',
    'Strict parsing: isPlainDate("2026-02-30") is false; documented ISO forms; parseInstant for API timestamps',
    'Verified against Temporal with seeded randomized differential tests plus a hand-verified DST table that runs in Node and Chromium',
    'Literals type-check without casts: add("2026-01-31", { months: 1 }) is a PlainDate',
  ],
  longExample: `import { add, diff, startOf, monthGrid, toInstant, toPlainDateTime, offsetAt } from '@pyreon/time/core'

add('2026-01-31', { months: 1 })                    // => '2026-02-28'
diff('2026-11-18', '2026-12-24', 'day')             // => 36
startOf('2026-11-18', 'week')                       // => '2026-11-16'
monthGrid('2026-11')[0]![0]                         // => '2026-10-26'

// Zones: wall-clock time in, instant out; DST gaps and overlaps follow Temporal's rules.
const t = toInstant('2026-03-29T02:30', 'Europe/Prague')   // 02:30 does not exist: shifts forward to 03:30
toPlainDateTime(t, 'Europe/Prague')                 // => '2026-03-29T03:30'
offsetAt(t, 'Europe/Prague')                        // => 120`,
  api: [
    {
      name: 'add',
      kind: 'function',
      signature: '<T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T, duration: Duration) => same shape as T',
      summary:
        'Add a duration to a PlainDate, PlainDateTime or PlainYearMonth; the result has the same shape. Years and months are applied first and clamp the day to the target month (Temporal\'s `constrain`), then weeks, days and the time fields. Every field is an integer and all non-zero fields share one sign. Throws a `[Pyreon]` error for an invalid value, a mixed-sign or fractional duration, time fields on a PlainDate, days on a PlainYearMonth, and a result outside years 0001-9999.',
      example: `add('2026-01-31', { months: 1 })              // => '2026-02-28'
add('2024-02-29', { years: 1 })               // => '2025-02-28'
add('2026-12-31', { days: 1 })                // => '2027-01-01'
add('2026-11-18T23:30', { minutes: 45 })      // => '2026-11-19T00:15'
add('2026-11', { months: 3 })                 // => '2027-02'`,
      mistakes: [
        'Passing a plain `string` from user input: the type rejects it. Narrow it with `isPlainDate(x)` first; at runtime an invalid string throws',
        'Mixing signs (`{ months: 1, days: -1 }`): it has no single meaning and throws. Call `add` and `subtract` separately',
        'Adding hours to a PlainDate: a date has no time of day. Use a PlainDateTime',
      ],
      seeAlso: ['subtract', 'addInstant', 'diff'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'subtract',
      kind: 'function',
      signature: '<T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T, duration: Duration) => same shape as T',
      summary: '`add` with every field negated: `subtract(date, { days: 1 })` is yesterday.',
      example: `subtract('2000-03-01', { days: 1 })           // => '2000-02-29'
subtract('2026-03-31', { months: 1 })         // => '2026-02-28'`,
      seeAlso: ['add'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'diff',
      kind: 'function',
      signature: '(a: T, b: T, unit: Unit, options?: { zone?: TimeZone }) => number',
      summary:
        'Whole `unit`s from `a` to `b`, truncated toward zero; the sign is the direction. Works on PlainDate, PlainDateTime, PlainYearMonth, PlainTime and Instant (an Instant needs `options.zone` for year, month, week and day, because a calendar day is not always 24 hours). A month or year counts as complete when `add(a, { months: n })` (day clamped) does not pass `b`, which is what Temporal\'s `until` with `smallestUnit` and truncation returns, so it is not antisymmetric at month ends: January 31 to February 28 is 1 month, February 28 back to January 31 is 0.',
      example: `diff('2026-11-18', '2026-12-24', 'day')       // => 36
diff('2026-12-24', '2026-11-18', 'day')       // => -36
diff('2026-01-31', '2026-02-28', 'month')     // => 1
diff('2026-11-18T10:00', '2026-11-18T12:59', 'hour')  // => 2
diff('10:00', '12:30', 'minute')              // => 150
diff(Date.UTC(2026, 2, 28, 11), Date.UTC(2026, 2, 29, 10), 'day', { zone: 'Europe/Prague' })  // => 1`,
      mistakes: ['Diffing two Instants in days without a zone throws: pass `{ zone }`, or use `{ hours }` for an exact 24-hour count'],
      seeAlso: ['between', 'add'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'between',
      kind: 'function',
      signature: '(a: PlainDate | PlainDateTime, b: same shape) => Duration',
      summary:
        'The span from `a` to `b` broken down from years to days (and hours to milliseconds for a PlainDateTime), matching Temporal\'s `until` with `largestUnit: "year"`. All fields share the sign of the direction; every field is present.',
      example: `between('2026-01-31', '2026-03-01')           // => { years: 0, months: 1, days: 1 }
between('2020-01-01', '2026-11-18')           // => { years: 6, months: 10, days: 17 }
between('2026-01-01T10:00', '2026-01-02T09:30')  // => { years: 0, months: 0, days: 0, hours: 23, minutes: 30, seconds: 0, milliseconds: 0 }`,
      seeAlso: ['diff'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'startOf',
      kind: 'function',
      signature: '<T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T, unit: Unit, options?: { weekStart?: Weekday }) => same shape as T',
      summary:
        'The first moment of the `unit` containing `value`. Weeks start on `options.weekStart` (1 Monday ... 7 Sunday, default Monday). A PlainDateTime keeps the precision it came in with. A PlainDate has no time units; a PlainYearMonth has only year and month.',
      example: `startOf('2026-11-18', 'week')                 // => '2026-11-16'
startOf('2026-11-18', 'week', { weekStart: 7 })  // => '2026-11-15'
startOf('2026-11-18', 'month')                // => '2026-11-01'
startOf('2026-11-18T14:30:05', 'hour')        // => '2026-11-18T14:00'`,
      seeAlso: ['endOf', 'weekStartOf'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'endOf',
      kind: 'function',
      signature: '<T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T, unit: Unit, options?: { weekStart?: Weekday }) => same shape as T',
      summary: 'The last moment of the `unit` containing `value`. For a PlainDateTime that is the last millisecond (`.999`).',
      example: `endOf('2026-11-18', 'month')                  // => '2026-11-30'
endOf('2024-02-10', 'month')                  // => '2024-02-29'
endOf('2026-11-18T14:30', 'day')              // => '2026-11-18T23:59:59.999'`,
      seeAlso: ['startOf'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'compare',
      kind: 'function',
      signature: '<T extends PlainDate | PlainDateTime | PlainYearMonth | PlainTime | Instant>(a: T, b: T) => -1 | 0 | 1',
      summary:
        'Order two values of the same shape. Same-length strings compare as plain strings (every field is fixed-width and zero-padded), so the common case is one string comparison; that fast path does not validate. Values written at different precision (`14:30` and `14:30`) are parsed. Usable as an `Array#sort` comparator.',
      example: `compare('2026-11-18', '2026-11-19')           // => -1
compare('14:30', '14:30')                  // => 0
compare('2026-11-18T14:30', '2026-11-18T14:30:00.001')  // => -1
['2026-03-01', '2026-01-01'].sort(compare)    // => ['2026-01-01', '2026-03-01']`,
      seeAlso: ['isBefore', 'isAfter', 'isSame', 'min', 'max', 'clamp'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isBefore',
      kind: 'function',
      signature: '<T extends Comparable>(a: T, b: T) => boolean',
      summary: 'Whether `a` is strictly before `b`.',
      example: `isBefore('2026-01-01', '2026-01-02')          // => true`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isAfter',
      kind: 'function',
      signature: '<T extends Comparable>(a: T, b: T) => boolean',
      summary: 'Whether `a` is strictly after `b`.',
      example: `isAfter('2026-01-01', '2026-01-02')           // => false`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isSame',
      kind: 'function',
      signature: '<T extends Comparable>(a: T, b: T, unit?: Unit, options?: { weekStart?: Weekday; zone?: TimeZone }) => boolean',
      summary: 'Whether `a` and `b` are the same moment, or, with a `unit`, fall in the same year, month, week, day (or hour, minute, second, millisecond for a PlainDateTime). Two Instants compared by year, month, week, day or hour need `options.zone`, because the calendar day depends on where you are; without it the call throws and says so.',
      example: `isSame('2026-11-18', '2026-11-30', 'month')   // => true
isSame('2026-11-15', '2026-11-16', 'week')    // => false
isSame('2026-11-15', '2026-11-16', 'week', { weekStart: 7 })  // => true
isSame(Date.UTC(2026, 10, 18, 22, 30), Date.UTC(2026, 10, 18, 23, 30), 'day', { zone: 'Europe/Prague' })  // => false`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'min',
      kind: 'function',
      signature: '<T extends Comparable>(...values: [T, ...T[]]) => T',
      summary: 'The earliest value; at least one is required.',
      example: `min('2026-03-01', '2026-01-01', '2026-02-01') // => '2026-01-01'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'max',
      kind: 'function',
      signature: '<T extends Comparable>(...values: [T, ...T[]]) => T',
      summary: 'The latest value; at least one is required.',
      example: `max('2026-03-01', '2026-01-01', '2026-02-01') // => '2026-03-01'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'clamp',
      kind: 'function',
      signature: '<T extends Comparable>(value: T, lo: T, hi: T) => T',
      summary: '`value` limited to `lo` ... `hi` inclusive. Throws when `lo` is after `hi`.',
      example: `clamp('2026-05-01', '2026-01-01', '2026-03-01') // => '2026-03-01'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'eachDay',
      kind: 'function',
      signature: '(start: PlainDate, end: PlainDate, step?: number) => PlainDate[]',
      summary: 'Every date from `start` to `end`, both included, as an array. `step` (default 1) moves by that many days; a negative step counts down. A range that runs the other way than `step` is empty, which is a normal answer and never guessed into a direction. Nothing is capped: the whole range is built, so use `iterateDays` for long ranges.',
      example: `eachDay('2026-02-27', '2026-03-02')           // => ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']
eachDay('2026-11-03', '2026-11-01', -1)       // => ['2026-11-03', '2026-11-02', '2026-11-01']`,
      seeAlso: ['iterateDays'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'iterateDays',
      kind: 'function',
      signature: '(start: PlainDate, end: PlainDate, step?: number) => Generator<PlainDate>',
      summary: 'The dates from `start` to `end`, both included, one at a time, so a long range is never materialised. `step` is as in `eachDay`; a zero or fractional step throws when called.',
      example: `[...iterateDays('2026-11-01', '2026-11-03')]  // => ['2026-11-01', '2026-11-02', '2026-11-03']`,
      seeAlso: ['eachDay'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'monthGrid',
      kind: 'function',
      signature: '(month: PlainYearMonth | PlainDate, options?: { weekStart?: Weekday; weeks?: 6 | "auto" }) => PlainDate[][]',
      summary:
        'The weeks of a month as rows of seven dates, including the days of the neighbouring months that fill the first and last row. `weeks: "auto"` (default) returns only the weeks the month occupies (4 to 6 rows); `weeks: 6` always returns six rows so a date picker keeps its height. Throws for the first and last months of the supported range when the grid would leave it.',
      example: `const grid = monthGrid('2026-11')
grid.length                                   // => 6
grid[0]                                       // => ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
monthGrid('2026-11', { weekStart: 7 }).length // => 5
monthGrid('2026-02', { weekStart: 7 })[3]![6] // => '2026-02-28'`,
      seeAlso: ['weekStartOf', 'eachDay'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'weekStartOf',
      kind: 'function',
      signature: '(locale: string) => Weekday',
      summary: 'First day of the week for a locale as an ISO weekday (`en-US` is 7, `cs` is 1). Reads `Intl.Locale` week data and falls back to a built-in region table when the platform has none; a malformed tag gives Monday. Cached in a bounded table.',
      example: `weekStartOf('en-US')                          // => 7
weekStartOf('cs')                             // => 1`,
      seeAlso: ['weekendOf', 'monthGrid'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'weekendOf',
      kind: 'function',
      signature: '(locale: string) => readonly Weekday[]',
      summary: 'The weekend days of a locale as ISO weekdays (`en-US` is `[6, 7]`, `ar-EG` is `[5, 6]`). The array is shared and frozen.',
      example: `weekendOf('en-US')                            // => [6, 7]
weekendOf('he-IL')                            // => [5, 6]`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'dayOfWeek',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime) => Weekday',
      summary: 'ISO weekday: 1 is Monday, 7 is Sunday (unlike `Date#getDay`).',
      example: `dayOfWeek('2026-11-18')                       // => 3
dayOfWeek('2026-11-22')                       // => 7`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'quarterOf',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime | PlainYearMonth) => 1 | 2 | 3 | 4',
      summary: 'The calendar quarter (January-March is 1). `startOf`, `endOf`, `diff` and `isSame` also take the unit `quarter`. There is no `quarters` duration field (a quarter is a calendar unit, not a length, and Temporal has none): add three months with `{ months: 3 }`.',
      example: `quarterOf('2026-11-18')                       // => 4
startOf('2026-11-18', 'quarter')              // => '2026-10-01'
endOf('2026-11-18', 'quarter')                // => '2026-12-31'
diff('2026-01-01', '2026-12-31', 'quarter')   // => 3`,
      seeAlso: ['startOf', 'endOf'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'dayOfYear',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime) => number',
      summary: '1 for January 1st through 365 or 366.',
      example: `dayOfYear('2024-12-31')                       // => 366`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'weekOfYear',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime) => number',
      summary: 'ISO 8601 week number, 1-53: week 1 contains the year\'s first Thursday and weeks start on Monday. Days at the turn of the year can belong to a week of the neighbouring year: see `yearOfWeek`.',
      example: `weekOfYear('2026-11-18')                      // => 47
weekOfYear('2027-01-01')                      // => 53
weekOfYear('2024-12-30')                      // => 1`,
      seeAlso: ['yearOfWeek'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'yearOfWeek',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime) => number',
      summary: 'The ISO week-based year: 2027-01-01 belongs to week 53 of 2026, and 2024-12-30 to week 1 of 2025. Use it with `weekOfYear` to label a week.',
      example: `yearOfWeek('2027-01-01')                      // => 2026
yearOfWeek('2024-12-30')                      // => 2025`,
      seeAlso: ['weekOfYear'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'daysInMonth',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime | PlainYearMonth) => number',
      summary: 'Number of days in the month of the value.',
      example: `daysInMonth('2024-02')                        // => 29
daysInMonth('2100-02')                        // => 28`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isLeapYear',
      kind: 'function',
      signature: '(value: number | PlainDate | PlainDateTime | PlainYearMonth) => boolean',
      summary: 'Whether a year, or the year of a value, is a Gregorian leap year (1900 and 2100 are not, 2000 is).',
      example: `isLeapYear(2000)                              // => true
isLeapYear(1900)                              // => false`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'plainDate',
      kind: 'function',
      signature: '(year: number, month: number, day: number) => PlainDate',
      summary: 'Build a PlainDate from numbers (month 1-12). Throws on an impossible date.',
      example: `plainDate(2026, 11, 18)                       // => '2026-11-18'`,
      mistakes: ['Passing a 0-based month as `Date` does: `plainDate(2026, 0, 1)` throws, months are 1-12'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'plainYearMonth',
      kind: 'function',
      signature: '(year: number, month: number) => PlainYearMonth',
      summary: 'Build a PlainYearMonth from numbers.',
      example: `plainYearMonth(2026, 11)                      // => '2026-11'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'plainTime',
      kind: 'function',
      signature: '(hour: number, minute?: number, second?: number, millisecond?: number) => PlainTime',
      summary: 'Build a PlainTime, written at the least precision that holds the value: `14:30`, `14:30:05` or `14:30:05.250`.',
      example: `plainTime(14, 30)                             // => '14:30'
plainTime(14, 30, 5)                          // => '14:30:05'
plainTime(14, 30, 0, 250)                     // => '14:30:00.250'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'dateParts',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime) => { year: number; month: number; day: number }',
      summary: 'The numeric fields of a date. Months are 1-12.',
      example: `dateParts('2026-11-18')                       // => { year: 2026, month: 11, day: 18 }`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'timeParts',
      kind: 'function',
      signature: '(value: PlainTime | PlainDateTime) => { hour: number; minute: number; second: number; millisecond: number }',
      summary: 'The numeric fields of a time of day.',
      example: `timeParts('14:30:05.250')                     // => { hour: 14, minute: 30, second: 5, millisecond: 250 }`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isPlainDate',
      kind: 'function',
      signature: '(x: unknown) => x is PlainDate',
      summary: 'Strict guard: exactly `YYYY-MM-DD`, zero-padded, a real calendar day, years 0001-9999. Never throws. The other guards (`isPlainTime`, `isPlainDateTime`, `isPlainYearMonth`) follow the grammar in the gotchas.',
      example: `isPlainDate('2026-11-18')                     // => true
isPlainDate('2026-02-30')                     // => false
isPlainDate('2026-2-3')                       // => false`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isPlainTime',
      kind: 'function',
      signature: '(x: unknown) => x is PlainTime',
      summary: 'Guard for `HH:MM`, `HH:MM:SS` or `HH:MM:SS.f` to `.fff`.',
      example: `isPlainTime('14:30:05.250')                   // => true
isPlainTime('24:00')                          // => false`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isPlainDateTime',
      kind: 'function',
      signature: '(x: unknown) => x is PlainDateTime',
      summary: 'Guard for a PlainDate, an upper-case `T`, a PlainTime. Offsets and zone names are not part of a PlainDateTime.',
      example: `isPlainDateTime('2026-11-18T14:30')           // => true
isPlainDateTime('2026-11-18T14:30Z')          // => false`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isPlainYearMonth',
      kind: 'function',
      signature: '(x: unknown) => x is PlainYearMonth',
      summary: 'Guard for `YYYY-MM`.',
      example: `isPlainYearMonth('2026-11')                   // => true
isPlainYearMonth('2026-13')                   // => false`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'parseInstant',
      kind: 'function',
      signature: '(text: string, options?: { lenient?: boolean }) => Instant | null',
      summary:
        'Parse an ISO 8601 timestamp that names its offset into an Instant, or `null`. Strict: upper-case `T` and `Z`, a `+hh:mm` offset with a colon, seconds required, an optional fraction of 1-9 digits truncated to milliseconds. A string without an offset is a wall-clock value, not a moment, so it is `null`: use `toInstant(value, zone)`. With `{ lenient: true }` it also accepts a space or lower-case `t` and `z`, `+0100` and `+01` offsets, missing seconds and unpadded fields. Never throws.',
      example: `parseInstant('2026-11-18T14:30:05Z')          // => Date.UTC(2026, 10, 18, 14, 30, 5)
parseInstant('2026-11-18T14:30:05.250+01:00') // => Date.UTC(2026, 10, 18, 13, 30, 5, 250)
parseInstant('2026-11-18T14:30:05')           // => null
parseInstant('2026-11-18 14:30:05+0100', { lenient: true })  // => Date.UTC(2026, 10, 18, 13, 30, 5)`,
      seeAlso: ['toInstant'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'normalize',
      kind: 'function',
      signature: '<T extends PlainDate | PlainYearMonth | PlainTime | PlainDateTime>(value: T) => same shape as T',
      summary:
        'The canonical form of a value that came from elsewhere. Every PlainTime and PlainDateTime this package returns is the shortest exact form: `HH:MM` when seconds and milliseconds are zero, `HH:MM:SS` when only milliseconds are zero, otherwise `HH:MM:SS.mmm` (always three digits), which is what `<input type="time">` and `<input type="datetime-local">` produce. So equal values are equal strings, and `===`, `Object.is`, a Map key and plain string sorting are correct on them. A value typed by hand or read from an API may carry extra zeros (`14:30:00`, `14:30:00.000`): normalise it once at the boundary. Dates and year-months are returned as they are; other input throws.',
      example: `normalize('2026-11-18T14:30:00.000')          // => '2026-11-18T14:30'
normalize('14:30:05.5')                       // => '14:30:05.500'
normalize('2026-11-18')                       // => '2026-11-18'`,
      seeAlso: ['parseISO', 'compare'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'parseISO',
      kind: 'function',
      signature: '(text: string) => PlainDate | PlainDateTime | PlainYearMonth | PlainTime | null',
      summary:
        'The lenient door: read an ISO-like string people and other systems produce and return the strict value it denotes, or `null`. Accepts a space or lower-case `t` between date and time, unpadded months, days and hours, a comma as the decimal mark, up to nine fraction digits (cut to milliseconds) and surrounding spaces. It never guesses: a string with an offset or `Z` is a moment, not a wall-clock value, so it is `null` (use `parseInstant(text, { lenient: true })`, then `toPlainDateTime(instant, zone)` for the wall-clock time in a zone), and an impossible date is `null`. The result is always canonical. The strict guards stay strict. Never throws.',
      example: `parseISO('2026-11-18 14:30')                  // => '2026-11-18T14:30'
parseISO(' 2026-2-3 ')                        // => '2026-02-03'
parseISO('2026-11-18T14:30Z')                 // => null
toPlainDateTime(parseInstant('2026-11-18T14:30:00+01:00')!, 'Asia/Tokyo')  // => '2026-11-18T22:30'`,
      seeAlso: ['parseInstant', 'isPlainDate'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'daysFromToday',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime | Instant, zone: TimeZone, now?: Instant) => number',
      summary: 'Calendar days from today to the day `value` falls on, in `zone`: 0 today, -1 yesterday, 1 tomorrow. It counts calendar days, not 24-hour spans, so it is right on the 23- and 25-hour days of a DST change and around local midnight. An Instant is read in `zone`; a plain value is taken as the local date already. `now` is for tests; in `@pyreon/time` it defaults to the pinned clock.',
      example: `daysFromToday('2026-11-17', 'Europe/Prague', Date.UTC(2026, 10, 18, 12))   // => -1
daysFromToday(Date.UTC(2026, 10, 18, 23, 30), 'Europe/Prague', Date.UTC(2026, 10, 18, 12))  // => 1`,
      seeAlso: ['isToday', 'isSame'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isToday',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime | Instant, zone: TimeZone, now?: Instant) => boolean',
      summary: 'Whether `value` falls on today\'s date in `zone`. 23:30 UTC is already tomorrow in Prague; this knows.',
      example: `isToday(Date.UTC(2026, 10, 18, 22, 30), 'Europe/Prague', Date.UTC(2026, 10, 18, 12))  // => true
isToday(Date.UTC(2026, 10, 18, 23, 30), 'Europe/Prague', Date.UTC(2026, 10, 18, 12))  // => false`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isYesterday',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime | Instant, zone: TimeZone, now?: Instant) => boolean',
      summary: 'Whether `value` falls on yesterday\'s date in `zone`.',
      example: `isYesterday('2026-11-17', 'Europe/Prague', Date.UTC(2026, 10, 18, 12))  // => true`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isTomorrow',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime | Instant, zone: TimeZone, now?: Instant) => boolean',
      summary: 'Whether `value` falls on tomorrow\'s date in `zone`.',
      example: `isTomorrow('2026-11-19', 'Europe/Prague', Date.UTC(2026, 10, 18, 12))  // => true`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'relativeDistance',
      kind: 'function',
      signature: '(target: Instant | PlainDate | PlainDateTime, base: Instant, zone: TimeZone) => { value: number; unit: "second" | "minute" | "hour" | "day" | "week" | "month" | "year" }',
      summary:
        'How far `target` is from `base`, counted the way a person says it. Under a minute is seconds, under an hour minutes, under 24 hours hours (truncated toward zero). From 24 hours on it is counted by the calendar in `zone`, so yesterday is literally yesterday: under 7 calendar days it is days; then weeks while the calendar month differs by less than one or the distance is under 30 days; then calendar months (up to 11), then calendar years. A PlainDateTime target is a wall-clock value in `zone`; a PlainDate target is a DAY, compared as a calendar day in `zone` and never as hours (today, tomorrow, in 3 days). These are the thresholds of `formatRelativeTo` in `@pyreon/format`, ported with its tests, so the same two moments give the same words.',
      example: `relativeDistance(Date.UTC(2026, 10, 18, 11, 58), Date.UTC(2026, 10, 18, 12), 'UTC')  // => { value: -2, unit: 'minute' }
relativeDistance('2026-11-17', Date.UTC(2026, 10, 18, 23, 59), 'UTC')   // => { value: -1, unit: 'day' }
relativeDistance('2026-12-20', Date.UTC(2026, 10, 18, 12), 'UTC')       // => { value: 1, unit: 'month' }`,
      seeAlso: ['useRelative', 'daysFromToday'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'useToday',
      kind: 'hook',
      signature: '(zone?: TimeZone) => () => PlainDate',
      summary: 'Today\'s date as an accessor that flips at the local midnight of the zone (default: the active time zone of `@pyreon/ambient`), on one shared ticker; correct on 23- and 25-hour days. Reactive entry (`@pyreon/time`) only. Call it in a component\'s setup: the ticker is released when the component goes away. Outside a component, or on a server, it returns a plain accessor and starts nothing.',
      example: `typeof useToday('Europe/Prague')              // => 'function'`,
      mistakes: ['Reading `today()` once in a component body for a "today" badge: the component runs once, so the badge never flips. Use `useToday()` and read it inside JSX or an effect'],
      seeAlso: ['today', 'useRelative'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'useCountdown',
      kind: 'hook',
      signature: '(target: When | (() => When), options?: { zone?: TimeZone; every?: Every }) => { remaining: () => Duration; totalMs: () => number; done: () => boolean }',
      summary: 'A countdown to `target` (an Instant, a Date, or a wall-clock PlainDate or PlainDateTime read in the zone): the time left in days, hours, minutes, seconds and milliseconds, all zero once it has passed. Updates every second by default on a shared ticker, so a thousand countdowns are one timer. Reactive entry only; call it in a component\'s setup. Invalid targets throw a `[Pyreon]` error when read.',
      example: `typeof useCountdown(Date.UTC(2031, 0, 1)).done   // => 'function'`,
      seeAlso: ['useElapsed'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'useElapsed',
      kind: 'hook',
      signature: '(since: When | (() => When), options?: { zone?: TimeZone; every?: Every }) => () => Duration',
      summary: 'The stopwatch counterpart of `useCountdown`: the time since `since` in days to milliseconds (zero before it), updating every second by default.',
      example: `typeof useElapsed(Date.UTC(2020, 0, 1))      // => 'function'`,
      seeAlso: ['useCountdown'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'useRelative',
      kind: 'hook',
      signature: '(target: When | (() => When), options?: { zone?: TimeZone }) => () => { value: number; unit: RelativeUnit }',
      summary: 'The structured relative distance to `target`, self-updating: `{ value: -2, unit: "minute" }` (negative is the past). Calendar-true from a day on. The cadence adapts to the distance on shared tickers: every second under a minute, every minute under an hour, every hour under a day, then at local midnight; as the distance grows the reader moves to the slower ticker, so an old timestamp never holds a per-second timer and 200 labels share a handful of timers. A displayed value can lag the true boundary by up to one tick of its ticker. It produces no text: `@pyreon/format` turns `{ value, unit }` into words. Reactive entry only; call it in a component\'s setup.',
      example: `typeof useRelative(Date.now() - 60_000)       // => 'function'`,
      seeAlso: ['relativeDistance', 'useNow'],
      stability: 'experimental',
      since: '0.53.0',
    },
    { name: 'RelativeDistance', kind: 'type', signature: 'interface RelativeDistance { value: number; unit: RelativeUnit }', summary: 'A signed whole number of one unit; negative is the past.', example: `const d: RelativeDistance = { value: -2, unit: 'minute' }`, stability: 'experimental', since: '0.53.0' },
    { name: 'RelativeUnit', kind: 'type', signature: "type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'", summary: 'The units of a relative distance.', example: `const unit: RelativeUnit = 'week'`, stability: 'experimental', since: '0.53.0' },
    { name: 'When', kind: 'type', signature: 'type When = Instant | Date | PlainDate | PlainDateTime', summary: 'A moment a clock hook can aim at. A PlainDate or PlainDateTime is a wall-clock value read in the zone.', example: `const at: When = '2026-12-24T18:00'`, stability: 'experimental', since: '0.53.0' },
    { name: 'ClockOptions', kind: 'type', signature: 'interface ClockOptions { zone?: TimeZone }', summary: 'Options shared by the clock hooks.', example: `const o: ClockOptions = { zone: 'Europe/Prague' }`, stability: 'experimental', since: '0.53.0' },
    { name: 'TickOptions', kind: 'type', signature: 'interface TickOptions extends ClockOptions { every?: Every }', summary: 'Options of `useCountdown` and `useElapsed`.', example: `const o: TickOptions = { every: 'minute' }`, stability: 'experimental', since: '0.53.0' },
    { name: 'Countdown', kind: 'type', signature: 'interface Countdown { remaining: () => Duration; totalMs: () => number; done: () => boolean }', summary: 'What `useCountdown` returns.', example: `const c: Countdown = useCountdown(Date.UTC(2031, 0, 1))`, stability: 'experimental', since: '0.53.0' },
    {
      name: 'toInstant',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime, zone: TimeZone, options?: { disambiguation?: "compatible" | "earlier" | "later" | "reject" }) => Instant',
      summary:
        'The instant at which a wall-clock time happens in a zone. A PlainDate means its midnight (its start of day). When the clocks go forward a time can not exist, and when they go back it happens twice; `disambiguation` follows Temporal exactly: `compatible` (default) takes the first of two and shifts a missing time forward by the length of the gap, `earlier` and `later` pick a side, `reject` throws.',
      example: `const gap = toInstant('2026-03-29T02:30', 'Europe/Prague')           // 02:30 does not exist
new Date(gap).toISOString()                   // => '2026-03-29T01:30:00.000Z'
new Date(toInstant('2026-03-29T02:30', 'Europe/Prague', { disambiguation: 'earlier' })).toISOString()  // => '2026-03-29T00:30:00.000Z'
new Date(toInstant('2026-10-25T02:30', 'Europe/Prague', { disambiguation: 'later' })).toISOString()    // => '2026-10-25T01:30:00.000Z'`,
      mistakes: ['Using `new Date("2026-03-29T02:30")`: it reads the machine\'s zone, not the zone you name, and silently shifts in a gap'],
      seeAlso: ['toPlainDateTime', 'addInstant'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'toPlainDateTime',
      kind: 'function',
      signature: '(instant: Instant, zone: TimeZone) => PlainDateTime',
      summary: 'The wall-clock date and time of an instant in a zone. Seconds are always written, milliseconds only when non-zero.',
      example: `toPlainDateTime(0, 'Europe/Prague')           // => '1970-01-01T01:00'
toPlainDateTime(0, 'America/St_Johns')        // => '1969-12-31T20:30'`,
      seeAlso: ['toPlainDate', 'toPlainTime', 'offsetAt'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'toPlainDate',
      kind: 'function',
      signature: '(instant: Instant, zone: TimeZone) => PlainDate',
      summary: 'The calendar date of an instant in a zone.',
      example: `toPlainDate(Date.UTC(2026, 10, 18, 23, 30), 'Asia/Tokyo') // => '2026-11-19'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'toPlainTime',
      kind: 'function',
      signature: '(instant: Instant, zone: TimeZone) => PlainTime',
      summary: 'The time of day of an instant in a zone.',
      example: `toPlainTime(Date.UTC(2026, 10, 18, 13, 30), 'Europe/Prague') // => '14:30'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'offsetAt',
      kind: 'function',
      signature: '(instant: Instant, zone: TimeZone) => number',
      summary: 'Minutes east of UTC at an instant: 120 for Europe/Prague in summer, 345 for Asia/Kathmandu. Fractional only in the pre-1900 local-mean-time eras of some zones.',
      example: `offsetAt(Date.UTC(2026, 6, 1), 'Europe/Prague')  // => 120
offsetAt(Date.UTC(2026, 0, 1), 'Asia/Kathmandu') // => 345`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'addInstant',
      kind: 'function',
      signature: '(instant: Instant, duration: Duration, zone?: TimeZone) => Instant',
      summary:
        'Move an instant by a duration. Years, months, weeks and days move the zone\'s wall clock (so "one day later" keeps the time of day across a DST change, and the 23- or 25-hour day is handled) and need `zone`; hours, minutes, seconds and milliseconds move the instant itself. The resulting wall time is resolved with the `compatible` rule.',
      example: `const noon = Date.UTC(2026, 2, 28, 11, 0)    // 12:00 in Prague, the day before the clocks change
new Date(addInstant(noon, { days: 1 }, 'Europe/Prague')).toISOString()  // => '2026-03-29T10:00:00.000Z'
new Date(addInstant(noon, { hours: 24 })).toISOString()                 // => '2026-03-29T11:00:00.000Z'`,
      mistakes: ['Expecting `{ days: 1 }` to be 24 hours: it is one calendar day. Use `{ hours: 24 }` for an exact span'],
      seeAlso: ['add', 'toInstant'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'isTimeZone',
      kind: 'function',
      signature: '(x: unknown) => x is TimeZone',
      summary: 'Whether the platform knows this time zone name. Never throws; use it to validate user input before calling the zone functions, which throw on an unknown zone.',
      example: `isTimeZone('Europe/Prague')                   // => true
isTimeZone('Mars/Olympus')                    // => false`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'fromDate',
      kind: 'function',
      signature: '(date: Date, zone?: TimeZone) => PlainDateTime',
      summary: 'The wall-clock date and time of a `Date` in `zone` (default: the runtime\'s local zone).',
      example: `fromDate(new Date(Date.UTC(2026, 10, 18, 13, 30)), 'Europe/Prague') // => '2026-11-18T14:30'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'toDate',
      kind: 'function',
      signature: '(value: PlainDate | PlainDateTime | Instant, zone?: TimeZone) => Date',
      summary: 'A `Date` for an Instant, or for a wall-clock value in `zone` (default: the runtime\'s local zone, like `new Date(y, m, d)`).',
      example: `toDate('2026-11-18T14:30', 'Europe/Prague').toISOString() // => '2026-11-18T13:30:00.000Z'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'localZone',
      kind: 'function',
      signature: '() => TimeZone',
      summary: 'The runtime\'s own time zone name (`"UTC"` when the platform cannot say). Core functions never read it implicitly except `fromDate`, `toDate` and `today` when you omit the zone.',
      example: `typeof localZone()                            // => 'string'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'toMilliseconds',
      kind: 'function',
      signature: '(duration: Duration) => number',
      summary: 'The length of a duration in milliseconds. Only fixed-length fields count (a week is seven 24-hour days, a day is 24 hours); years and months throw because they have no fixed length: use `diff` or `addInstant`.',
      example: `toMilliseconds({ hours: 1, minutes: 30 })     // => 5400000
toMilliseconds({ weeks: 1 })                  // => 604800000`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'now',
      kind: 'function',
      signature: '() => Instant',
      summary: 'The current instant. `@pyreon/time/core` returns `Date.now()`; `@pyreon/time` reads the ambient clock of `@pyreon/ambient`: the pin from `setClock`, the request\'s `provideClock` instant, or the server\'s hand-over on a hydrating page.',
      example: `typeof now()                                  // => 'number'`,
      seeAlso: ['setClock', 'today'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'today',
      kind: 'function',
      signature: '(zone?: TimeZone) => PlainDate',
      summary: 'Today\'s date in `zone` (default: the runtime\'s local zone). In `@pyreon/time` it reads the pinned clock.',
      example: `isPlainDate(today('Europe/Prague'))           // => true`,
      seeAlso: ['now', 'setClock'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'setClock',
      kind: 'function',
      signature: '(clock: (() => Instant) | null) => void',
      summary: 'Pin the clock of the whole app, for tests and previews; `null` restores the system clock. It is `@pyreon/ambient`\'s `setClock`, re-exported, so `@pyreon/format`, `@pyreon/i18n` and every hook read the same pin. Process-wide state: on a server use `provideClock` from `@pyreon/ambient` per request.',
      example: `setClock(() => Date.UTC(2031, 5, 18, 16, 0))
today('Asia/Tokyo')                           // => '2031-06-19'
setClock(null)`,
      mistakes: ['Calling it per request on a server: the pin is shared by every request in the process'],
      stability: 'experimental',
      since: '0.53.0',
    },
    { name: 'Instant', kind: 'type', signature: 'type Instant = number', summary: 'Epoch milliseconds, the same number as `Date.now()`.', example: `const t: Instant = Date.now()`, stability: 'experimental', since: '0.53.0' },
    { name: 'PlainDate', kind: 'type', signature: 'type PlainDate = `${number}-${number}-${number}`', summary: '`2026-11-18`. The type is looser than the runtime check (`"2026-1-3"` type-checks and fails `isPlainDate`), because template literal types cannot count digits.', example: `const d: PlainDate = '2026-11-18'`, stability: 'experimental', since: '0.53.0' },
    { name: 'PlainTime', kind: 'type', signature: 'type PlainTime = `${number}:${number}` | `${number}:${number}:${number}` | `${number}:${number}:${number}.${number}`', summary: '`14:30`, `14:30:05` or `14:30:05.250`.', example: `const t: PlainTime = '14:30'`, stability: 'experimental', since: '0.53.0' },
    { name: 'PlainDateTime', kind: 'type', signature: 'type PlainDateTime = `${PlainDate}T${PlainTime}`', summary: '`2026-11-18T14:30`: no offset, no zone name.', example: `const dt: PlainDateTime = '2026-11-18T14:30'`, stability: 'experimental', since: '0.53.0' },
    { name: 'PlainYearMonth', kind: 'type', signature: 'type PlainYearMonth = `${number}-${number}`', summary: '`2026-11`.', example: `const ym: PlainYearMonth = '2026-11'`, stability: 'experimental', since: '0.53.0' },
    { name: 'TimeZone', kind: 'type', signature: 'type TimeZone = string', summary: 'An IANA zone name such as `Europe/Prague`, or `UTC`.', example: `const z: TimeZone = 'Europe/Prague'`, stability: 'experimental', since: '0.53.0' },
    { name: 'Duration', kind: 'type', signature: 'interface Duration { years?: number; months?: number; weeks?: number; days?: number; hours?: number; minutes?: number; seconds?: number; milliseconds?: number }', summary: 'A span of time. Every field is an integer and every non-zero field shares one sign.', example: `const d: Duration = { months: 1, days: 2 }`, stability: 'experimental', since: '0.53.0' },
    { name: 'Unit', kind: 'type', signature: "type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond'", summary: 'Singular unit names (`DateUnit` and `TimeUnit` are the two halves). A plural such as `"days"` is a programmer error and throws.', example: `const u: Unit = 'day'`, stability: 'experimental', since: '0.53.0' },
    { name: 'Weekday', kind: 'type', signature: 'type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7', summary: 'ISO weekday: 1 Monday ... 7 Sunday.', example: `const w: Weekday = 7`, stability: 'experimental', since: '0.53.0' },
    { name: 'Disambiguation', kind: 'type', signature: "type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject'", summary: 'How a wall-clock time in a DST gap or overlap picks an instant (Temporal\'s modes).', example: `const m: Disambiguation = 'reject'`, stability: 'experimental', since: '0.53.0' },
    {
      name: 'inZone',
      kind: 'function',
      signature: '(zone: TimeZone) => { zone, today, toInstant, toPlainDate, toPlainTime, toPlainDateTime, addInstant, offsetAt, startOfDay, endOfDay }',
      summary:
        'The zone-taking functions with one zone applied, for code that works in one zone. Create it once (module scope or a setup function): the members are plain functions created by the `inZone` call, so a conversion does no more work than the unbound function. The zone is validated at `inZone`, so a typo fails there. It is not reactive; it pulls every zone function into the bundle, so import the individual functions when you need one or two.',
      example: `const prague = inZone('Europe/Prague')
const t = prague.toInstant('2026-03-29T02:30')  // 02:30 does not exist: 03:30 CEST
new Date(t).toISOString()                      // => '2026-03-29T01:30:00.000Z'
prague.toPlainDate(t)                          // => '2026-03-29'
prague.offsetAt(t)                             // => 120
new Date(prague.startOfDay(t)).toISOString()   // => '2026-03-28T23:00:00.000Z'`,
      seeAlso: ['toInstant', 'toPlainDateTime'],
      stability: 'experimental',
      since: '0.53.0',
    },
    { name: 'Adjuster', kind: 'type', signature: 'type Adjuster<T> = (value: T) => T', summary: 'A value-to-same-value function, what `add({ months: 1 })` from `@pyreon/time/fp` returns.', example: `import { startOf } from '@pyreon/time/fp'
const month: Adjuster<PlainDate> = startOf('month')`, stability: 'experimental', since: '0.53.0' },
    { name: 'Mapper', kind: 'type', signature: 'type Mapper<A, B> = (value: A) => B', summary: 'A value-to-other-value function, such as `toPlainDate(zone)` or `diffFrom(base, "day")` from `@pyreon/time/fp`.', example: `import { toPlainDate } from '@pyreon/time/fp'
const day: Mapper<number, PlainDate> = toPlainDate('Europe/Prague')`, stability: 'experimental', since: '0.53.0' },
    { name: 'ZonedToolkit', kind: 'type', signature: 'interface ZonedToolkit { readonly zone: TimeZone; today(): PlainDate; toInstant(...); toPlainDate(instant); ... }', summary: 'The object `inZone` returns.', example: `const z: ZonedToolkit = inZone('UTC')`, stability: 'experimental', since: '0.53.0' },
    ...fpEntries,
  ],
  gotchas: [
    {
      label: 'Accepted ISO forms',
      note: 'PlainDate `YYYY-MM-DD` (year 0001-9999, a real day); PlainYearMonth `YYYY-MM`; PlainTime `HH:MM`, `HH:MM:SS` or `HH:MM:SS.f` to `.fff` (hour 00-23, second 00-59, no `24:00`, no leap second); PlainDateTime a PlainDate, an upper-case `T`, a PlainTime. No offsets or zone names, no lower-case `t`, no space separator, no unpadded fields: `isPlainDate("2026-2-3")` is false. Temporal accepts more; this package is strict so a value is always canonical and `compare` can be a string comparison. `parseInstant` is the one parser for timestamps with an offset.',
    },
    {
      label: 'Throws versus returns',
      note: 'The `isPlain*` guards, `isTimeZone`, `parseInstant` and `parseISO` never throw. Every other function throws a `[Pyreon]` error on a value of the wrong shape (validate user input with a guard first), an unknown unit or zone, a mixed-sign duration, or a result outside years 0001-9999. Rendering code that must not throw belongs behind a guard or in `@pyreon/format`.',
    },
    {
      label: 'Time zones',
      note: 'Offsets come from `Intl.DateTimeFormat`, so results follow the engine\'s tz data (Node, Chromium and Bun can differ for recent rule changes). One formatter per zone is cached; the table holds 64 zones (oldest dropped first, rebuilt on next use) and each zone keeps a fixed 127-slot offset table. Core functions require an explicit `zone`; the reactive entry (`@pyreon/time`) defaults it to the active time zone of `@pyreon/ambient`.',
    },
    {
      label: 'Month arithmetic',
      note: '`add` clamps the day (Jan 31 + 1 month = Feb 28). `diff` counts a month as complete when that clamped addition does not pass the end, which is Temporal\'s truncated `until`; `between` returns Temporal\'s unrounded breakdown, where a month ends only when the day number is reached (2012-08-31 to 2051-02-28 is 38 years, 5 months, 28 days). The two can differ by one month at month ends, exactly as in Temporal.',
    },
    {
      label: 'Durations',
      note: 'Years and months must be whole numbers (a fractional month has no fixed length: use days or weeks). Weeks, days, hours, minutes and seconds may be fractional and balance down: `{ days: 1.5 }` is one day and twelve hours, rounded to the nearest millisecond. `{ milliseconds: 0.5 }`, NaN, Infinity and non-numbers throw. `-0` is `0`. A fraction that leaves a time of day cannot be added to a PlainDate, which throws and says to use a PlainDateTime.',
    },
    {
      label: 'Canonical output',
      note: 'Every PlainTime and PlainDateTime the package returns is the shortest exact form (`HH:MM`, `HH:MM:SS` only when seconds are non-zero, `.mmm` only when milliseconds are non-zero), so equal values are equal strings: `===`, `Object.is`, Map keys, `groupBy` keys and plain string sorting are all correct on them. Inputs of any accepted precision stay accepted. Normalise external input once at the boundary with `normalize`. Fractions are at most three digits: finer values are rejected, not rounded.',
    },
    {
      label: 'Operations as values',
      note: '`@pyreon/time/fp` has the value-last form of every operation (`add({ months: 1 })` returns a function), `pipe` and `by`; they are thin wrappers over core, each tree-shakes alone, and a built adjuster costs one extra call per use, so build it once. `inZone(zone)` binds the zone-taking functions and pulls all of them. Because values are plain strings and numbers, `between(a, b)` is already the Duration `@pyreon/format` takes, and PlainDate, PlainDateTime and Instant are already its date inputs: neither package depends on the other.',
    },
    {
      label: 'Not included yet',
      note: '`fromTemporal` / `toTemporal` are left out: typing them without depending on Temporal typings is not clean, and a Plain value maps to Temporal with one `Temporal.PlainDate.from(value)`. Text for relative times (`useRelativeTime`, `<RelativeTime>`) belongs to `@pyreon/format`, built on `@pyreon/ambient`\'s clock.',
    },
  ],
  since: '0.53.0',
})
