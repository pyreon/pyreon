// A component-body `let` that a CLOSURE reassigns (`let hits = 0; const bump = () => { hits++ }`) is component state in
// everything but name. As a value-const it emitted an immutable `let`/`val`: Swift could not see it from the helper
// `func` ("cannot find 'hits' in scope"), Kotlin rejected the write ("'val' cannot be reassigned") — with no warning.
// It now lowers to the signal-backed `@State` / `mutableStateOf` it behaves as.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const MUTATED = `import { signal } from '@pyreon/reactivity'
export function Counter() {
  let hits = 0
  const bump = () => { hits++ }
  const shown = signal(0)
  return (<VStack><Text>{shown()}</Text><Button onPress={() => { bump(); shown.set(hits) }}>go</Button></VStack>)
}`

// Controls: a `let` never reassigned in a closure, and a `const`, must keep their value-const lowering.
const UNMUTATED = `export function Label() {
  let title = 'hi'
  const other = 2
  return (<VStack><Text>{title}</Text><Text>{other}</Text></VStack>)
}`

describe('closure-mutated component let', () => {
  it('becomes @State on Swift and mutableStateOf on Kotlin, with no warnings', () => {
    const sw = transform(MUTATED, { target: 'swift' })
    expect(sw.code).toContain('@State private var hits: Int = 0')
    expect(sw.warnings ?? []).toEqual([])
    const kt = transform(MUTATED, { target: 'kotlin' })
    expect(kt.code).toContain('var hits by remember { mutableStateOf(0L) }')
    expect(kt.warnings ?? []).toEqual([])
  })

  it('leaves an un-mutated let and a const as plain values', () => {
    const sw = transform(UNMUTATED, { target: 'swift' }).code
    expect(sw).not.toContain('@State private var title')
    expect(sw).not.toContain('@State private var other')
  })
})

describe.skipIf(!isSwiftcAvailable())('closure-mutated let compiles (swiftc)', () => {
  it('type-checks', () => {
    const res = validateSwiftWithStubs(transform(MUTATED, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe.skipIf(!isKotlincAvailable())('closure-mutated let compiles (kotlinc)', () => {
  it('type-checks', () => {
    const res = validateKotlin(transform(MUTATED, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
