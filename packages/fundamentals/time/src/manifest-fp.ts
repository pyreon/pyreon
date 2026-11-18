import type { ApiEntry } from '@pyreon/manifest'

/** `@pyreon/time/fp` names with no value-first namesake: documented under their own name. */
const FP_ONLY = ['isBetween', 'diffFrom', 'betweenFrom', 'by', 'pipe']

/** One `@pyreon/time/fp` entry. Named `fp.<name>` so it does not collide with the value-first function of the same name. */
const FP_NAMES = ['add', 'subtract', 'startOf', 'endOf', 'isBefore', 'isAfter', 'isSame', 'isBetween', 'clamp', 'diffFrom', 'betweenFrom', 'by', 'compare', 'toInstant', 'toPlainDate', 'toPlainTime', 'toPlainDateTime', 'offsetAt', 'addInstant', 'monthGrid', 'fromDate', 'toDate', 'pipe']

/** The `@pyreon/time/fp` names an example calls, as an import line (so the example typechecks against the fp entry). */
function fpImport(example: string): string {
  const used = FP_NAMES.filter((n) => new RegExp(`(^|[^.\\w])${n}\\(`).test(example) || (n === 'compare' && /\\.sort\\(compare\\)/.test(example)))

  return `import { ${used.join(', ')} } from '@pyreon/time/fp'\n`
}

function fp(name: string, signature: string, summary: string, example: string, seeAlso?: string[]): ApiEntry {
  return { name: FP_ONLY.includes(name) ? name : `fp.${name}`, kind: 'function', signature, summary, example: fpImport(example) + example, ...(seeAlso ? { seeAlso } : {}), stability: 'experimental', since: '0.53.0' }
}

const ADJ = '<T extends PlainDate | PlainDateTime | PlainYearMonth>(value: T) => same shape as T'

/** The `@pyreon/time/fp` entries of the manifest. */
export const fpEntries: ApiEntry[] = [
    fp('add', `(duration: Duration) => ${ADJ}`, 'Value-last `add`: `add({ months: 1 })` is a function you can name, pass to `map` and chain with `pipe`. The result keeps the input shape.', `const nextMonth = add({ months: 1 })
nextMonth('2026-01-31')                       // => '2026-02-28'
['2026-01-31', '2026-03-01'].map(nextMonth)   // => ['2026-02-28', '2026-04-01']`, ['add']),
    fp('subtract', `(duration: Duration) => ${ADJ}`, 'Value-last `subtract`.', `subtract({ days: 1 })('2026-03-01')      // => '2026-02-28'`),
    fp('startOf', `(unit: Unit, options?: { weekStart?: Weekday }) => ${ADJ}`, 'Value-last `startOf`.', `startOf('week')('2026-11-18')              // => '2026-11-16'
startOf('week', { weekStart: 7 })('2026-11-18')  // => '2026-11-15'`),
    fp('endOf', `(unit: Unit, options?: { weekStart?: Weekday }) => ${ADJ}`, 'Value-last `endOf`.', `endOf('month')('2026-11-18')               // => '2026-11-30'`),
    fp('isBefore', '(limit: T) => (value: shape of T) => boolean', 'A predicate: `isBefore(limit)(value)` is true for values before `limit`, so it reads correctly in `filter`.', `['2026-01-01', '2026-06-01'].filter(isBefore('2026-03-01'))  // => ['2026-01-01']`),
    fp('isAfter', '(limit: T) => (value: shape of T) => boolean', 'A predicate: true for values after `limit`.', `['2026-01-01', '2026-06-01'].filter(isAfter('2026-03-01'))   // => ['2026-06-01']`),
    fp('isSame', '(other: T, unit?: Unit, options?: { weekStart?: Weekday }) => (value: shape of T) => boolean', 'A predicate: true for values in the same unit as `other`.', `['2026-11-02', '2026-12-01'].filter(isSame('2026-11-18', 'month'))  // => ['2026-11-02']`),
    fp('isBetween', '(start: T, end: T) => (value: shape of T) => boolean', 'A predicate: true for values from `start` to `end`, both included.', `['2026-01-05', '2026-02-10', '2026-03-20'].filter(isBetween('2026-02-01', '2026-03-01'))  // => ['2026-02-10']`),
    fp('clamp', '(lo: T, hi: T) => (value: shape of T) => shape of T', 'Limit values to a range. Throws when `lo` is after `hi`.', `['2025-05-01', '2026-02-01', '2027-01-01'].map(clamp('2026-01-01', '2026-03-01'))  // => ['2026-01-01', '2026-02-01', '2026-03-01']`),
    fp('diffFrom', '(base: T, unit: Unit, options?: { zone?: TimeZone }) => (value: shape of T) => number', 'Whole units from `base` to each value: `dates.map(diffFrom(today, "day"))` reads left to right.', `['2026-01-10', '2026-01-03'].map(diffFrom('2026-01-01', 'day'))  // => [9, 2]`),
    fp('betweenFrom', '(base: PlainDate | PlainDateTime) => (value: same shape) => Duration', 'The Duration from `base` to each value.', `betweenFrom('2026-01-31')('2026-03-01')      // => { years: 0, months: 1, days: 1 }`),
    fp('by', '(mapper: (item: A) => K) => (a: A, b: A) => -1 | 0 | 1', 'A comparator that orders items by a mapped value: `items.sort(by(toDay))`.', `const events: { d: PlainDate }[] = [{ d: '2026-03-01' }, { d: '2026-01-01' }]
events.sort(by((x) => x.d)).map((x) => x.d)  // => ['2026-01-01', '2026-03-01']`),
    fp('compare', '(a: T, b: T) => -1 | 0 | 1', 'The same function as the value-first `compare`: it is already a comparator for `Array#sort`.', `const days: PlainDate[] = ['2026-03-01', '2026-01-01']
days.sort(compare)                            // => ['2026-01-01', '2026-03-01']`),
    fp('toInstant', '(zone: TimeZone, options?: { disambiguation? }) => (value: PlainDate | PlainDateTime) => Instant', 'Value-last `toInstant`.', `new Date(toInstant('UTC')('2026-11-18T14:30')).toISOString()  // => '2026-11-18T14:30:00.000Z'`),
    fp('toPlainDate', '(zone: TimeZone) => (instant: Instant) => PlainDate', 'Value-last `toPlainDate`: a groupBy key for bucketing instants by local day.', `toPlainDate('Asia/Tokyo')(Date.UTC(2026, 10, 18, 23, 30))  // => '2026-11-19'`),
    fp('toPlainTime', '(zone: TimeZone) => (instant: Instant) => PlainTime', 'Value-last `toPlainTime`.', `toPlainTime('Europe/Prague')(Date.UTC(2026, 10, 18, 13, 30))  // => '14:30'`),
    fp('toPlainDateTime', '(zone: TimeZone) => (instant: Instant) => PlainDateTime', 'Value-last `toPlainDateTime`.', `toPlainDateTime('Europe/Prague')(0)           // => '1970-01-01T01:00'`),
    fp('offsetAt', '(zone: TimeZone) => (instant: Instant) => number', 'Value-last `offsetAt`.', `offsetAt('Asia/Kathmandu')(Date.UTC(2026, 0, 1))  // => 345`),
    fp('addInstant', '(duration: Duration, zone?: TimeZone) => (instant: Instant) => Instant', 'Value-last `addInstant`.', `new Date(addInstant({ days: 1 }, 'UTC')(Date.UTC(2026, 0, 31))).toISOString()  // => '2026-02-01T00:00:00.000Z'`),
    fp('monthGrid', '(options?: MonthGridOptions) => (month: PlainYearMonth | PlainDate) => PlainDate[][]', 'Value-last `monthGrid`.', `monthGrid({ weekStart: 7 })('2026-11').length  // => 5`),
    fp('fromDate', '(zone?: TimeZone) => (date: Date) => PlainDateTime', 'Value-last `fromDate`.', `fromDate('UTC')(new Date(0))                  // => '1970-01-01T00:00'`),
    fp('toDate', '(zone?: TimeZone) => (value: PlainDate | PlainDateTime | Instant) => Date', 'Value-last `toDate`.', `toDate('UTC')('1970-01-01').getTime()         // => 0`),
    fp(
      'pipe',
      '(f1: (a: A) => B, f2: (b: B) => C, ...up to eight steps) => (value: A) => result',
      'Left-to-right composition of unary functions, typed for up to eight steps, so pipelines need no other package: `pipe(add({ months: 1 }), startOf("month"))` goes to the first of next month. The result is a plain function. One to three steps are direct closures. Not the same as `@pyreon/rx`\'s `pipe`, which takes a source value (or signal) first and runs the steps over it; adjusters work as the steps and as the callbacks of rx\'s `map`, `groupBy` and `sortBy`.',
      `const nextMonthStart = pipe(add({ months: 1 }), startOf('month'))
nextMonthStart('2026-01-31')                  // => '2026-02-01'
['2026-01-31', '2026-11-18'].map(nextMonthStart)  // => ['2026-02-01', '2026-12-01']`,
    ),
]
