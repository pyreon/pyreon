// Zero-silent-drops (P1) — the numeric-RANGE form of `Array.from`, deferred with
// a named warning in #1943 and completed here:
//   `Array.from({ length: n }, (_, i) => body)`
//     → Swift  `(0..<n).map { i in body }`
//     → Kotlin `(0 until n).map { i -> body }`
//
// On `main` this FAILED both targets: the `{ length: n }` first arg was
// synthesized as a struct (`Array.from(__Obj0(length: 3), …)`) and `Array` has
// no `from` member (Swift "generic parameter 'Element' could not be inferred";
// Kotlin "unresolved reference 'from'") — a clean-parse but uncompilable emit
// that #1943 at least made LOUD (a named warning).
//
// The lowering is gated by the shared `objectLengthRangeForm` (infer-type.ts):
// first arg exactly `{ length: <expr> }`, second arg a ≥2-param EXPRESSION-body
// arrow, and the ELEMENT param (always `undefined` for a `{ length }` source)
// NOT referenced in the body (guarded via `exprReferencesIdent` — else there's
// no faithful native value, so it stays a warning). `inferArrayStaticCall`
// mirrors the result type (a mapped array whose element = the body's type, with
// the index bound to a number) so a computed over it isn't annotated `Any`.
//
// Shapes NOT lowered (still a loud named warning, never silent): the 1-arg
// `{ length: n }` form (no map fn), a block-body callback, and an element-param-
// referencing callback.
//
// Bisect-load-bearing:
//   • neuter `objectLengthRangeForm` → the range emit falls to the warning+raw
//     `Array.from(` (the range emit specs + compile proofs fail);
//   • neuter `exprReferencesIdent` (→ always false) → the element-param-used
//     case is no longer guarded and emits an unbound range map instead of the
//     warning (the guard spec fails).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const A = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const count = signal<number>(3)
${body}
  return (<Stack><Text>{out}</Text></Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

const intRange = A(`  const out = computed(() => String(Array.from({ length: 3 }, (_: unknown, i: number) => i * 2).length))`)
// Returned DIRECTLY (not wrapped) so the computed's annotation IS the mapped
// array type — `[String]` when inference works, `Any` when it degrades.
const strRange = A(`  const out = computed(() => Array.from({ length: 3 }, (_: unknown, i: number) => "row " + String(i)))`)
const dynRange = A(`  const out = computed(() => String(Array.from({ length: count() }, (_: unknown, i: number) => i + 1).length))`)
// Deferred — 1-arg `{ length: n }` (no map fn).
const noFn = A(`  const out = computed(() => String(Array.from({ length: 3 }).length))`)
// Guard — the element param (always undefined) is referenced.
const elemUsed = A(`  const out = computed(() => String(Array.from({ length: 3 }, (el: unknown, i: number) => el).length))`)

describe('P1 — Array.from numeric-range form (`{ length: n }, (_, i) => …`)', () => {
  it('Swift: `Array.from({length:n},(_,i)=>b)` → `(0..<n).map { i in b }`', () => {
    expect(sw(intRange)).toContain('(0..<3).map(')
    expect(sw(intRange)).toContain('i * 2')
    expect(sw(intRange)).not.toContain('Array.from')
  })
  it('Kotlin: `Array.from({length:n},(_,i)=>b)` → `(0 until n).map { i -> b }`', () => {
    expect(kt(intRange)).toContain('(0 until 3).map(')
    expect(kt(intRange)).toContain('i * 2')
    expect(kt(intRange)).not.toContain('Array.from')
  })

  it('Swift/Kotlin: a signal-valued length lowers (`0..<count` / `0 until count`)', () => {
    expect(sw(dynRange)).toContain('(0..<count).map(')
    expect(kt(dynRange)).toContain('(0 until count).map(')
    expect(sw(dynRange)).not.toContain('Array.from')
    expect(kt(dynRange)).not.toContain('Array.from')
  })

  // Inference: a string-producing body makes the computed a `[String]` (Swift)
  // — proven by the annotation, not just the emit shape.
  it('Swift: a string-body range infers `[String]` (not `Any`)', () => {
    expect(sw(strRange)).toContain('(0..<3).map(')
    expect(sw(strRange)).not.toContain(': Any')
  })

  // Deferred — the 1-arg `{ length: n }` form warns loudly (never silent) and
  // keeps the raw emit.
  it('Swift/Kotlin: 1-arg `Array.from({length:n})` warns + keeps raw emit', () => {
    const rs = transform(noFn, { target: 'swift' })
    const rk = transform(noFn, { target: 'kotlin' })
    expect(rs.warnings.some((w) => w.includes('map callback'))).toBe(true)
    expect(rk.warnings.some((w) => w.includes('map callback'))).toBe(true)
    expect(rs.code).toContain('Array.from(')
    expect(rk.code).toContain('Array.from(')
  })

  // Guard (load-bearing at `exprReferencesIdent`) — referencing the element
  // param (always `undefined`) is NOT lowered to a range map; it warns instead.
  it('Swift/Kotlin: an element-param-using callback warns, does NOT emit a range', () => {
    const rs = transform(elemUsed, { target: 'swift' })
    const rk = transform(elemUsed, { target: 'kotlin' })
    expect(rs.warnings.some((w) => w.includes('map callback'))).toBe(true)
    expect(rk.warnings.some((w) => w.includes('map callback'))).toBe(true)
    expect(rs.code).not.toContain('(0..<')
    expect(rk.code).not.toContain('(0 until')
  })

  // Compile proof — int range + string range + signal-length range in one
  // component TYPECHECK against real SwiftUI / kotlinc.
  const proof = A(`  const pages = computed(() => Array.from({ length: 5 }, (_: unknown, i: number) => i + 1))
  const labels = computed(() => Array.from({ length: 3 }, (_: unknown, i: number) => "row " + String(i)))
  const dynamic = computed(() => Array.from({ length: count() }, (_: unknown, i: number) => i * 10))
  const out = computed(() => String(pages().length) + " " + String(labels().length) + " " + String(dynamic().length))`)

  it.skipIf(!isSwiftUIAvailable())('iOS: int + string + signal-length ranges TYPECHECK against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
