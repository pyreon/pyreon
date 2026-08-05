// Annotating your data types made the app uncompilable on both targets.
//
//   const items = signal<{ id: number; price: number }[]>([{ id: 1, price: 2.5 }])
//
// synthesised a struct with `price: Int` and then initialised it with `2.5`.
// Invalid Swift AND Kotlin, and everything downstream inherited it: a `reduce`
// over the column typed Int against a Double accumulation, an imperative
// `let acc = 0` loop the same. DELETING the annotation fixed all of it — the
// wrong incentive to give an author, since the annotation is exactly where a
// compiler should be most confident.
//
// There was no way to spell it correctly either. `0.0` is `Number.isInteger`,
// so it reads as an integer literal; the only workaround was to drop the type.
//
// Root cause, and it was the SAME assumption in three places: an inline object
// type produces NO `StructIR` at parse time (the emitters synthesise the struct
// later), and all three refinement passes resolved element types through a
// NAMED struct only —
//
//   1. `refineStructFloatsFromInitializers` — `structNameOfType` returns
//      undefined for an inline object, so the field was never refined.
//   2. `refineReduceSeedFloats` — bailed outright on `structs.length === 0`.
//   3. ...and, past that bail, resolved the element via `typeRef` only.
//
// A TS `number` carries no int/float distinction, so Int is the right DEFAULT
// when there is no other evidence. It must not override evidence, and the
// initializer beside it is evidence.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (decl: string, body = '') => `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
function App() {
  ${decl}
  ${body}
  return (<Stack><Text>{String(total)}</Text></Stack>)
}`

const ANNOTATED = `const items = signal<{ id: number; price: number }[]>([{ id: 1, price: 2.5 }])`
const BARE = `const items = signal([{ id: 1, price: 2.5 }])`
const TOTAL = `const total = computed(() => items().reduce((s, i) => s + i.price, 0))`

const line = (target: 'swift' | 'kotlin', src: string, needle: string) =>
  transform(src, { target }).code.split('\n').find((l) => l.includes(needle)) ?? ''

describe('an inline object generic keeps its fractional evidence', () => {
  it('Swift: the field is Double, not Int holding 2.5', () => {
    expect(line('swift', app(ANNOTATED, TOTAL), 'price')).toContain('Double')
  })

  it('Kotlin: the field is Double', () => {
    expect(line('kotlin', app(ANNOTATED, TOTAL), 'price')).toContain('Double')
  })

  // The whole point: annotating must not change the emitted types. Before the
  // fix these two disagreed, and the annotated one was the broken half.
  it('the ANNOTATED and BARE forms agree', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const a = transform(app(ANNOTATED, TOTAL), { target }).code
      const b = transform(app(BARE, TOTAL), { target }).code
      expect(a).toBe(b)
    }
  })

  // A reduce over the now-Double column needs a Double SEED. Kotlin binds
  // `fold(0, …)` strictly; Swift would coerce the literal, which is why this
  // regressed on exactly one target when the refinement passes ran in the
  // wrong order.
  it('the reduce seed flips to 0.0 on both targets', () => {
    expect(line('swift', app(ANNOTATED, TOTAL), 'reduce(')).toContain('reduce(0.0')
    expect(line('kotlin', app(ANNOTATED, TOTAL), 'fold(')).toContain('fold(0.0')
  })

  // An all-integer column must stay Int — the passes are additive, and Int is
  // the ergonomic default for counts/ids/indices.
  it('an all-integer column is untouched', () => {
    const ints = `const items = signal<{ id: number; qty: number }[]>([{ id: 1, qty: 2 }])`
    const sum = `const total = computed(() => items().reduce((s, i) => s + i.qty, 0))`
    expect(line('swift', app(ints, sum), 'var qty')).toContain('Int')
    expect(line('swift', app(ints, sum), 'reduce(')).toContain('reduce(0,')
  })

  // Mixed literals in a Double column: the integer ones must render `3.0`.
  // Kotlin rejects a bare Int element against a Double field; Swift coerces,
  // so this is another one-target hazard.
  it('integer literals in a Double column emit as Double', () => {
    const mixed = `const items = signal<{ price: number }[]>([{ price: 2.5 }, { price: 3 }])`
    expect(line('kotlin', app(mixed, TOTAL), 'listOf(')).toContain('3.0')
  })
})

describe('the annotated form survives the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift: type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(app(ANNOTATED, TOTAL), { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: compiles on kotlinc', () => {
    const r = validateKotlin(transform(app(ANNOTATED, TOTAL), { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
