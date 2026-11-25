/**
 * No raw platform error ever reaches the caller. Every public function is fuzzed with random finite, non-finite,
 * fractional, huge, negative and wrong-typed values and options; the only allowed outcomes are a value of the
 * documented type (a string, an array, a number, `null`, a function) or an error whose message starts with
 * `[Pyreon]` (a programmer error that says how to fix it). A raw `RangeError` / `TypeError` from `Intl` or
 * `Temporal` (`Temporal.Duration properties must be integers`) fails the test with the call that produced it.
 */
import * as core from '../core'
import * as reactive from '../index'
import { resetLocaleState } from '../locale'
import { clearAllTables } from './helpers'

function mulberry32(seed: number): () => number {
  let a = seed

  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NULL_PROTO = Object.create(null) as object

const VALUES: unknown[] = [
  undefined, null, Number.NaN, Infinity, -Infinity, 0, -0, 1, -1, 0.5, 1.5, -1.5, 1234.5678, 1e15, 1e21, 1e308, -1e308,
  Number.MAX_SAFE_INTEGER, Number.MIN_VALUE, 8.64e15, 8.64e15 + 1, 10n, -10n, 10n ** 40n, '', ' ', 'x', 'x'.repeat(500), '2026-11-18',
  '2026-02-30', '14:30', '25:00', '2026-11-18T14:30:00Z', '1,234.5', '١٢٣', '€9.99', true, false, Symbol('s'), () => 1, [], ['a', 1, null],
  [Symbol('i')], { hours: 1.5 }, { hours: 1, minutes: -5 }, { years: 1e308 }, { days: 0.5, milliseconds: 0.25 }, { seconds: Number.NaN },
  { hours: 'x' }, {}, NULL_PROTO, new Date(), new Date(Number.NaN), new Date(8.64e15), new Date(-8.64e15),
]

const STRINGS = ['', 'en', 'en-US', 'cs', 'ar', 'x', 'en_US', 'zz-ZZ-zz-zz', 'UTC', 'Europe/Prague', 'Mars/Phobos', 'EUR', 'EURO', 'kilometer', 'furlong', 'long', 'short', 'narrow', 'digital', 'full', 'medium', 'compact', 'percent', 'and', 'or', 'unit', 'second', 'millisecond', 'day', 'month', 'auto', 'always', 'bogus']

const KEYS = [
  'locale', 'timeZone', 'fallback', 'maximumFractionDigits', 'minimumFractionDigits', 'maximumSignificantDigits', 'minimumIntegerDigits',
  'notation', 'style', 'currency', 'currencyDisplay', 'currencySign', 'unit', 'unitDisplay', 'binary', 'compactDisplay', 'signDisplay',
  'useGrouping', 'dateStyle', 'timeStyle', 'hour12', 'hourCycle', 'timeZoneName', 'numeric', 'type', 'largest', 'smallest',
  'fractionalDigits', 'base', 'year', 'month', 'day', 'weekday', 'era', 'hour', 'minute', 'second', 'fractionalSecondDigits', 'calendar',
  'numberingSystem', 'roundingMode', 'extends', 'kind',
]

class Fuzzer {
  constructor(private readonly rnd: () => number) {}

  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.rnd() * xs.length)] as T
  }

  value(): unknown {
    return this.pick(VALUES)
  }

  string(): unknown {
    return this.rnd() < 0.7 ? this.pick(STRINGS) : this.value()
  }

  options(): unknown {
    const r = this.rnd()
    if (r < 0.15) return undefined
    if (r < 0.25) return this.pick(STRINGS)
    if (r < 0.3) return this.value()
    const bag: Record<string, unknown> = {}
    const n = 1 + Math.floor(this.rnd() * 4)
    for (let i = 0; i < n; i++) bag[this.pick(KEYS)] = this.rnd() < 0.6 ? this.pick(STRINGS) : this.value()

    return bag
  }
}

const describe_ = (v: unknown): string => {
  try {
    return typeof v === 'symbol' || typeof v === 'function' ? String(v) : typeof v === 'bigint' ? `${v}n` : JSON.stringify(v) ?? String(v)
  } catch {
    return Object.prototype.toString.call(v)
  }
}

let failures: string[] = []

function attempt(name: string, args: unknown[], fn: () => unknown): void {
  try {
    const r = fn()
    const ok = r === null || typeof r === 'string' || typeof r === 'number' || typeof r === 'function' || typeof r === 'object'
    if (!ok) failures.push(`${name}(${args.map(describe_).join(', ')}) returned ${describe_(r)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.startsWith('[Pyreon]')) failures.push(`${name}(${args.map(describe_).join(', ')}) threw a raw error: ${message.slice(0, 100)}`)
  }
}

const ENTRIES = [['core', core], ['reactive', reactive]] as const
const ITERATIONS = 1500

beforeEach(() => {
  failures = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  resetLocaleState()
  clearAllTables()
  vi.restoreAllMocks()
})

describe.each(ENTRIES)('fuzz: only strings, fallbacks or [Pyreon] errors (%s)', (_name, f) => {
  it('one-off formatters', () => {
    const z = new Fuzzer(mulberry32(1234))
    for (let i = 0; i < ITERATIONS; i++) {
      const [v, w, s, o] = [z.value(), z.value(), z.string(), z.options()]
      const call = (name: string, fn: (...a: never[]) => unknown, ...args: unknown[]) => attempt(name, args, () => fn(...(args as never[])))
      call('formatNumber', f.formatNumber as never, v, o)
      call('formatCurrency', f.formatCurrency as never, v, s, o)
      call('formatPercent', f.formatPercent as never, v, o)
      call('formatCompact', f.formatCompact as never, v, o)
      call('formatUnit', f.formatUnit as never, v, s, o)
      call('formatBytes', f.formatBytes as never, v, o)
      call('formatNumberRange', f.formatNumberRange as never, v, w, o)
      call('formatNumberToParts', f.formatNumberToParts as never, v, o)
      call('formatDuration', f.formatDuration as never, v, o)
      call('formatList', f.formatList as never, v, o)
      call('formatDate', f.formatDate as never, v, o)
      call('formatTime', f.formatTime as never, v, o)
      call('formatDateTime', f.formatDateTime as never, v, o)
      call('formatDateToParts', f.formatDateToParts as never, v, o)
      call('formatDateRange', f.formatDateRange as never, v, w, o)
      call('formatRelative', f.formatRelative as never, v, s, o)
      call('formatRelativeTo', f.formatRelativeTo as never, v, w, o)
      call('parseNumber', f.parseNumber as never, v, o)
      call('parseDate', f.parseDate as never, v, o)
      call('parseCurrency', f.parseCurrency as never, v, s, o)
    }
    expect(failures).toEqual([])
  })

  it('formatter factories and their methods', () => {
    const z = new Fuzzer(mulberry32(99))
    for (let i = 0; i < ITERATIONS; i++) {
      const [v, w, s, o] = [z.value(), z.value(), z.string(), z.options()]
      const made: Array<[string, () => unknown]> = [
        ['numberFormatter', () => f.numberFormatter(o as never)],
        ['currencyFormatter', () => f.currencyFormatter(s as never, o as never)],
        ['percentFormatter', () => f.percentFormatter(o as never)],
        ['compactFormatter', () => f.compactFormatter(o as never)],
        ['unitFormatter', () => f.unitFormatter(s as never, o as never)],
        ['bytesFormatter', () => f.bytesFormatter(o as never)],
        ['durationFormatter', () => f.durationFormatter(o as never)],
        ['listFormatter', () => f.listFormatter(o as never)],
        ['dateFormatter', () => f.dateFormatter(o as never)],
        ['timeFormatter', () => f.timeFormatter(o as never)],
        ['dateTimeFormatter', () => f.dateTimeFormatter(o as never)],
        ['relativeFormatter', () => f.relativeFormatter(o as never)],
      ]
      for (const [name, make] of made) {
        attempt(name, [s, o], make)
        let formatter: unknown
        try {
          formatter = make()
        } catch {
          continue
        }
        const fm = formatter as { (v: unknown): unknown; parts?: (v: unknown) => unknown; range?: (a: unknown, b: unknown) => unknown; with: (o: unknown) => unknown; from: (m: unknown) => unknown; fallback: (t: unknown) => unknown }
        attempt(`${name}()`, [v], () => fm(v))
        if (fm.parts) attempt(`${name}.parts`, [v], () => fm.parts?.(v))
        if (fm.range) attempt(`${name}.range`, [v, w], () => fm.range?.(v, w))
        attempt(`${name}.with`, [z.options()], () => (fm.with(z.options()) as (v: unknown) => unknown)(v))
        attempt(`${name}.fallback`, [s], () => (fm.fallback(s) as (v: unknown) => unknown)(v))
        attempt(`${name}.from`, [], () => (fm.from((x: unknown) => x) as (v: unknown) => unknown)(w))
      }
    }
    expect(failures).toEqual([])
  })

  it('defineFormats and createFormatter', () => {
    const z = new Fuzzer(mulberry32(7))
    for (let i = 0; i < ITERATIONS; i++) {
      const o = z.options()
      attempt('defineFormats', [o], () => f.defineFormats(o as never))
      attempt('defineFormats(spec)', [o], () => {
        const defined = f.defineFormats({ a: { kind: z.pick(['number', 'currency', 'unit', 'date', 'list', 'relative', 'bytes', 'duration', 'bogus']), ...(o as object) } } as never)
        const a = (defined as Record<string, (v: unknown) => unknown>).a

        return a?.(z.value())
      })
      attempt('createFormatter', [o], () => f.createFormatter(o as never))
      attempt('createFormatter()', [o], () => {
        const bound = f.createFormatter(typeof o === 'object' ? (o as never) : undefined)

        return bound.number(z.value() as never, z.options() as never) + bound.date(z.value() as never, z.options() as never) + String(bound.parseDate(z.value() as never))
      })
    }
    expect(failures).toEqual([])
  })
})
