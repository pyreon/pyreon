import { describe, expect, it } from 'vitest'
import * as api from '../core'
import * as fp from '../fp'
import { int, pick, rng } from './rng'

/**
 * The fuzz rule: for any input, a function returns a correct value, returns its documented `null` / `false`, or throws a
 * `[Pyreon] <function>:` TypeError or RangeError that names the function and says how to fix the input. Nothing else may
 * escape: no TypeError from reading `undefined`, no `RangeError: Invalid time value`, no hang.
 */
const throwing = {
  get start(): never {
    throw new Error('getter boom')
  },
}

const hostile = new Proxy({}, { get: () => { throw new Error('proxy boom') }, has: () => { throw new Error('proxy boom') }, ownKeys: () => { throw new Error('proxy boom') } })
const circular: Record<string, unknown> = { every: 'day' }

circular.start = circular

const POOL: unknown[] = [
  undefined, null, NaN, Infinity, -Infinity, -0, 0, 1, -1, 1.5, 2 ** 53, 1e308, 7n, true, false, '', ' ', 'x', '2026', '2026-11', '2026-02-30', '2026-13-01', '2026-11-18T25:00', '2026-11-18T09:00Z', '2026-11-18 09:00',
  '0000-01-01', '9999-12-31T23:59', '10000-01-01', 'FREQ=DAILY', 'x'.repeat(5000), Symbol('s'), [], [1], ['2026-11-18'], new Array(3), {}, { start: '2026-11-18' }, { start: '2026-11-18', end: '2026-11-17' },
  { every: 'day' }, { every: 'day', start: 'nope' }, { every: 'decade', start: '2026-11-18' }, { every: 'day', start: '2026-11-18', interval: -1 }, { every: 'day', start: '2026-11-18', on: null },
  { every: 'day', start: '2026-11-18', on: { weekdays: 'MO' } }, { every: 'day', start: '2026-11-18', on: { hours: [24] } }, { every: 'month', start: '2026-11-18', on: { monthDays: [0] } },
  { every: 'day', start: '2026-11-18', timeZone: 'Nowhere/Land' }, { every: 'day', start: '2026-11-18', except: 'x' }, { hours: 'x' }, { weekend: 'x' }, { hours: { 1: 'x' } },
  throwing, hostile, circular, () => 1, new Date(NaN), new Date(0), Object.freeze({ every: 'day', start: '2026-11-18' }), Object.create(null), new Map(), { toString: () => { throw new Error('toString boom') } },
  { hours: -5 }, { minutes: 1e300 }, { days: 1 },
]

const day = { every: 'day', start: '2026-11-18T09:00', timeZone: 'Europe/Prague' } as const
const office = { hours: { 3: [{ from: '09:00', to: '17:00' }] } } as never
const interval = { start: '2026-11-18T09:00', end: '2026-11-18T10:00' } as never
const event = { id: 'a', start: '2026-11-18T09:00', end: '2026-11-18T10:00' } as never
const slotOptions = { within: interval, busy: [], duration: { minutes: 30 } }

/** name, function, valid arguments, whether the result is a generator to drain. */
const CALLS: [string, (...a: never[]) => unknown, unknown[]][] = [
  ['occurrences', api.occurrences as never, [day, { limit: 3 }]],
  ['occurrencesBetween', api.occurrencesBetween as never, [day, '2026-11-18', '2026-11-20']],
  ['nextOccurrence', api.nextOccurrence as never, [day, '2026-11-18']],
  ['previousOccurrence', api.previousOccurrence as never, [day, '2026-11-20']],
  ['occursOn', api.occursOn as never, [day, '2026-11-18']],
  ['toInstants', api.toInstants as never, [day, { limit: 2 }, { disambiguation: 'compatible' }]],
  ['parseRRule', api.parseRRule as never, ['FREQ=DAILY', { start: '2026-11-18' }]],
  ['tryParseRRule', api.tryParseRRule as never, ['FREQ=DAILY', { start: '2026-11-18' }]],
  ['toRRule', api.toRRule as never, [day]],
  ['describeRule', api.describeRule as never, [day, { locale: 'en' }]],
  ['isBusinessDay', api.isBusinessDay as never, ['2026-11-18', office]],
  ['addBusinessDays', api.addBusinessDays as never, ['2026-11-18', 2, office]],
  ['businessDaysBetween', api.businessDaysBetween as never, ['2026-11-18', '2026-11-25', office]],
  ['nextBusinessDay', api.nextBusinessDay as never, ['2026-11-18', office]],
  ['previousBusinessDay', api.previousBusinessDay as never, ['2026-11-18', office]],
  ['addBusinessTime', api.addBusinessTime as never, ['2026-11-18T10:00', { hours: 1 }, office]],
  ['businessTimeBetween', api.businessTimeBetween as never, ['2026-11-18T10:00', '2026-11-18T12:00', office]],
  ['isOpen', api.isOpen as never, ['2026-11-18T10:00', office]],
  ['nextOpening', api.nextOpening as never, ['2026-11-18T10:00', office]],
  ['nextClosing', api.nextClosing as never, ['2026-11-18T10:00', office]],
  ['overlaps', api.overlaps as never, [interval, interval]],
  ['intersection', api.intersection as never, [interval, interval]],
  ['mergeIntervals', api.mergeIntervals as never, [[interval]]],
  ['subtractIntervals', api.subtractIntervals as never, [[interval], [interval]]],
  ['freeSlots', api.freeSlots as never, [slotOptions]],
  ['expandEvents', api.expandEvents as never, [[event], interval]],
]

const drain = (value: unknown): void => {
  if (value !== null && typeof value === 'object' && typeof (value as Generator).next === 'function') {
    for (let i = 0; i < 5; i++) if ((value as Generator).next().done === true) break
  }
}

function attempt(name: string, fn: (...a: never[]) => unknown, args: unknown[]): void {
  try {
    drain(fn(...(args as never[])))
  } catch (error) {
    const e = error as Error

    expect(e instanceof TypeError || e instanceof RangeError, `${name}(${args.map((a) => String(typeof a)).join(', ')}) threw ${e?.name}: ${e?.message}`).toBe(true)
    expect(e.message, `${name} threw ${e.message}`).toMatch(new RegExp(`^\\[Pyreon\\] ${name}: `))
  }
}

describe('fuzz: every export, every argument position, hostile values', () => {
  for (const [name, fn, valid] of CALLS) {
    it(`${name}: a bad value in each position is a [Pyreon] error or a documented result`, () => {
      for (let i = 0; i < valid.length; i++) {
        for (const bad of POOL) {
          const args = valid.slice()

          args[i] = bad
          attempt(name, fn, args)
        }
      }
      attempt(name, fn, [])
      attempt(name, fn, [undefined, undefined, undefined])
    })

    it(`${name}: random combinations of hostile values`, () => {
      const r = rng(name.length * 977)

      for (let k = 0; k < 400; k++) attempt(name, fn, valid.map((v) => (r() < 0.5 ? pick(r, POOL) : v)))
    })
  }

  it('the value-last forms fail the same way', () => {
    const forms: [string, () => unknown][] = [
      ['occurrencesBetween', () => fp.occurrencesBetween('x' as never, 'y' as never)(day)],
      ['nextOccurrence', () => fp.nextOccurrence(null as never)(day)],
      ['occursOn', () => fp.occursOn(5 as never)(day)],
      ['describeRule', () => fp.describeRule()(null as never)],
      ['addBusinessDays', () => fp.addBusinessDays(NaN, office)('2026-11-18')],
      ['isBusinessDay', () => fp.isBusinessDay(null as never)('2026-11-18')],
      ['overlaps', () => fp.overlaps(null as never)(interval)],
      ['expandEvents', () => fp.expandEvents(interval)(null as never)],
    ]

    for (const [name, f] of forms) {
      try {
        f()
        throw new Error(`${name} should have thrown`)
      } catch (error) {
        expect((error as Error).message).toMatch(/^\[Pyreon\] \w+: /)
      }
    }
  })

  it('random rules never escape the rule: only correct values or [Pyreon] errors, and always in bounded time', () => {
    const r = rng(2026)
    const every = ['day', 'week', 'month', 'year', 'hour', 'minute', 'decade', undefined]
    const nums = [0, 1, 2, 5, 31, 53, 60, -1, -31, -366, 367, 1.5, NaN]
    const t = performance.now()
    let ok = 0

    for (let i = 0; i < 1500; i++) {
      const list = (): number[] => Array.from({ length: int(r, 0, 3) }, () => pick(r, nums))
      const on = r() < 0.7 ? { weekdays: r() < 0.5 ? list() : undefined, monthDays: r() < 0.5 ? list() : undefined, months: r() < 0.3 ? list() : undefined, yearDays: r() < 0.2 ? list() : undefined, weeks: r() < 0.2 ? list() : undefined, hours: r() < 0.3 ? list() : undefined, minutes: r() < 0.3 ? list() : undefined, position: r() < 0.3 ? list() : undefined } : undefined
      const rule = { every: pick(r, every), start: pick(r, ['2026-11-18', '2026-11-18T09:00', '2024-02-29', 'bad']), interval: pick(r, [undefined, 1, 2, 0, -3, 1e9]), count: pick(r, [undefined, undefined, 1, 5, 0]), on }

      try {
        const out = [...api.occurrences(rule as never, { limit: 5 })]

        expect(Array.isArray(out)).toBe(true)
        ok++
      } catch (error) {
        expect((error as Error).message).toMatch(/^\[Pyreon\] occurrences: /)
      }
    }
    expect(ok).toBeGreaterThan(40)
    expect(performance.now() - t).toBeLessThan(20_000)
  })

  it('huge ranges with a limit return at once', () => {
    const t = performance.now()

    expect([...api.occurrences({ every: 'minute', start: '0001-01-01T00:00' }, { from: '9990-01-01', limit: 3 })]).toHaveLength(3)
    expect(api.nextOccurrence({ every: 'year', start: '0001-01-01' }, '9998-12-31')).toBe('9999-01-01')
    expect(api.nextOccurrence({ every: 'year', start: '0001-01-01' }, '9999-12-31')).toBeNull()
    expect(api.previousOccurrence({ every: 'day', start: '9999-12-31' }, '9999-12-31')).toBeNull()
    expect(performance.now() - t).toBeLessThan(3000)
  })
})
