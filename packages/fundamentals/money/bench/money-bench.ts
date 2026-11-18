/**
 * @pyreon/money vs dinero.js v2, currency.js and big.js, each used idiomatically.
 *
 * Run: `bun run bench` (from packages/fundamentals/money), ONLY on a quiet machine (1-minute load below ~5), strictly one
 * bench at a time. The shared harness (`scripts/bench/rivals-harness.ts`) runs one fresh process per (op x arm x round),
 * checks every arm's result before any timing, and refuses to relaunch itself recursively. No performance claim is made from
 * this file until it has been run under those conditions.
 *
 * What each arm does (the same four operations, the same results, compared as strings):
 *  - Pyreon: `money`, `add`, `multiply`, `allocate` on `{ amount, currency }`.
 *  - dinero.js v2: `dinero({ amount, currency })` in minor units, `add`, `multiply` (scaled factor), `allocate`; the
 *    snapshot is read back to a decimal string. https://v2.dinerojs.com
 *  - currency.js: `currency(x)`, `.add`, `.multiply`, `.distribute` (its own allocation). https://currency.js.org
 *  - big.js: arbitrary-precision decimals: `Big`, `.plus`, `.times`, rounded with `.round(2, Big.roundHalfUp)`; it has no
 *    allocation, so the arm writes the idiomatic floor-and-remainder loop.
 */
import Big from 'big.js'
import currency from 'currency.js'
import { add as dAdd, allocate as dAllocate, dinero, multiply as dMultiply, toSnapshot } from 'dinero.js'
import { runRivalBench, type Arm } from '../../../../scripts/bench/rivals-harness'
import { add, allocate, money, multiply } from '../src/index'

type Id = 'pyreon' | 'dinero' | 'currencyjs' | 'bigjs'

const ARMS: readonly Arm<Id>[] = [
  { id: 'pyreon', label: 'Pyreon' },
  { id: 'dinero', label: 'dinero.js v2', pkg: 'dinero.js' },
  { id: 'currencyjs', label: 'currency.js', pkg: 'currency.js' },
  { id: 'bigjs', label: 'big.js', pkg: 'big.js' },
]

const EUR = { code: 'EUR', base: 10n as unknown as number, exponent: 2 }
let sink = 0

const dec = (minor: number): string => (minor / 100).toFixed(2)

interface Api {
  addTwo: () => string
  times3: () => string
  vat: () => string
  split3: () => string[]
}

function build(id: Id): Api {
  switch (id) {
    case 'pyreon': {
      const a = money('19.99', 'EUR')
      const b = money('0.01', 'EUR')
      const hundred = money('100.00', 'EUR')

      return {
        addTwo: () => add(a, b).amount,
        times3: () => multiply(a, 3).amount,
        vat: () => multiply(a, '1.21').amount,
        split3: () => allocate(hundred, [1, 1, 1]).map((p) => p.amount),
      }
    }
    case 'dinero': {
      const a = dinero({ amount: 1999, currency: EUR as never })
      const b = dinero({ amount: 1, currency: EUR as never })
      const hundred = dinero({ amount: 10000, currency: EUR as never })

      return {
        addTwo: () => dec(toSnapshot(dAdd(a, b)).amount),
        times3: () => dec(toSnapshot(dMultiply(a, 3)).amount),
        vat: () => dec(toSnapshot(dMultiply(a, { amount: 121, scale: 2 })).amount),
        split3: () => dAllocate(hundred, [1, 1, 1]).map((p) => dec(toSnapshot(p).amount)),
      }
    }
    case 'currencyjs':
      return {
        addTwo: () => currency('19.99').add('0.01').format({ symbol: '', separator: '' }),
        times3: () => currency('19.99').multiply(3).format({ symbol: '', separator: '' }),
        vat: () => currency('19.99').multiply('1.21').format({ symbol: '', separator: '' }),
        split3: () => currency('100.00').distribute(3).map((c) => c.format({ symbol: '', separator: '' })),
      }
    case 'bigjs':
      return {
        addTwo: () => new Big('19.99').plus('0.01').toFixed(2),
        times3: () => new Big('19.99').times(3).toFixed(2),
        vat: () => new Big('19.99').times('1.21').round(2, Big.roundHalfUp).toFixed(2),
        split3: () => {
          const total = new Big('100.00').times(100).toNumber()
          const base = Math.floor(total / 3)
          let rest = total - base * 3

          return [0, 1, 2].map(() => dec(base + (rest-- > 0 ? 1 : 0)))
        },
      }
  }
}

const EXPECTED = { addTwo: '20.00', times3: '59.97', vat: '24.19', split3: ['33.34', '33.33', '33.33'] }

await runRivalBench<Id>({
  title: '@pyreon/money vs dinero.js v2, currency.js and big.js',
  file: import.meta.path,
  pyreon: 'pyreon',
  arms: ARMS,
  sink: () => sink,
  gate: () => {
    for (const arm of ARMS) {
      const api = build(arm.id)
      const got = { addTwo: api.addTwo(), times3: api.times3(), vat: api.vat(), split3: api.split3() }

      if (JSON.stringify(got) !== JSON.stringify(EXPECTED)) throw new Error(`[Pyreon] bench correctness: ${arm.label} gave ${JSON.stringify(got)}, expected ${JSON.stringify(EXPECTED)}`)
    }
  },
  footnotes: ['Every arm returns the same strings (gate above). Inputs are built once outside the timed region, as each library recommends (reuse instances).'],
  ops: {
    'add two amounts': { make: (id) => { const a = build(id); return () => { sink += a.addTwo().length } } },
    'multiply by 3': { make: (id) => { const a = build(id); return () => { sink += a.times3().length } } },
    'multiply by 1.21 (rounded)': { make: (id) => { const a = build(id); return () => { sink += a.vat().length } } },
    'allocate 100.00 three ways': { make: (id) => { const a = build(id); return () => { sink += a.split3().length } } },
  },
})
