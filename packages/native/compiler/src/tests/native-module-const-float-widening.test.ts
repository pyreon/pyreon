// The float-widening passes could not see a FILE-SCOPE binding.
//
// JS has one number type and PMTC splits Int / Double, so a family of passes
// turns fractional EVIDENCE into a Double declaration: `widenFloatSignals`
// (a signal written a Double), the struct / inline-object field refinements, the
// `reduce` seed refinement, the explicit-generic refinement, helper-return
// inference. #3741 taught the EMITTERS to type file-scope consts — but every one
// of those passes built its own inference context with no `moduleConsts`, so
// `const RATE = 0.5` one line above the component was never evidence. The same
// source compiled with RATE inside the component and failed with it outside,
// on both targets. `inferReturnType` had the same hole for a different reason:
// its hand-written context copy predated `moduleConsts`/`helperReturns`/`props`
// and dropped all three.
//
// Two adjacent gaps the probe surfaced are fixed with it, because each shape
// below failed to compile until they were:
//   - an integer literal WRITTEN to a Double signal (`x.set(2)` beside
//     `signal(0.5)`) emitted `x = 2` — Kotlin rejects Int into Double;
//   - Swift's Int×Double coercion could not type a `for…of` item or a `reduce`
//     callback's element, so `it * RATE` / `m.qty * RATE` stayed a bare
//     `Int * Double`.
//
// Every shape is asserted on the emitted text AND compiled by swiftc (stub
// typecheck) and kotlinc — the toolchains, not the strings, are the proof.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const H = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
`

interface Shape {
  src: string
  swift: string[]
  kotlin: string[]
}

const SHAPES: Record<string, Shape> = {
  'a signal SET a file-scope Double widens': {
    src: `const RATE = 0.5
export function A() {
  const x = signal(0)
  return <Stack><Text>{String(x())}</Text><Button onPress={() => x.set(x() + RATE)}>go</Button></Stack>
}`,
    swift: ['@State private var x: Double = 0.0'],
    kotlin: ['mutableStateOf(0.0)'],
  },
  'a signal UPDATED by a file-scope Double widens': {
    src: `const RATE = 0.5
export function A() {
  const x = signal(0)
  return <Stack><Text>{String(x())}</Text><Button onPress={() => x.update((v) => v * RATE)}>go</Button></Stack>
}`,
    swift: ['@State private var x: Double = 0.0'],
    kotlin: ['mutableStateOf(0.0)'],
  },
  'an explicit signal<number> seeded from a file-scope Double': {
    src: `const RATE = 0.5
export function A() {
  const x = signal<number>(RATE)
  return <Stack><Text>{String(x())}</Text></Stack>
}`,
    swift: ['@State private var x: Double = RATE'],
    kotlin: ['mutableStateOf(RATE)'],
  },
  'an un-annotated signal(RATE) written an integer literal': {
    src: `const RATE = 0.5
export function A() {
  const x = signal(RATE)
  return <Stack><Text>{String(x())}</Text><Button onPress={() => x.set(2)}>go</Button></Stack>
}`,
    swift: ['@State private var x: Double = RATE', 'x = 2.0'],
    kotlin: ['x = 2.0'],
  },
  'a local accumulator over an Int column times a file-scope Double': {
    src: `const RATE = 0.5
export function A() {
  const items = signal([1, 2, 3])
  const total = () => {
    let acc = 0
    for (const it of items()) acc += it * RATE
    return acc
  }
  return <Stack><Text>{String(total())}</Text></Stack>
}`,
    swift: ['var acc = 0.0', 'acc += Double(it) * RATE', 'func total() -> Double'],
    kotlin: ['var acc = 0.0', 'fun total(): Double'],
  },
  'a reduce seed over an Int field times a file-scope Double': {
    src: `type Item = { id: number; qty: number }
export function A() {
  const items = signal<Item[]>([{ id: 1, qty: 2 }])
  const total = computed(() => items().reduce((s, m) => s + m.qty * RATE, 0))
  return <Stack><Text>{String(total())}</Text></Stack>
}
const RATE = 0.5`,
    swift: ['items.reduce(0.0, { s, m in s + Double(m.qty) * RATE })'],
    kotlin: ['items.fold(0.0,'],
  },
  'a reduce over a file-scope struct array': {
    src: `type Item = { id: number; price: number }
const ITEMS: Item[] = [{ id: 1, price: 2.5 }]
export function A() {
  const total = computed(() => ITEMS.reduce((s, m) => s + m.price, 0))
  return <Stack><Text>{String(total())}</Text></Stack>
}`,
    swift: ['ITEMS.reduce(0.0,'],
    kotlin: ['ITEMS.fold(0.0,'],
  },
  'an annotated file-scope number derived from another binding': {
    src: `const RATE = 0.5
const DOUBLE_RATE: number = RATE * 2
export function A() {
  return <Stack><Text>{String(DOUBLE_RATE)}</Text></Stack>
}`,
    swift: ['private let DOUBLE_RATE: Double ='],
    kotlin: ['private val DOUBLE_RATE: Double ='],
  },
  'a named struct field given a file-scope Double': {
    src: `type Item = { id: number; price: number }
const P = 2.5
export function A() {
  const items = signal<Item[]>([{ id: 1, price: P }])
  return <Stack><Text>{String(items()[0]!.price)}</Text></Stack>
}`,
    swift: ['var price: Double'],
    kotlin: ['var price: Double'],
  },
  'an inline object field given a file-scope Double': {
    src: `const P = 2.5
export function A() {
  const items = signal<{ id: number; price: number }[]>([{ id: 1, price: P }, { id: 2, price: 3 }])
  return <Stack><Text>{String(items().length)}</Text></Stack>
}`,
    swift: ['var price: Double', 'price: 3.0'],
    kotlin: ['var price: Double', 'price = 3.0'],
  },
  'a number[] generic holding a file-scope Double': {
    src: `const P = 2.5
export function A() {
  const xs = signal<number[]>([P, 3])
  return <Stack><Text>{String(xs().length)}</Text></Stack>
}`,
    swift: ['@State private var xs: [Double] = [P, 3.0]'],
    kotlin: ['listOf(P, 3.0)'],
  },
  'a file-scope helper returning a product with a file-scope Double': {
    src: `const RATE = 0.5
function scale(x: number) { return x * RATE }
export function A() {
  return <Stack><Text>{String(scale(2))}</Text></Stack>
}`,
    swift: ['func scale(_ x: Int) -> Double'],
    kotlin: ['fun scale(x: Long): Double'],
  },
  'a component arrow returning a product with a file-scope Double': {
    src: `const RATE = 0.5
export function A() {
  const n = signal(2)
  const m = () => n() * RATE
  return <Stack><Text>{String(m())}</Text></Stack>
}`,
    swift: ['private func m() -> Double'],
    kotlin: ['fun m()'],
  },
}

describe('float widening sees file-scope consts', () => {
  for (const [name, shape] of Object.entries(SHAPES)) {
    describe(name, () => {
      const swift = transform(H + shape.src, { target: 'swift' }).code
      const kotlin = transform(H + shape.src, { target: 'kotlin' }).code
      it('emits the Double on Swift', () => {
        for (const needle of shape.swift) expect(swift).toContain(needle)
      })
      it('emits the Double on Kotlin', () => {
        for (const needle of shape.kotlin) expect(kotlin).toContain(needle)
      })
      it.skipIf(!isSwiftcAvailable())('type-checks on swiftc', () => {
        const r = validateSwiftWithStubs(swift)
        expect(r.ok, r.error ?? '').toBe(true)
      })
      it.skipIf(!isKotlincAvailable())('compiles on kotlinc', () => {
        const r = validateKotlin(kotlin)
        expect(r.ok, r.error ?? '').toBe(true)
      })
    })
  }
})

// Additive in the other direction: an integer file-scope const is not evidence.
describe('an integer file-scope const widens nothing', () => {
  const src = `${H}const STEP = 2
type Item = { id: number; qty: number }
export function A() {
  const x = signal(0)
  const items = signal<Item[]>([{ id: 1, qty: STEP }])
  const total = computed(() => items().reduce((s, m) => s + m.qty * STEP, 0))
  return <Stack><Text>{String(x() + total())}</Text><Button onPress={() => x.set(x() + STEP)}>go</Button></Stack>
}`
  it('keeps every declaration Int on Swift, Long on Kotlin (the default, not float-widened)', () => {
    const swift = transform(src, { target: 'swift' }).code
    const kotlin = transform(src, { target: 'kotlin' }).code
    expect(swift).toContain('@State private var x: Int = 0')
    expect(swift).toContain('var qty: Int')
    expect(swift).toContain('items.reduce(0,')
    expect(kotlin).toContain('mutableStateOf(0L)')
    expect(kotlin).toContain('var qty: Long')
    expect(kotlin).toContain('items.fold(0L,')
  })
})
