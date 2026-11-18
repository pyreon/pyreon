/**
 * @pyreon/time vs native Date, Temporal, date-fns (+ @date-fns/tz), Day.js (utc + timezone plugins) and Luxon.
 *
 * Run: `bun run bench:rivals` (from packages/fundamentals/time). Harness and measurement contract:
 * `scripts/bench/rivals-harness.ts` (one fresh bun process per op × arm × round, cluster-bootstrap CI95 over processes,
 * correctness gate before any timing, no forced GC, NODE_ENV=production). Engine: Bun / JavaScriptCore. Intl-backed rows
 * (zone conversion) depend on the engine's Intl; V8 numbers are not measured here.
 *
 * FRAMING. The workload is "ISO string in, ISO string out" (what a date looks like in props, JSON and URLs), because
 * that is the model @pyreon/time is built around. A library that keeps its own object between calls (Day.js, Luxon,
 * Temporal) pays parse and format at the boundary here; each arm parses and formats the cheapest idiomatic way for that
 * library. A workload that keeps one object across many operations would favour the object libraries; it is not measured.
 *
 * GROUND TRUTH. The gate compares every arm's output, for every input, with `Temporal` (the platform reference) before
 * timing; an arm that skips work or gets a month-end wrong fails it. Inputs are chosen away from DST transitions for the
 * zone rows (the libraries resolve a gap or overlap differently, and that is a correctness comparison, not a speed one).
 *
 * ARMS, each used the way its docs recommend:
 *  - Pyreon: `@pyreon/time/core` functions on strings and numbers.
 *  - Date (floor, non-ranking): hand-written UTC `Date` code, the cheapest thing a developer would write. Zone rows use
 *    one cached `Intl.DateTimeFormat` and the standard offset-guess loop.
 *  - Temporal: native `Temporal.PlainDate` / `Instant.toZonedDateTimeISO`.
 *  - date-fns 4: `parseISO`, `addDays`, `addMonths`, `differenceInCalendarDays`, `startOfWeek`, `eachDayOfInterval`;
 *    zones through the official companion `@date-fns/tz` (`TZDate`).
 *  - Day.js: `dayjs(...)` with the `utc`, `timezone` and `isoWeek` plugins; zones through `dayjs.tz`.
 *  - Luxon 3: `DateTime.fromISO`, `plus`, `diff`, `startOf`; zones through a reused `IANAZone` instance.
 * date-fns, Day.js and Luxon run in the machine's local zone for the plain-date rows (their documented default).
 */
import { runRivalBench, type Arm } from '../../../../scripts/bench/rivals-harness'
import { dateApi } from './arms/date'
import { dateFnsApi } from './arms/date-fns'
import { dayjsApi } from './arms/dayjs'
import { luxonApi } from './arms/luxon'
import { pyreonApi } from './arms/pyreon'
import { temporalApi } from './arms/temporal'
import { type Api, DATES, INSTANTS, MONTH_ENDS, MONTHS, PAIRS, WALLS } from './arms/common'

type Id = 'pyreon' | 'date' | 'temporal' | 'date-fns' | 'dayjs' | 'luxon'
const ARMS: readonly Arm<Id>[] = [
  { id: 'pyreon', label: 'Pyreon' },
  { id: 'date', label: 'Date (hand-written UTC code)', ranking: false },
  { id: 'temporal', label: 'Temporal (native)' },
  { id: 'date-fns', label: 'date-fns (+ @date-fns/tz)', pkg: 'date-fns' },
  { id: 'dayjs', label: 'Day.js (utc, timezone, isoWeek)', pkg: 'dayjs' },
  { id: 'luxon', label: 'Luxon', pkg: 'luxon' },
]

let sink = 0

function build(id: Id): Api {
  switch (id) {
    case 'pyreon':
      return pyreonApi()
    case 'date':
      return dateApi()
    case 'temporal':
      return temporalApi()
    case 'date-fns':
      return dateFnsApi()
    case 'dayjs':
      return dayjsApi()
    case 'luxon':
      return luxonApi()
  }
}

/** Every arm must equal Temporal on every input of every op. */
function gate(): void {
  const truth = temporalApi()

  for (const id of ARMS.map((a) => a.id)) {
    const api = build(id)
    const bad = (op: string, input: unknown, got: unknown, want: unknown): never => {
      throw new Error(`[correctness] ${id} ${op}(${JSON.stringify(input)}): got ${JSON.stringify(got)}, Temporal says ${JSON.stringify(want)}`)
    }
    const check = <T>(op: string, input: unknown, got: T, want: T): void => {
      if (JSON.stringify(got) !== JSON.stringify(want)) bad(op, input, got, want)
    }

    for (const d of DATES) {
      check('addDays', d, api.addDays(d), truth.addDays(d))
      check('startOfWeek', d, api.startOfWeek(d), truth.startOfWeek(d))
      check('startOfMonth', d, api.startOfMonth(d), truth.startOfMonth(d))
      check('parse', d, api.parse(d), truth.parse(d))
    }
    for (const d of MONTH_ENDS) check('addMonths', d, api.addMonths(d), truth.addMonths(d))
    for (const [a, b] of PAIRS) {
      check('diffDays', [a, b], api.diffDays(a, b), truth.diffDays(a, b))
      check('isBefore', [a, b], api.isBefore(a, b), truth.isBefore(a, b))
    }
    for (const m of MONTHS) check('grid', m, api.grid(m), truth.grid(m))
    for (const t of INSTANTS) check('toWall', t, api.toWall(t), truth.toWall(t))
    for (const w of WALLS) check('toInstant', w, api.toInstant(w), truth.toInstant(w))
  }
}

function cycle<T>(items: readonly T[]): () => T {
  let i = 0

  return () => items[i++ & (items.length - 1)] as T
}

await runRivalBench<Id>({
  title: '@pyreon/time vs Date, Temporal, date-fns, Day.js and Luxon (ISO string in, ISO string out)',
  file: import.meta.path,
  pyreon: 'pyreon',
  arms: ARMS,
  sink: () => sink,
  gate,
  footnotes: [
    'Every arm matches Temporal on every input (gate above). Plain-date rows: date-fns, Day.js and Luxon run in the local zone (their default); Pyreon, Temporal and Date are zone-free.',
    'Date is a hand-written floor (non-ranking). Zone rows avoid DST transitions on purpose; the libraries differ in how they resolve a gap or overlap (only Pyreon and Temporal implement all four Temporal modes).',
    'Cold rows are the first call in a fresh process (5 samples): they include each library\'s lazy initialisation (formatter construction, zone-table fill).',
  ],
  ops: {
    'add 1 day': { make: (id) => { const a = build(id); const n = cycle(DATES); return () => { sink += a.addDays(n()).length } } },
    'add 1 month (clamps month ends)': { make: (id) => { const a = build(id); const n = cycle(MONTH_ENDS); return () => { sink += a.addMonths(n()).length } } },
    'diff in days': { make: (id) => { const a = build(id); const n = cycle(PAIRS); return () => { const p = n(); sink += a.diffDays(p[0], p[1]) } } },
    'compare (isBefore)': { make: (id) => { const a = build(id); const n = cycle(PAIRS); return () => { const p = n(); sink += a.isBefore(p[0], p[1]) ? 1 : 0 } } },
    'start of week (Monday)': { make: (id) => { const a = build(id); const n = cycle(DATES); return () => { sink += a.startOfWeek(n()).length } } },
    'start of month': { make: (id) => { const a = build(id); const n = cycle(DATES); return () => { sink += a.startOfMonth(n()).length } } },
    'parse ISO date to y/m/d': { make: (id) => { const a = build(id); const n = cycle(DATES); return () => { sink += a.parse(n()) } } },
    'month grid (42 dates)': {
      iters: 2000,
      warmup: 200,
      note: 'six Monday-first weeks as ISO strings; divide=42 so the figure is per date',
      divide: 42,
      make: (id) => { const a = build(id); const n = cycle(MONTHS); return () => { sink += a.grid(n()).length } },
    },
    'instant to Prague wall time (warm)': { iters: 5000, make: (id) => { const a = build(id); const n = cycle(INSTANTS); return () => { sink += a.toWall(n()).length } } },
    'Prague wall time to instant (warm)': { iters: 5000, make: (id) => { const a = build(id); const n = cycle(WALLS); return () => { sink += a.toInstant(n()) } } },
    'instant to Prague wall time (cold, first call)': {
      iters: 1,
      runs: 1,
      warmup: 0,
      make: (id) => { const a = build(id); return () => { sink += a.toWall(INSTANTS[0]).length } },
    },
    'Prague wall time to instant (cold, first call)': {
      iters: 1,
      runs: 1,
      warmup: 0,
      make: (id) => { const a = build(id); return () => { sink += a.toInstant(WALLS[0]) } },
    },
  },
})
