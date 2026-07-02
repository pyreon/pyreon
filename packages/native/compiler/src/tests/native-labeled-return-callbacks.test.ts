// Zero-silent-drops (P1) — Kotlin labeled-return wiring for PLAIN (1-param)
// multi-statement callbacks + the nested-arrow mutability sibling fix.
//
// A bare `return` inside a Kotlin lambda is prohibited (it targets the
// enclosing function) — the labeled form `return@<method>` is required, and
// only the CALL SITE knows the emitted method name. The indexed (2-param)
// path has had this since #1954 (emitKotlinIndexedBody); the PLAIN path
// never did — a multi-statement predicate (`filter(x => { if (cond) return
// false; return x > 0 })`) either silently dropped its body (main) or, with
// #1991, warned NAMED. This PR wires the plain call sites:
//   filter/map/forEach/flatMap/find/findLast → same-name labels
//   some → any · every → all (their emitted Kotlin names)
// via `emitKotlinPlainCallback`, reusing emitKotlinIndexedBody's labeled
// body machinery with a 1-param head. Expression bodies + 2-param indexed
// callbacks keep their existing paths.
//
// SIBLING FIND (9th instance): the forEach ACCUMULATE idiom (`let acc = 0;
// nums().forEach(x => { acc = acc + x })`) exposed the mutability tracker
// missing reassignments inside CALLBACK arrows — it walked if/while/for-of/
// switch statement bodies but never EXPRESSION trees, so the outer `let
// acc` stayed immutable ("'val' cannot be reassigned" / Swift "left side of
// mutating operator isn't mutable"). A generic structural walk now finds
// every nested arrow's statement list (over-marking is harmless — a
// never-mutated var is a warning, not an error).
//
// Bisect-load-bearing: (1) neuter the call-site wiring → the labeled specs
// fall back to the sentinel/warn; (2) neuter the nested-arrow walk → the
// forEach-accumulate spec fails "'val' cannot be reassigned".

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

const A = (body: string, read = 'String(out())') =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const nums = signal<number[]>([1, 2, 3])
${body}
  return (<Stack><Text>{${read}}</Text></Stack>)
}`

const kt = (src: string) => transform(src, { target: 'kotlin' })

describe('P1 — Kotlin labeled-return plain callbacks', () => {
  it('filter with early returns emits return@filter (body no longer dropped)', () => {
    const rk = kt(A(`  const out = computed(() => nums().filter((x: number) => { if (x > 2) return false; return x > 0 }).length)`))
    expect(rk.code).toContain('return@filter false')
    expect(rk.code).toContain('return@filter x > 0')
    expect(rk.code).not.toContain('{ x -> "" }')
    expect(rk.warnings).toHaveLength(0)
  })
  it('map/some/every route through their EMITTED names (map / any / all)', () => {
    expect(
      kt(A(`  const out = computed(() => nums().map((x: number) => { if (x > 2) return 0; return x * 2 }).length)`)).code,
    ).toContain('return@map 0')
    expect(
      kt(A(`  const out = computed(() => nums().some((x: number) => { if (x < 0) return false; return x > 2 }))`)).code,
    ).toContain('return@any false')
    expect(
      kt(A(`  const out = computed(() => nums().every((x: number) => { if (x < 0) return true; return x > 0 }))`)).code,
    ).toContain('return@all true')
  })
  it('the forEach ACCUMULATE idiom works — guard return + nested-arrow mutability (sibling find)', () => {
    const rk = kt(A(`  const out = computed(() => {
    let acc = 0
    nums().forEach((x: number) => { if (x > 2) return; acc = acc + x })
    return acc
  })`))
    expect(rk.code).toContain('return@forEach')
    expect(rk.code).toContain('var acc = 0')
    expect(rk.warnings).toHaveLength(0)
  })
  it('controls: expression-body callbacks + 2-param indexed callbacks unchanged', () => {
    const expr = kt(A(`  const out = computed(() => nums().filter((x: number) => x > 1).length)`))
    expect(expr.code).toContain('filter({ x -> x > 1 })')
    const idx = kt(A(`  const out = computed(() => nums().filter((x: number, i: number) => { if (i === 0) return false; return x > 0 }).length)`))
    expect(idx.code).toContain('return@filterIndexed')
  })

  // Compile proof — dedup-shaped predicate + accumulate in one component.
  const proof = A(`  const evens = computed(() => nums().filter((x: number) => { if (x > 2) return false; return x % 2 === 0 }).length)
  const total = computed(() => {
    let acc = 0
    nums().forEach((x: number) => { if (x > 2) return; acc = acc + x })
    return acc
  })
  const out = computed(() => evens() + total())`)
  it.skipIf(!isKotlincAvailable())('Android: the labeled-return component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
