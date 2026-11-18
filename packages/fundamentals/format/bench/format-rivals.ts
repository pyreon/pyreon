/**
 * @pyreon/format vs raw Intl, toLocaleString and the libraries people use today.
 *
 * Run (both engines; the numbers differ by engine, so state which one):
 *   bun run bench         # node / V8 (the server and Chromium engine): bundles this file, then runs it under node
 *   bun run bench:jsc     # bun / JavaScriptCore
 * Build first (`bun run build`): the Pyreon arms import the SHIPPED `lib/`.
 *
 * Measurement contract: `scripts/bench/rivals-harness.ts` (one fresh process per
 * op x arm x round, rotated order, cluster-bootstrap CI95 over processes,
 * correctness gate before timing, NODE_ENV=production, no forced GC). Never run
 * concurrently with another bench: check `uptime` and that nothing else is
 * benchmarking (the gate below prints the load).
 *
 * WHAT IS COMPARED, and how each arm is used (idiomatically, at its best):
 *  - Pyreon: the reactive entry `@pyreon/format` (the app default; one signal
 *    read more than the pure entry) and the pure `@pyreon/format/core`, the
 *    way the docs show: a hoisted options object, or an inline literal.
 *  - raw cached: one hand-built `Intl.*Format` per fixture, `.format()` in the
 *    loop. The FLOOR (non-ranking): it does no locale lookup, no option lookup
 *    and no validation, so no wrapper can beat it.
 *  - toLocaleString: `n.toLocaleString('en-US', options)`; V8 caches only the
 *    options-free form.
 *  - new Intl per call: the common mistake the cache fixes (shown, ranking).
 *  - @formatjs/intl: `createIntl` + `createIntlCache`, `intl.formatNumber(...)`.
 *  - pretty-bytes, pretty-ms, humanize-duration: the single-purpose packages,
 *    each with the options that make its output comparable.
 *
 * EQUIVALENCE: every arm of an op must print the SAME string for every input of
 * the op, checked before timing. Where a library cannot print the same string
 * for some inputs, those inputs are excluded from the gate and the difference is
 * listed in the footnotes (computed at run time, not asserted from memory).
 */
import { createIntl, createIntlCache } from '@formatjs/intl'
import humanizeDuration from 'humanize-duration'
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'
import { runRivalBench, type Arm } from '../../../../scripts/bench/rivals-harness'

// `isServer` is a module-load constant of @pyreon/reactivity: give it a DOM
// global BEFORE the library is imported, so `setLocale` is live (the client path
// the reactive entry is built for). Nothing else in this file reads `document`.
Reflect.set(globalThis, 'document', {})
const reactive = await import('../lib/index.js')
const core = await import('../lib/core.js')
reactive.setLocale('en-US')
reactive.setTimeZone('UTC')

type Id = 'pyreon' | 'pyreon-core' | 'raw-cached' | 'tolocale' | 'raw-percall' | 'formatjs' | 'pretty-bytes' | 'pretty-ms' | 'humanize-duration'

const ARMS: readonly Arm<Id>[] = [
  { id: 'pyreon', label: '@pyreon/format (reactive entry)' },
  { id: 'pyreon-core', label: '@pyreon/format/core', ranking: false },
  { id: 'raw-cached', label: 'raw Intl, cached instance', ranking: false },
  { id: 'tolocale', label: 'toLocaleString' },
  { id: 'raw-percall', label: 'new Intl.*Format per call' },
  { id: 'formatjs', label: '@formatjs/intl', pkg: '@formatjs/intl' },
  { id: 'pretty-bytes', label: 'pretty-bytes', pkg: 'pretty-bytes' },
  { id: 'pretty-ms', label: 'pretty-ms', pkg: 'pretty-ms' },
  { id: 'humanize-duration', label: 'humanize-duration', pkg: 'humanize-duration' },
]

const L = 'en-US'
const intl = createIntl({ locale: L }, createIntlCache())

let sink = ''

// ─── fixtures ────────────────────────────────────────────────────────────────

const NUMBERS = [0, 1, 42, 999.5, 1234.5678, 98765.4321, 1000000.25, -5.5, 0.000123, 123456789.123, 7, 31337, 2500, 17.99, 1e9, 65535.5]
const AMOUNTS = [9.99, 1234.5, 0, 99.5, 5, 12345.67, 0.5, 1e6, 42, 3.14, 100, 19.95, 250.1, 8, 1999.99, 12]
/** Values every byte formatter prints identically with `maximumFractionDigits: 1` and no space. */
const BYTES = [1000, 1536, 10240, 1048576, 5000123, 3.2e9, 1.5e12, 150000, 2048, 2500000, 1e7, 4.5e8, 7.7e6, 31337, 65536, 12345678]
const DURATIONS = [1500, 65000, 3905000, 90061000, 7200000, 45000, 600000, 3661000, 86400000, 5025000, 120000, 1001, 59000, 7321000, 180000, 2500]
const AT = Date.UTC(2026, 10, 18, 14, 30)
const INSTANTS = Array.from({ length: 16 }, (_, i) => AT + i * 7_919_000)
const REL = [-3, -1, 0, 1, 2, -45, 12, 5, -7, 30, -2, 9, 1, -1, 4, -10]
const DIGITAL = [3905000, 7200000, 3661000, 5025000, 7321000, 36000000, 45296000, 82800000]
const ISO_DATES = Array.from({ length: 16 }, (_, i) => `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + ((i * 7) % 28)).padStart(2, '0')}`)
const RELATIVE_OPTS = { numeric: 'auto' } as const
const PARSE_INPUTS = ['1,234.5', '98,765.4321', '42', '-5.5', '1,000,000', '0.25', '7', '123,456,789.123']
const LISTS = [['a', 'b'], ['red', 'green', 'blue'], ['x'], ['one', 'two', 'three', 'four'], ['a', 'b', 'c'], ['north', 'south'], ['1', '2', '3'], ['p', 'q']]

// Options objects the way idiomatic code writes them: hoisted constants.
const FRACTION = { maximumFractionDigits: 1 } as const
const DATE_OPTS = { locale: L, timeZone: 'UTC' } as const
const DATE_INTL = { dateStyle: 'medium', timeZone: 'UTC' } as const

// Raw instances (built once, outside the timed loop).
const nf = new Intl.NumberFormat(L)
const nfFraction = new Intl.NumberFormat(L, FRACTION)
const nfEur = new Intl.NumberFormat(L, { style: 'currency', currency: 'EUR' })
const dtf = new Intl.DateTimeFormat(L, DATE_INTL)
const rtf = new Intl.RelativeTimeFormat(L, { numeric: 'auto' })
const lf = new Intl.ListFormat(L)

const normalise = (s: string): string => s.replace(/[   ]/g, ' ')

// ─── per-op arm builders: (i) => string ─────────────────────────────────────

type Fn = (i: number) => string
type Maker = Partial<Record<Id, () => Fn>>

const pick = <T>(xs: readonly T[], i: number): T => xs[i & (xs.length - 1)] as T

const OPS: Record<string, { note: string; arms: Maker; inputs: number; divide?: number }> = {
  'formatNumber(n)': {
    note: 'no options: the locale default formatter',
    inputs: NUMBERS.length,
    arms: {
      pyreon: () => (i) => reactive.formatNumber(pick(NUMBERS, i)),
      'pyreon-core': () => (i) => core.formatNumber(pick(NUMBERS, i), { locale: L }),
      'raw-cached': () => (i) => nf.format(pick(NUMBERS, i)),
      tolocale: () => (i) => pick(NUMBERS, i).toLocaleString(L),
      'raw-percall': () => (i) => new Intl.NumberFormat(L).format(pick(NUMBERS, i)),
      formatjs: () => (i) => intl.formatNumber(pick(NUMBERS, i)),
    },
  },
  'formatNumber(n, hoisted options)': {
    note: '{ maximumFractionDigits: 1 } as a module-level const',
    inputs: NUMBERS.length,
    arms: {
      pyreon: () => (i) => reactive.formatNumber(pick(NUMBERS, i), FRACTION),
      'pyreon-core': () => (i) => core.formatNumber(pick(NUMBERS, i), { ...FRACTION, locale: L }),
      'raw-cached': () => (i) => nfFraction.format(pick(NUMBERS, i)),
      tolocale: () => (i) => pick(NUMBERS, i).toLocaleString(L, FRACTION),
      'raw-percall': () => (i) => new Intl.NumberFormat(L, FRACTION).format(pick(NUMBERS, i)),
      formatjs: () => (i) => intl.formatNumber(pick(NUMBERS, i), FRACTION),
    },
  },
  'formatNumber(n, inline options)': {
    note: 'a fresh { maximumFractionDigits: 1 } literal per call (the structural-key tier)',
    inputs: NUMBERS.length,
    arms: {
      pyreon: () => (i) => reactive.formatNumber(pick(NUMBERS, i), { maximumFractionDigits: 1 }),
      'pyreon-core': () => (i) => core.formatNumber(pick(NUMBERS, i), { locale: L, maximumFractionDigits: 1 }),
      'raw-cached': () => (i) => nfFraction.format(pick(NUMBERS, i)),
      tolocale: () => (i) => pick(NUMBERS, i).toLocaleString(L, { maximumFractionDigits: 1 }),
      'raw-percall': () => (i) => new Intl.NumberFormat(L, { maximumFractionDigits: 1 }).format(pick(NUMBERS, i)),
      formatjs: () => (i) => intl.formatNumber(pick(NUMBERS, i), { maximumFractionDigits: 1 }),
    },
  },
  "formatCurrency(n, 'EUR')": {
    note: 'currency style, en-US',
    inputs: AMOUNTS.length,
    arms: {
      pyreon: () => (i) => reactive.formatCurrency(pick(AMOUNTS, i), 'EUR'),
      'pyreon-core': () => (i) => core.formatCurrency(pick(AMOUNTS, i), 'EUR', { locale: L }),
      'raw-cached': () => (i) => nfEur.format(pick(AMOUNTS, i)),
      tolocale: () => (i) => pick(AMOUNTS, i).toLocaleString(L, { style: 'currency', currency: 'EUR' }),
      'raw-percall': () => (i) => new Intl.NumberFormat(L, { style: 'currency', currency: 'EUR' }).format(pick(AMOUNTS, i)),
      formatjs: () => (i) => intl.formatNumber(pick(AMOUNTS, i), { style: 'currency', currency: 'EUR' }),
    },
  },
  'formatBytes(n)': {
    note: 'narrow unit display, 1 fraction digit. Compared on inputs that all arms print identically; see the footnotes for where pretty-bytes differs',
    inputs: BYTES.length,
    arms: {
      pyreon: () => (i) => reactive.formatBytes(pick(BYTES, i), { unitDisplay: 'narrow' }),
      'pyreon-core': () => (i) => core.formatBytes(pick(BYTES, i), { locale: L, unitDisplay: 'narrow' }),
      'pretty-bytes': () => (i) => prettyBytes(pick(BYTES, i), { maximumFractionDigits: 1, space: false, locale: L }),
    },
  },
  'formatDuration(ms), narrow': {
    note: '"1h 5m 5s" style; pretty-ms with separateMilliseconds',
    inputs: DURATIONS.length,
    arms: {
      pyreon: () => (i) => reactive.formatDuration(pick(DURATIONS, i), { style: 'narrow' }),
      'pyreon-core': () => (i) => core.formatDuration(pick(DURATIONS, i), { locale: L, style: 'narrow' }),
      'pretty-ms': () => (i) => prettyMilliseconds(pick(DURATIONS, i), { separateMilliseconds: true }),
    },
  },
  'formatDuration(ms), long': {
    note: '"1 hour, 5 minutes, 5 seconds" style; humanize-duration with units down to ms',
    inputs: DURATIONS.length,
    arms: {
      pyreon: () => (i) => reactive.formatDuration(pick(DURATIONS, i), { style: 'long' }),
      'pyreon-core': () => (i) => core.formatDuration(pick(DURATIONS, i), { locale: L, style: 'long' }),
      'humanize-duration': () => (i) => humanizeDuration(pick(DURATIONS, i), { units: ['d', 'h', 'm', 's', 'ms'] }),
    },
  },
  'formatDuration(ms), digital': {
    note: '"1:05:05" style; pretty-ms colonNotation. Compared on inputs from one hour to under one day (see the footnote for where pretty-ms prints a different shape)',
    inputs: 8,
    arms: {
      pyreon: () => (i) => reactive.formatDuration(pick(DIGITAL, i), { style: 'digital' }),
      'pyreon-core': () => (i) => core.formatDuration(pick(DIGITAL, i), { locale: L, style: 'digital' }),
      'pretty-ms': () => (i) => prettyMilliseconds(pick(DIGITAL, i), { colonNotation: true }),
    },
  },
  'formatDate(ms, hoisted options)': {
    note: '{ dateStyle: medium, timeZone: UTC }; Pyreon passes locale and zone',
    inputs: INSTANTS.length,
    arms: {
      pyreon: () => (i) => reactive.formatDate(pick(INSTANTS, i), DATE_OPTS),
      'pyreon-core': () => (i) => core.formatDate(pick(INSTANTS, i), DATE_OPTS),
      'raw-cached': () => (i) => dtf.format(pick(INSTANTS, i)),
      tolocale: () => (i) => new Date(pick(INSTANTS, i)).toLocaleDateString(L, DATE_INTL),
      'raw-percall': () => (i) => new Intl.DateTimeFormat(L, DATE_INTL).format(pick(INSTANTS, i)),
      formatjs: () => (i) => intl.formatDate(pick(INSTANTS, i), DATE_INTL),
    },
  },
  'formatDate(ms)': {
    note: 'no options: the active locale and zone (UTC pinned for equal output)',
    inputs: INSTANTS.length,
    arms: {
      pyreon: () => (i) => reactive.formatDate(pick(INSTANTS, i)),
      'pyreon-core': () => (i) => core.formatDate(pick(INSTANTS, i), { locale: L, timeZone: 'UTC' }),
      'raw-cached': () => (i) => dtf.format(pick(INSTANTS, i)),
      tolocale: () => (i) => new Date(pick(INSTANTS, i)).toLocaleDateString(L, DATE_INTL),
      'raw-percall': () => (i) => new Intl.DateTimeFormat(L, DATE_INTL).format(pick(INSTANTS, i)),
      formatjs: () => (i) => intl.formatDate(pick(INSTANTS, i), DATE_INTL),
    },
  },
  "formatDate('2026-11-18')": {
    note: 'an ISO calendar-date string: Pyreon parses it (char codes) and never shifts; the others parse with new Date, which is midnight UTC (equal here only because the zone is UTC)',
    inputs: ISO_DATES.length,
    arms: {
      pyreon: () => (i) => reactive.formatDate(pick(ISO_DATES, i)),
      'pyreon-core': () => (i) => core.formatDate(pick(ISO_DATES, i), { locale: L }),
      'raw-cached': () => (i) => dtf.format(new Date(pick(ISO_DATES, i))),
      tolocale: () => (i) => new Date(pick(ISO_DATES, i)).toLocaleDateString(L, DATE_INTL),
      'raw-percall': () => (i) => new Intl.DateTimeFormat(L, DATE_INTL).format(new Date(pick(ISO_DATES, i))),
      formatjs: () => (i) => intl.formatDate(new Date(pick(ISO_DATES, i)), DATE_INTL),
    },
  },
  "formatRelative(-3, 'day')": {
    note: 'numeric: auto',
    inputs: REL.length,
    arms: {
      pyreon: () => (i) => reactive.formatRelative(pick(REL, i), 'day', RELATIVE_OPTS),
      'pyreon-core': () => (i) => core.formatRelative(pick(REL, i), 'day', { locale: L, numeric: 'auto' }),
      'raw-cached': () => (i) => rtf.format(pick(REL, i), 'day'),
      'raw-percall': () => (i) => new Intl.RelativeTimeFormat(L, { numeric: 'auto' }).format(pick(REL, i), 'day'),
      formatjs: () => (i) => intl.formatRelativeTime(pick(REL, i), 'day', { numeric: 'auto' }),
    },
  },
  'formatList(items)': {
    note: 'conjunction, en-US',
    inputs: LISTS.length,
    arms: {
      pyreon: () => (i) => reactive.formatList(pick(LISTS, i)),
      'pyreon-core': () => (i) => core.formatList(pick(LISTS, i), { locale: L }),
      'raw-cached': () => (i) => lf.format(pick(LISTS, i)),
      'raw-percall': () => (i) => new Intl.ListFormat(L).format(pick(LISTS, i)),
      formatjs: () => (i) => intl.formatList(pick(LISTS, i)),
    },
  },
  "parseNumber('1,234.5')": {
    note: 'Pyreon only: no rival parses by locale rules (Number() cannot read a grouped or localised string)',
    inputs: PARSE_INPUTS.length,
    arms: {
      pyreon: () => (i) => String(reactive.parseNumber(pick(PARSE_INPUTS, i))),
      'pyreon-core': () => (i) => String(core.parseNumber(pick(PARSE_INPUTS, i), { locale: L })),
    },
  },
}

const specFor = (name: string): { note: string; arms: Maker; inputs: number } => OPS[name] as never

/** Arms that have no fair equivalent for an op, with the reason. */
function skipsFor(name: string): Partial<Record<Id, string>> {
  const have = specFor(name).arms
  const reasons: Partial<Record<Id, string>> = {}
  for (const a of ARMS) {
    if (have[a.id]) continue
    reasons[a.id] =
      a.id === 'pretty-bytes' || a.id === 'pretty-ms' || a.id === 'humanize-duration'
        ? 'single-purpose package: no equivalent for this op'
        : 'no equivalent for this op (or it would not be the same work)'
  }

  return reasons
}

const ITERS = 20_000
const ops: Parameters<typeof runRivalBench<Id>>[0]['ops'] = {}

for (const name of Object.keys(OPS)) {
  const spec = specFor(name)
  ops[name] = {
    note: spec.note,
    skip: skipsFor(name),
    iters: ITERS,
    make: (arm) => {
      const build = spec.arms[arm]
      if (!build) throw new Error(`[Pyreon] [format-rivals] no arm ${arm} for ${name}`)
      const f = build()
      let i = 0

      return () => {
        sink = f(i++)
      }
    },
  }
}

/** Where a rival prints something different for the SAME input, computed now. */
function divergences(): string[] {
  const out: string[] = []
  const probes: Array<[string, string, string]> = []
  for (const n of [0, 1, 999, 999999, 999950, 1023, 1024, 1e15, 1.5e15, 12.34, 0.5, 123456, 987654]) {
    probes.push([`bytes ${n}`, reactive.formatBytes(n, { unitDisplay: 'narrow' }), prettyBytes(n, { maximumFractionDigits: 1, space: false, locale: L })])
  }
  for (const ms of [0, 1, 999, 1500, 59999, 60000, 3905000, 86400000 * 400]) {
    probes.push([`ms (narrow vs pretty-ms) ${ms}`, reactive.formatDuration(ms, { style: 'narrow' }), prettyMilliseconds(ms, { separateMilliseconds: true })])
    probes.push([`ms (long vs humanize-duration) ${ms}`, reactive.formatDuration(ms, { style: 'long' }), humanizeDuration(ms, { units: ['d', 'h', 'm', 's', 'ms'] })])
  }
  for (const ms of [65000, 600000, 90061000]) {
    probes.push([`ms (digital vs pretty-ms colonNotation) ${ms}`, reactive.formatDuration(ms, { style: 'digital' }), prettyMilliseconds(ms, { colonNotation: true })])
  }
  for (const [what, mine, theirs] of probes) {
    if (normalise(mine) !== normalise(theirs)) out.push(`${what}: Pyreon ${JSON.stringify(mine)} vs ${JSON.stringify(theirs)}`)
  }

  return out
}

const DIVERGENT = divergences()

await runRivalBench<Id>({
  title: '@pyreon/format vs raw Intl / toLocaleString / @formatjs/intl / pretty-bytes / pretty-ms / humanize-duration',
  file: process.argv[1] as string,
  pyreon: 'pyreon',
  arms: ARMS,
  sink: () => sink,
  unit: 'ns/call',
  ops,
  gate: () => {
    for (const name of Object.keys(OPS)) {
      const spec = specFor(name)
      const fns = Object.entries(spec.arms).map(([id, build]) => [id, (build as () => Fn)()] as const)
      // A no-op arm must fail this gate: compare returned strings, all inputs.
      for (let i = 0; i < spec.inputs; i++) {
        const outputs = fns.map(([id, f]) => [id, normalise(f(i))] as const)
        const want = outputs[0]![1]
        if (want === '' || want === 'undefined') throw new Error(`[Pyreon] [format-rivals] ${name}[${i}]: empty reference output`)
        for (const [id, got] of outputs) {
          if (got !== want) throw new Error(`[Pyreon] [format-rivals] ${name}[${i}]: ${id} printed ${JSON.stringify(got)} but pyreon printed ${JSON.stringify(want)}`)
        }
      }
    }
    // The parse op's arms must agree with a known answer.
    if (reactive.parseNumber('1,234.5') !== 1234.5) throw new Error('[Pyreon] [format-rivals] parseNumber gate')
  },
  footnotes: [
    'Engine: results are for the engine named in the banner. V8 (node) is the server and Chromium engine; run both `bun run bench` and `bun run bench:jsc` and quote the engine with every number.',
    'The Pyreon arm is the reactive entry in client mode (a document global is defined before import so setLocale is live): one extra signal read per call vs the pure entry. `raw Intl, cached instance` is a floor, not a rival: it does no locale or option lookup.',
    DIVERGENT.length === 0
      ? 'Output differences vs pretty-bytes / pretty-ms / humanize-duration on the boundary probes: none found.'
      : `Output differences (computed at run time, excluded from the timed inputs):\n  - ${DIVERGENT.join('\n  - ')}`,
    'This is the author-judge: every arm is hand-configured by the library author. The ops are synthetic (single calls in a loop), not a real app.',
  ],
})
