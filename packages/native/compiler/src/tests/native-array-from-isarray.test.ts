// Zero-silent-drops (P1) — `Array.from(x)` / `Array.from(x, fn)` / `Array.isArray(x)`.
// JS's `Array.from` and `Array.isArray` have no member on Swift's `Array` type,
// so the generic emit produced `Array.from(...)` / `Array.isArray(...)` → INVALID
// on both targets (Swift "type 'Array<Element>' has no member 'from'" / "generic
// parameter 'Element' could not be inferred"; Kotlin "cannot infer type for type
// parameter 'T'") — a clean-parse but uncompilable SILENT mis-emit (verified).
//
// The faithful lowerings:
//   Array.from(x)      → Swift `Array(x)`         Kotlin `(x).toList()`   (shallow copy)
//   Array.from(x, fn)  → Swift `x.map(fn)`        Kotlin `x.map(fn)`      (map form; reuses `.map`)
//   Array.isArray(x)   → Swift/Kotlin `true`      (a typed source IS statically an array)
//
// The map form is lowered via the shared `arrayFromMapRewrite` (infer-type.ts),
// which rewrites `Array.from(src, fn)` → the `src.map(fn)` member-call IR so BOTH
// the emitters and the inference reuse the existing `.map` machinery (element
// type = the callback's return; closure emit identical). The result type is
// mirrored by `inferArrayStaticCall` (array copy / mapped array / boolean) so a
// computed over these isn't annotated `Any` (which would break any chained
// method or typed position downstream — the `Array.from(x).reverse()` proof).
//
// The `Array.from({ length: n }, …)` numeric-RANGE form (object-literal first
// arg) is deliberately NOT lowered yet — it needs a numeric-range source. It
// emits a NAMED build-failing warning (never a silent drop) + keeps the raw
// `Array.from(` emit; a follow-up can lower it to `(0..<n).map { … }`.
//
// Bisect-load-bearing:
//   • neuter `arrayFromMapRewrite`  → the map-form emit falls to the raw
//     `Array.from(` (map specs + map compile proof fail);
//   • neuter `inferArrayStaticCall` → the copy result degrades to `Any`, so the
//     chained `Array.from(x).reverse()` proof fails (`.reverse` gates on array);
//   • comment either emitter's `Array.*` block → that target's copy/isArray
//     emit specs fail. The 1-arg / non-Array controls stay green throughout.

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
  const rows = signal<number[]>([1, 2, 3, 4, 5])
${body}
  return (<Stack><Text>{out}</Text></Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

const copy = A(`  const out = computed(() => String(Array.from(rows()).length))`)
const map2 = A(`  const out = computed(() => String(Array.from(rows(), (v: number) => v * 2).length))`)
const isArr = A(`  const out = computed(() => Array.isArray(rows()) ? "arr" : "no")`)
const chained = A(`  const out = computed(() => String(Array.from(rows()).reverse().length))`)
const range = A(
  `  const out = computed(() => String(Array.from({ length: 3 }, (_: unknown, i: number) => i).length))`,
)

describe('P1 — Array.from / Array.isArray faithful native lowering', () => {
  it('Swift: `Array.from(x)` → `Array(x)` (not `Array.from`)', () => {
    expect(sw(copy)).toContain('Array(')
    expect(sw(copy)).not.toContain('Array.from')
  })
  it('Kotlin: `Array.from(x)` → `(x).toList()` (not `Array.from`)', () => {
    expect(kt(copy)).toContain('.toList()')
    expect(kt(copy)).not.toContain('Array.from')
  })

  it('Swift/Kotlin: `Array.from(x, fn)` → `.map(fn)` (not `Array.from`)', () => {
    expect(sw(map2)).toContain('.map(')
    expect(sw(map2)).not.toContain('Array.from')
    expect(kt(map2)).toContain('.map(')
    expect(kt(map2)).not.toContain('Array.from')
  })

  it('Swift/Kotlin: `Array.isArray(x)` → `true` (not `isArray`)', () => {
    expect(sw(isArr)).toContain('true')
    expect(sw(isArr)).not.toContain('isArray')
    expect(kt(isArr)).toContain('true')
    expect(kt(isArr)).not.toContain('isArray')
  })

  // The `{ length: n }` range form is NOT lowered — it must emit a NAMED
  // warning (not a silent drop) and keep the raw `Array.from(` emit.
  it('Swift/Kotlin: `Array.from({ length: n }, …)` warns loudly (no silent drop)', () => {
    const rs = transform(range, { target: 'swift' })
    const rk = transform(range, { target: 'kotlin' })
    expect(rs.warnings.some((w) => w.includes('numeric-range form'))).toBe(true)
    expect(rk.warnings.some((w) => w.includes('numeric-range form'))).toBe(true)
    // Still emits (loudly broken at the site), never dropped:
    expect(rs.code).toContain('Array.from(')
    expect(rk.code).toContain('Array.from(')
  })

  // Compile proof — one component exercising copy + map + isArray-guard +
  // chained (the chain is the inference proof: the copy result must be typed as
  // an array for `.reverse()` to lower).
  const proof = A(`  const dup = computed(() => Array.from(rows()))
  const doubled = computed(() => Array.from(rows(), (v: number) => v * 2))
  const ok = computed(() => Array.isArray(rows()) && rows().length > 0)
  const rev = computed(() => Array.from(rows()).reverse())
  const out = computed(() => String(dup().length) + " " + String(doubled().length) + " " + (ok() ? "y" : "n") + " " + String(rev().length))`)

  it.skipIf(!isSwiftUIAvailable())('iOS: copy + map + isArray + chained TYPECHECK against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
