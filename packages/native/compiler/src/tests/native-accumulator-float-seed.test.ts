// Summing a column in a loop — the most ordinary shape there is — did not
// compile on EITHER target.
//
//   const total = () => {
//     let acc = 0
//     for (const it of items()) acc += it.price   // price is Double
//     return acc
//   }
//
// `var acc = 0` is Int; `acc += <Double>` does not typecheck. And there was NO
// way to write it correctly: `let acc = 0.0` is `Number.isInteger`, so it reads
// as an integer literal too. The only workaround was to abandon the loop and
// rewrite it as `reduce`.
//
// The seed-flip idea was not new — `widenFloatSignals` does exactly this for a
// `signal(0)` written a Double, and `refineReduceSeedFloats` for a `reduce`
// seed. The plain imperative local was the member of that family nobody had
// written yet.
//
// Two halves were needed, and the first is easy to miss: marking the literal
// float makes the emitters print `0.0`, but `inferType` ignored the marker and
// still typed the expression from the VALUE (`0`, an integer) — so the digits
// changed and the emitted `-> Int` return type did not. Honouring the marker is
// what makes the claim reach the TYPES.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (field: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
function App() {
  const items = signal([{ id: 1, price: 2.5 }, { id: 2, price: 1.5 }])
  const total = () => {
    let acc = 0
    for (const it of items()) acc += it.${field}
    return acc
  }
  return (<Stack><Text>{String(total())}</Text></Stack>)
}`

const lines = (target: 'swift' | 'kotlin', field: string) =>
  transform(app(field), { target }).code.split('\n')
const find = (target: 'swift' | 'kotlin', field: string, needle: string) =>
  lines(target, field).find((l) => l.includes(needle))?.trim() ?? ''

describe('an integer-seeded accumulator widens when written a Double', () => {
  it('Swift: the seed is 0.0 AND the return type is Double', () => {
    expect(find('swift', 'price', 'var acc')).toContain('0.0')
    // The half that the literal marker alone does not buy: the emitted TYPE.
    expect(find('swift', 'price', 'func total')).toContain('-> Double')
  })

  it('Kotlin: the seed is 0.0 AND the return type is Double', () => {
    expect(find('kotlin', 'price', 'var acc')).toContain('0.0')
    expect(find('kotlin', 'price', 'fun total')).toContain(': Double')
  })

  // Additive, in both directions — an integer column must be untouched. This is
  // what keeps the pass from widening every accumulator in every app.
  it('an INT accumulation stays Int on both targets', () => {
    expect(find('swift', 'id', 'var acc')).toBe('var acc = 0')
    expect(find('swift', 'id', 'func total')).toContain('-> Int')
    expect(find('kotlin', 'id', 'var acc')).toBe('var acc = 0')
    expect(find('kotlin', 'id', 'fun total')).toContain(': Int')
  })
})

describe('the accumulator loop survives the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift: type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(app('price'), { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: compiles on kotlinc', () => {
    const r = validateKotlin(transform(app('price'), { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
