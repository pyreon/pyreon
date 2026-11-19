/**
 * What composition costs: `@pyreon/time/fp` pipelines and prebuilt adjusters against direct core calls and against
 * hand-written `Date` code. Run: `bun run bench:fp` (harness and contract: `scripts/bench/rivals-harness.ts`, bun /
 * JavaScriptCore; one fresh process per op x arm x round, cluster-bootstrap CI95, correctness gate first).
 *
 * "direct" is the baseline the other Pyreon arms are judged against: an fp arm adds one closure call per step over it, and
 * this bench reports how much that is. The `date` arm is hand-written UTC `Date` code (non-ranking floor).
 */
import { add as coreAdd, endOf as coreEndOf, startOf as coreStartOf, toPlainDate as coreToPlainDate, inZone } from '../src/core'
import type { PlainDate } from '../src/core'
import { add, endOf, pipe, startOf, toPlainDate } from '../src/fp'
import { runRivalBench, type Arm } from '../../../../scripts/bench/rivals-harness'

type Id = 'direct' | 'fp' | 'zoned' | 'date'

const ARMS: readonly Arm<Id>[] = [
  { id: 'direct', label: 'direct core calls' },
  { id: 'fp', label: 'fp (prebuilt pipe / adjuster)' },
  { id: 'zoned', label: 'inZone toolkit' },
  { id: 'date', label: 'hand-written Date code', ranking: false },
]

const ZONE = 'Europe/Prague'
const DATES = ['2026-11-18', '2026-01-31', '2024-02-29', '2026-12-31', '2026-03-29', '2026-10-25', '2025-06-15', '2027-03-01'] as PlainDate[]
const LIST: PlainDate[] = Array.from({ length: 1000 }, (_, i) => DATES[i & 7] as PlainDate)
const INSTANTS = [1_767_225_600_000, 1_771_372_800_000, 1_774_000_000_000, 1_778_500_000_000, 1_782_900_000_000, 1_787_000_000_000, 1_792_000_000_000, 1_796_400_000_000]
let sink = 0

const iso = (d: Date): string => d.toISOString().slice(0, 10)

function nextMonthStartDate(s: string): string {
  const d = new Date(s)

  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)))
}

function build(id: Id): { next: (d: PlainDate) => string; monthEnds: (list: PlainDate[]) => string[]; dayKey: (t: number) => string } {
  const fpNext = pipe(add({ months: 1 }), startOf('month'))
  const fpEnd = endOf('month')
  const fpDay = toPlainDate(ZONE)
  const zoned = inZone(ZONE)
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

  switch (id) {
    case 'direct':
      return { next: (d) => coreStartOf(coreAdd(d, { months: 1 }), 'month'), monthEnds: (l) => l.map((d) => coreEndOf(d, 'month')), dayKey: (t) => coreToPlainDate(t, ZONE) }
    case 'fp':
      return { next: fpNext, monthEnds: (l) => l.map(fpEnd), dayKey: fpDay }
    case 'zoned':
      return { next: fpNext, monthEnds: (l) => l.map(fpEnd), dayKey: zoned.toPlainDate }
    case 'date':
      return {
        next: nextMonthStartDate,
        monthEnds: (l) => l.map((s) => { const d = new Date(s); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) }),
        dayKey: (t) => fmt.format(t),
      }
  }
}

function gate(): void {
  const truth = build('direct')

  for (const id of ARMS.map((a) => a.id)) {
    const api = build(id)

    for (const d of DATES) if (api.next(d) !== truth.next(d)) throw new Error(`[Pyreon] bench correctness: ${id} next(${d}) = ${api.next(d)}, expected ${truth.next(d)}`)
    if (JSON.stringify(api.monthEnds(LIST)) !== JSON.stringify(truth.monthEnds(LIST))) throw new Error(`[Pyreon] bench correctness: ${id} monthEnds differs`)
    for (const t of INSTANTS) if (api.dayKey(t) !== truth.dayKey(t)) throw new Error(`[Pyreon] bench correctness: ${id} dayKey(${t}) = ${api.dayKey(t)}, expected ${truth.dayKey(t)}`)
  }
}

await runRivalBench<Id>({
  title: '@pyreon/time/fp: composition overhead vs direct calls',
  file: import.meta.path,
  pyreon: 'direct',
  arms: ARMS,
  sink: () => sink,
  gate,
  footnotes: ['The Pyreon column here is the direct core call; ratios say what the fp / inZone forms cost or save relative to it. A prebuilt adjuster is built once outside the timed region, as the docs recommend.'],
  ops: {
    'next month start (add 1 month, then start of month)': { make: (id) => { const a = build(id); let i = 0; return () => { sink += a.next(DATES[i++ & 7] as PlainDate).length } } },
    'map 1,000 dates to their month end': {
      iters: 200,
      warmup: 50,
      divide: 1000,
      note: 'per date',
      make: (id) => { const a = build(id); return () => { sink += a.monthEnds(LIST).length } },
    },
    'bucket an instant by local day (Prague)': { make: (id) => { const a = build(id); let i = 0; return () => { sink += a.dayKey(INSTANTS[i++ & 7] as number).length } } },
  },
})
