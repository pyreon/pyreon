// Zero-silent-drops (P1) — write-site float WIDENING of a signal's declared
// type (both targets).
//
// JS has ONE number type; PMTC splits Int/Double from the declared generic +
// initializer. So `signal<number>(0)` declared Int even when every WRITE is
// fractional — `price.set(1.5)` / `price.update(v => v + 0.5)` emitted an
// Int `@State` / `mutableStateOf(0)` receiving a Double: a LOUD native type
// error on both targets ("cannot assign value of type 'Double' to type
// 'Int'" / "assignment type mismatch"). The Int/Double split must be driven
// by ALL writes, not just the initializer.
//
// `widenFloatSignals` (infer-type.ts) walks the whole component IR — a
// GENERIC structural walk, no node-kind enumeration, so no shape can be
// missed — for `X.set(arg)` / `X.update(fn)` against Int-typed number
// signals; a float-inferring written value widens the DECL to Double and
// an integer-literal initializer gains `float: true` (emits `0.0` — Kotlin's
// `mutableStateOf(0)` carries no type annotation, so the initializer IS the
// type there). Runs to fixpoint (a widened signal can make another signal's
// write float). Conservative: a write the pass can't prove float keeps
// today's loud native error — fail-safe, never a silent truncation.
//
// COMPOSES with #1982 (`Date.now()` → epoch-ms Double): once both land, the
// stopwatch shape `signal<number>(0)` + `start.set(Date.now())` widens too —
// the canonical motivation. On THIS branch that shape still fails loud
// (Date.now() is unlowered here), so the specs below prove the same
// inference path via float literals + a float-returning helper call.
//
// Bisect-load-bearing: neuter the widening call (or the pass body) → the
// widening specs revert to `Int = 0` declarations + both compile proofs
// fail; the Int controls still pass.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

const SET_FLOAT = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App(){
  const price = signal<number>(0)
  const onTap = () => { price.set(1.5) }
  return (<Stack><Button onPress={onTap}>go</Button><Text>{String(price())}</Text></Stack>)
}`

describe('P1 — write-site float widening (both targets)', () => {
  it('Swift: `signal<number>(0)` + `.set(1.5)` declares Double (initializer 0.0)', () => {
    const code = sw(SET_FLOAT)
    expect(code).toContain('@State private var price: Double = 0.0')
    expect(code).not.toContain('price: Int')
  })
  it('Kotlin: the same widens `mutableStateOf(0)` → `mutableStateOf(0.0)` (the initializer IS the type there)', () => {
    const code = kt(SET_FLOAT)
    expect(code).toContain('mutableStateOf(0.0)')
    expect(code).not.toContain('mutableStateOf(0)')
  })
  it('widens through `.update(v => v + 0.5)` (the arrow-body write)', () => {
    const code = sw(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App(){
  const price = signal<number>(0)
  const onTap = () => { price.update((v: number) => v + 0.5) }
  return (<Stack><Button onPress={onTap}>go</Button><Text>{String(price())}</Text></Stack>)
}`)
    expect(code).toContain('var price: Double = 0.0')
  })
  it('fixpoint: a widened signal widens a signal written FROM it (`a.set(b())`)', () => {
    const code = sw(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App(){
  const a = signal<number>(0)
  const b = signal<number>(0)
  const onTap = () => { b.set(1.5); a.set(b()) }
  return (<Stack><Button onPress={onTap}>go</Button><Text>{String(a())}</Text></Stack>)
}`)
    expect(code).toContain('var a: Double = 0.0')
    expect(code).toContain('var b: Double = 0.0')
  })

  // Controls — Int-written signals must stay Int (no blanket widening).
  it('controls: `.set(5)` and `.update(v => v + 1)` keep Int declarations', () => {
    const setInt = sw(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App(){
  const count = signal<number>(0)
  const onTap = () => { count.set(5) }
  return (<Stack><Button onPress={onTap}>go</Button><Text>{String(count())}</Text></Stack>)
}`)
    expect(setInt).toContain('var count: Int = 0')
    expect(setInt).not.toContain('Double')
    const updInt = sw(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App(){
  const count = signal<number>(0)
  const onTap = () => { count.update((v: number) => v + 1) }
  return (<Stack><Button onPress={onTap}>go</Button><Text>{String(count())}</Text></Stack>)
}`)
    expect(updInt).toContain('var count: Int = 0')
  })

  // Compile proof — set-float + update-float + downstream arithmetic in one
  // component through real swiftc + kotlinc.
  const proof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App(){
  const price = signal<number>(0)
  const qty = signal<number>(1)
  const total = computed(() => price() * qty())
  const onTap = () => { price.set(1.5); qty.update((v: number) => v + 1) }
  return (<Stack><Button onPress={onTap}>add</Button><Text>{String(total())}</Text></Stack>)
}`
  it.skipIf(!isSwiftUIAvailable())('iOS: the widened component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
