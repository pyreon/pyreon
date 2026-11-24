import * as decimal from '../decimal'
import * as fp from '../fp'
import * as moneyApi from '../index'
import { pick, rng, int } from './rng'

/**
 * The one rule, tested: bad data to any export gives the correct value, a guard's `false`, or a TypeError / RangeError whose
 * message starts with `[Pyreon] <function>:`. No raw `SyntaxError: Cannot convert ... to a BigInt`, no `RangeError: Maximum
 * BigInt size exceeded`, no bare `TypeError`.
 */
const NULL_PROTO = Object.create(null) as object
const THROWING = { toString() { throw new Error('boom') }, valueOf() { throw new Error('boom') } }
const E = { amount: '9.99', currency: 'EUR' }

const POOL: unknown[] = [
  undefined, null, true, 0, -0, 1, -1, 1.5, 0.1, 7, 100, 1e15, 1e21, 1e308, -1e308, 1e-7, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
  0n, 5n, -7n, 10n ** 40n, Symbol('s'), '', ' ', 'x', '0', '-0', '-0.00', '9.99', '9.995', '+5', '.5', '5.', '1e3', '1e-3', '1e999999999', '1e9999999999999', '5,50', ' 5', '0x10', 'NaN', 'Infinity',
  '9'.repeat(4096), '9'.repeat(5000), '1.' + '0'.repeat(5000), 'EUR', 'USD', 'JPY', 'KWD', 'eur', 'XXZ', 'halfEven', 'ceil', 'nearest', '0.05', '1.21',
  {}, [], [1, 1], [0, 0], [-1, 2], [NaN], NULL_PROTO, THROWING, () => 0,
  E, { amount: '1.00', currency: 'EUR' }, { amount: '.50', currency: 'EUR' }, { amount: '-0.00', currency: 'EUR' }, { amount: '5', currency: 'JPY' }, { amount: '5.0', currency: 'JPY' }, { amount: 9.99, currency: 'EUR' },
  { amount: '1.00', currency: 'USD' }, { amount: '1.00', currency: 'EUR', extra: 1 }, { amount: THROWING, currency: 'EUR' }, { amount: '1.00' },
  { rounding: 'halfEven' }, { rounding: 'x' }, { digits: 1 }, { digits: -1 }, { digits: 1e9 }, { increment: '0.05' }, { increment: 0 }, { mode: 'floor' }, { scale: 1e9 }, { scale: 4 },
]

function outcome(call: () => unknown): 'ok' | string {
  try {
    call()

    return 'ok'
  } catch (error) {
    const message = error instanceof Error ? error.message : ''

    if ((error instanceof TypeError || error instanceof RangeError) && /^\[Pyreon\] [A-Za-z]+/.test(message)) return 'ok'

    return `${error instanceof Error ? error.constructor.name : typeof error}: ${message || String(error)}`
  }
}

function describeArg(a: unknown): string {
  if (a === THROWING) return 'THROWING'
  if (a === NULL_PROTO) return 'NULLPROTO'
  if (typeof a === 'symbol') return 'Symbol'
  if (typeof a === 'bigint') return `${a.toString().slice(0, 20)}n`
  if (typeof a === 'string') return JSON.stringify(a.length > 30 ? `${a.slice(0, 30)}...(${a.length})` : a)
  if (typeof a === 'number') return String(a)

  try {
    return JSON.stringify(a) ?? String(a)
  } catch {
    return typeof a
  }
}

describe('fuzz: no raw platform error reaches the caller', () => {
  const r = rng(808)
  const argsFor = (): unknown[] => Array.from({ length: int(r, 0, 4) }, () => pick(r, POOL))
  const targets = [
    ...Object.entries(moneyApi).filter(([, f]) => typeof f === 'function').map(([n, f]) => [`money.${n}`, f] as const),
    ...Object.entries(decimal).filter(([, f]) => typeof f === 'function').map(([n, f]) => [`decimal.${n}`, f] as const),
  ]

  it.each(targets)('%s', (name, fn) => {
    const failures = new Set<string>()

    for (let i = 0; i < 1500; i++) {
      const args = argsFor()
      const result = outcome(() => (fn as (...a: unknown[]) => unknown)(...args))

      if (result !== 'ok') failures.add(`${name}(${args.map(describeArg).join(', ')}) -> ${result}`)
      if (failures.size > 3) break
    }
    expect([...failures]).toEqual([])
  })

  it.each(Object.entries(fp).filter(([, f]) => typeof f === 'function'))('fp.%s (the factory and the function it returns)', (name, fn) => {
    const failures = new Set<string>()

    for (let i = 0; i < 1200; i++) {
      let built: unknown

      try {
        built = (fn as (...a: unknown[]) => unknown)(...argsFor())
      } catch (error) {
        const m = outcome(() => {
          throw error
        })

        if (m !== 'ok') failures.add(`${name} factory -> ${m}`)
      }
      if (typeof built === 'function') {
        const result = outcome(() => (built as (...a: unknown[]) => unknown)(...argsFor()))

        if (result !== 'ok') failures.add(`${name}(...)(...) -> ${result}`)
      }
      if (failures.size > 3) break
    }
    expect([...failures]).toEqual([])
  })

  it('guards never throw', () => {
    for (let i = 0; i < 3000; i++) {
      const v = pick(r, POOL)

      expect(typeof moneyApi.isMoney(v)).toBe('boolean')
      expect(typeof moneyApi.isCurrency(v as string)).toBe('boolean')
      expect(typeof decimal.isDecimal(v)).toBe('boolean')
    }
  })
})
