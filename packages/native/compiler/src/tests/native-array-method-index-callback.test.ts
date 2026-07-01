// Zero-silent-drops (P1): a 2-param array-method callback — `arr.map((el, idx)
// => …)` / `arr.forEach((el, idx) => …)` — used to be SILENTLY mis-emitted.
// JS passes the callback (element, index), but Swift's `.map`/`.forEach`
// closure takes ONLY the element and Kotlin's lambda only the element, so the
// bare emit `{ x, i in … }` / `{ x, i -> … }` is rejected:
//   Swift:  contextual closure type '(Int) -> Int' expects 1 argument, but 2
//           were used in closure body
//   Kotlin: cannot infer type for type parameter 'R' / argument type mismatch
// Mapping-with-index is ubiquitous (enumeration, list-with-position) — a
// clean-parse but uncompilable silent mis-emit.
//
// Fixed by lowering a 2-param callback to the index-aware native variant:
//   Swift:  arr.enumerated().map  { (idx, el) in … }   / .forEach { … }
//   Kotlin: arr.mapIndexed        { idx, el -> … }      / .forEachIndexed { … }
// Both native forms are index-FIRST `(index, element)`, while JS is `(element,
// index)` — so the emitters bind the params SWAPPED, keeping the body's names
// valid. The shared `indexedArrayCallback(args)` helper (infer-type.ts)
// recognises the shape for both targets; a 1-param callback returns null and
// falls through to the generic `.map`/`.forEach` emit (unchanged).
//
// Bisect-load-bearing: neuter `indexedArrayCallback` → null → both 2-param
// map/forEach fall through to the broken generic emit; the index-callback
// emit + compile specs fail, the 1-param control stays green.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const H =
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text, Button } from '@pyreon/primitives'\n`

const mapIdx = `${H}export function App(){
  const ns = signal([3, 1, 2])
  const out = computed(() => String(ns().map((x, i) => x + i).length))
  return (<Stack><Text>{out}</Text></Stack>)
}`
const forEachIdx = `${H}export function App(){
  const ns = signal([1, 2, 3])
  const onTap = () => { ns().forEach((x, i) => { ns.set([x + i]) }) }
  return (<Stack><Button onPress={onTap}>x</Button></Stack>)
}`
// 1-param control — must stay on the generic emit (no enumerated/mapIndexed).
const map1p = `${H}export function App(){
  const ns = signal([1, 2])
  const out = computed(() => String(ns().map(x => x * 2).length))
  return (<Stack><Text>{out}</Text></Stack>)
}`
// MULTI-statement block body. The parser stores it in `stmts` (with `body` set
// to an empty-literal SENTINEL); the indexed emit used to read only `body` →
// silently dropped the whole body while compiling clean. A SINGLE-statement
// block collapses to `body` (that's why `forEachIdx` above never caught this).
const forEachMulti = `${H}export function App(){
  const a = signal(0)
  const b = signal(0)
  const ns = signal([1, 2, 3])
  const onTap = () => { ns().forEach((x, i) => { a.set(x); b.set(i) }) }
  return (<Stack><Button onPress={onTap}>x</Button></Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

describe('P1 — array-method 2-param (index) callback lowers (was a silent mis-emit)', () => {
  it('Swift: `.map((x,i))` → `enumerated().map { (i, x) in … }` (index-first, swapped)', () => {
    const code = sw(mapIdx)
    expect(code).toContain('.enumerated().map(')
    // index-first binding: `(i, x)` not `(x, i)`
    expect(code).toContain('(i, x) in')
  })
  it('Swift: `.forEach((x,i))` → `enumerated().forEach`', () => {
    expect(sw(forEachIdx)).toContain('.enumerated().forEach(')
  })
  it('Kotlin: `.map((x,i))` → `mapIndexed { i, x -> … }` (index-first)', () => {
    const code = kt(mapIdx)
    expect(code).toContain('.mapIndexed(')
    expect(code).toContain('i, x ->')
  })
  it('Swift: multi-statement `.forEach((x,i) => { … })` emits EVERY statement (no silent drop)', () => {
    const code = sw(forEachMulti)
    expect(code).toContain('.enumerated().forEach(')
    expect(code).toContain('a = x') // element write kept (x = element, index-swapped bind)
    expect(code).toContain('b = i') // index write kept
    expect(code).not.toContain('in ""') // NOT the dropped-body empty sentinel
  })
  it('Kotlin: multi-statement `.forEach((x,i) => { … })` emits EVERY statement (no silent drop)', () => {
    const code = kt(forEachMulti)
    expect(code).toContain('.forEachIndexed(')
    expect(code).toContain('a = x')
    expect(code).toContain('b = i')
    expect(code).not.toContain('-> ""')
  })
  it('Kotlin: `.forEach((x,i))` → `forEachIndexed`', () => {
    expect(kt(forEachIdx)).toContain('.forEachIndexed(')
  })

  // 1-param callbacks must NOT use the indexed form.
  it('Swift/Kotlin: 1-param `.map(x => …)` is NOT lowered to the indexed form', () => {
    expect(sw(map1p)).not.toContain('.enumerated().map(')
    expect(kt(map1p)).not.toContain('.mapIndexed(')
  })

  // Real proof: a component using `.map((x,i))` + `.forEach((x,i))` compiles.
  // 180s timeout — each spec runs TWO real toolchain compiles (mapIdx +
  // forEachIdx), so two JVM/swiftc cold-starts; the default 60s flakes under
  // CI load (the kotlinc JVM cold-start alone is ~17-30s per compile here).
  it.skipIf(!isSwiftUIAvailable())(
    'iOS: index-callback `.map`/`.forEach` TYPECHECK against real SwiftUI',
    () => {
      expect(validateSwiftTypecheck(sw(mapIdx)).ok, validateSwiftTypecheck(sw(mapIdx)).error ?? '').toBe(true)
      expect(validateSwiftTypecheck(sw(forEachIdx)).ok, validateSwiftTypecheck(sw(forEachIdx)).error ?? '').toBe(true)
      // multi-statement body must ALSO compile (not just emit) — the whole
      // point: it used to emit an empty `""` body and compile clean.
      expect(
        validateSwiftTypecheck(sw(forEachMulti)).ok,
        validateSwiftTypecheck(sw(forEachMulti)).error ?? '',
      ).toBe(true)
    },
    180_000,
  )
  it.skipIf(!isKotlincAvailable())(
    'Android: the same compile via kotlinc',
    () => {
      expect(validateKotlin(kt(mapIdx)).ok, validateKotlin(kt(mapIdx)).error ?? '').toBe(true)
      expect(validateKotlin(kt(forEachIdx)).ok, validateKotlin(kt(forEachIdx)).error ?? '').toBe(true)
      expect(
        validateKotlin(kt(forEachMulti)).ok,
        validateKotlin(kt(forEachMulti)).error ?? '',
      ).toBe(true)
    },
    180_000,
  )
})
