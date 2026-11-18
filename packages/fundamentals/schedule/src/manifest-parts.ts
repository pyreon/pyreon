import type { ApiEntry } from '@pyreon/manifest'

/** One manifest entry; every example line with `// =>` is executed by `tests/examples.test.ts`. */
export function entry(name: string, signature: string, summary: string, example: string, extra?: Partial<ApiEntry>): ApiEntry {
  return { name, kind: 'function', signature, summary, example, ...extra, stability: 'experimental', since: '0.53.0' }
}

export const typeEntry = (name: string, signature: string, summary: string, example: string): ApiEntry =>
  ({ name, kind: 'type', signature, summary, example, stability: 'experimental', since: '0.53.0' })

const F = (name: string, signature: string, summary: string, example: string): ApiEntry =>
  entry(`fp.${name}`, signature, summary, `import { ${name} } from '@pyreon/schedule/fp'\n${example}`)

/** The `@pyreon/schedule/fp` entries. */
export const fpEntries: ApiEntry[] = [
  F('occurrencesBetween', '(from, to) => (rule: Recurrence) => PlainValue[]', 'Value-last `occurrencesBetween`.', `occurrencesBetween('2026-11-02', '2026-11-16')({ every: 'week', start: '2026-11-02' })   // => ['2026-11-02', '2026-11-09', '2026-11-16']`),
  F('nextOccurrence', '(after) => (rule: Recurrence) => PlainValue | null', 'Value-last `nextOccurrence`.', `nextOccurrence('2026-11-18')({ every: 'week', start: '2026-11-02' })   // => '2026-11-23'`),
  F('previousOccurrence', '(before) => (rule: Recurrence) => PlainValue | null', 'Value-last `previousOccurrence`.', `previousOccurrence('2026-11-18')({ every: 'week', start: '2026-11-02' })   // => '2026-11-16'`),
  F('occursOn', '(date) => (rule: Recurrence) => boolean', 'Value-last `occursOn`.', `occursOn('2026-11-09')({ every: 'week', start: '2026-11-02' })   // => true`),
  F('describeRule', '(options?) => (rule: Recurrence) => string', 'Value-last `describeRule`.', `describeRule()({ every: 'day', start: '2026-11-18' })   // => 'Every day'`),
  F('isBusinessDay', '(calendar) => (date) => boolean', 'Value-last `isBusinessDay`: `isBusinessDay(cal)` is a predicate for `filter`.', `isBusinessDay({})('2026-11-21')   // => false`),
  F('addBusinessDays', '(n, calendar) => (date: PlainDate) => PlainDate', 'Value-last `addBusinessDays`.', `addBusinessDays(2, {})('2026-11-20')   // => '2026-11-24'`),
  F('businessDaysBetween', '(b, calendar) => (a: PlainDate) => number', 'Value-last `businessDaysBetween` (the first date goes last).', `businessDaysBetween('2026-11-23', {})('2026-11-16')   // => 5`),
  F('nextBusinessDay', '(calendar) => (date: PlainDate) => PlainDate', 'Value-last `nextBusinessDay`.', `nextBusinessDay({})('2026-11-20')   // => '2026-11-23'`),
  F('previousBusinessDay', '(calendar) => (date: PlainDate) => PlainDate', 'Value-last `previousBusinessDay`.', `previousBusinessDay({})('2026-11-23')   // => '2026-11-20'`),
  F('addBusinessTime', '(duration, calendar) => (start: PlainDateTime) => PlainDateTime', 'Value-last `addBusinessTime`.', `addBusinessTime({ hours: 1 }, { hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T09:00')   // => '2026-11-18T10:00'`),
  F('isOpen', '(calendar) => (at: PlainDateTime) => boolean', 'Value-last `isOpen`.', `isOpen({ hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T10:00')   // => true`),
  F('nextOpening', '(calendar) => (at: PlainDateTime) => PlainDateTime | null', 'Value-last `nextOpening`.', `nextOpening({ hours: { 4: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T10:00')   // => '2026-11-19T09:00'`),
  F('nextClosing', '(calendar) => (at: PlainDateTime) => PlainDateTime | null', 'Value-last `nextClosing`.', `nextClosing({ hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T10:00')   // => '2026-11-18T17:00'`),
  F('overlaps', '(b: Interval) => (a: Interval) => boolean', 'Value-last `overlaps`.', `overlaps({ start: '2026-11-18T09:30', end: '2026-11-18T11:00' })({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' })   // => true`),
  F('intersection', '(b: Interval) => (a: Interval) => Interval | null', 'Value-last `intersection`.', `intersection({ start: '2026-11-18T09:30', end: '2026-11-18T11:00' })({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' })   // => { start: '2026-11-18T09:30', end: '2026-11-18T10:00' }`),
  F('subtractIntervals', '(busy: Interval[]) => (from: Interval[]) => Interval[]', 'Value-last `subtractIntervals`.', `subtractIntervals([{ start: '2026-11-18T12:00', end: '2026-11-18T13:00' }])([{ start: '2026-11-18T09:00', end: '2026-11-18T14:00' }])   // => [{ start: '2026-11-18T09:00', end: '2026-11-18T12:00' }, { start: '2026-11-18T13:00', end: '2026-11-18T14:00' }]`),
  F('expandEvents', '(range: Interval) => (events) => EventInstance[]', 'Value-last `expandEvents`.', `expandEvents({ start: '2026-11-18T00:00', end: '2026-11-19T00:00' })([{ id: 'a', start: '2026-11-18T09:00', end: '2026-11-18T10:00' }]).map((i) => i.start)   // => ['2026-11-18T09:00']`),
]
