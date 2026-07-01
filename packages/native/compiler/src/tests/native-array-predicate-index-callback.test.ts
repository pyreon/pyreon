// Zero-silent-drops (P1) — completes the array-method INDEX-callback family that
// #1934 started for `.map`/`.forEach`. JS lets you pass a 2-param `(el, idx)`
// callback to `.filter` / `.findIndex` / `.some` / `.every`, but the plain
// Swift/Kotlin collection methods take a 1-param element predicate, so the bare
// 2-param closure is emitted and both compilers reject it ("contextual closure
// type '(Int) -> Bool' expects 1 argument, but 2 were used" / Kotlin "argument
// type mismatch") — a clean-parse but uncompilable SILENT mis-emit.
//
// The index-aware native forms (index-FIRST, so the params bind SWAPPED from JS's
// `(el, idx)` — same convention as #1934's map/forEach):
//   .filter    → Swift `enumerated().filter{ (i,x) in … }.map{ $0.element }`  Kotlin `filterIndexed{ i,x -> … }`
//   .some      → Swift `enumerated().contains(where:{ (i,x) in … })`          Kotlin `withIndex().any{ (i,x) -> … }`
//   .every     → Swift `enumerated().allSatisfy{ (i,x) in … }`               Kotlin `withIndex().all{ (i,x) -> … }`
//   .findIndex → Swift `enumerated().first(where:{ (i,x) in … })?.offset ?? -1` Kotlin `withIndex().firstOrNull{ (i,x) -> … }?.index ?: -1`
//
// The load-bearing detail: a 2-PARAM arrow is still ONE argument, so the pre-
// existing `if (e.args.length === 1) return <1-arg form>` fired FIRST and emitted
// the bare closure. The fix checks the shared `indexedArrayCallback` gate (#1934,
// discriminates on `params.length === 2`) BEFORE the 1-arg branch in every case.
//
// Bisect-load-bearing at the ONE shared gate: neuter `indexedArrayCallback`
// (infer-type.ts) → every index form (incl. these four) falls to the 1-arg branch
// and re-emits the bare 2-param closure → the index specs + compile proof fail;
// the 1-arg control specs stay green.

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
  const xs = signal<number[]>([1, 2, 3, 4, 5])
${body}
  return (<Stack><Text>{out}</Text></Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

const filterIdx = A(`  const out = computed(() => String(xs().filter((x, i) => i % 2 === 0).length))`)
const someIdx = A(`  const out = computed(() => xs().some((x, i) => i === x) ? "y" : "n")`)
const everyIdx = A(`  const out = computed(() => xs().every((x, i) => x > i) ? "y" : "n")`)
const findIdxIdx = A(`  const out = computed(() => String(xs().findIndex((x, i) => i > 2)))`)
// 1-arg controls — must keep the plain form (NOT the enumerated/withIndex form).
const some1 = A(`  const out = computed(() => xs().some(x => x > 3) ? "y" : "n")`)
const filter1 = A(`  const out = computed(() => String(xs().filter(x => x > 2).length))`)
// MULTI-statement predicate bodies. The parser stores these in `stmts` (body =
// empty sentinel); reading only `body` DROPPED them. Kotlin additionally needs a
// labeled `return@<method>` — a bare `return` in a lambda is prohibited.
const filterMulti = A(
  `  const out = computed(() => String(xs().filter((x, i) => { const keep = x > i; return keep }).length))`,
)
const someEarly = A(
  `  const out = computed(() => xs().some((x, i) => { if (x > i) { return true }; return false }) ? "y" : "n")`,
)

describe('P1 — array PREDICATE methods with a 2-param index callback (completes #1934)', () => {
  it('Swift: `.filter((el,idx))` → enumerated().filter{…}.map{ $0.element }', () => {
    expect(sw(filterIdx)).toContain('enumerated().filter')
    expect(sw(filterIdx)).toContain('.map({ $0.element })')
  })
  it('Swift: `.some((el,idx))` → enumerated().contains(where:)', () => {
    expect(sw(someIdx)).toContain('enumerated().contains(where:')
  })
  it('Swift: `.every((el,idx))` → enumerated().allSatisfy', () => {
    expect(sw(everyIdx)).toContain('enumerated().allSatisfy')
  })
  it('Swift: `.findIndex((el,idx))` → enumerated().first(where:)?.offset ?? -1', () => {
    expect(sw(findIdxIdx)).toContain('enumerated().first(where:')
    expect(sw(findIdxIdx)).toContain('?.offset ?? -1')
  })

  it('Kotlin: `.filter((el,idx))` → filterIndexed', () => {
    expect(kt(filterIdx)).toContain('filterIndexed')
  })
  it('Kotlin: `.some((el,idx))` → withIndex().any', () => {
    expect(kt(someIdx)).toContain('withIndex().any')
  })
  it('Kotlin: `.every((el,idx))` → withIndex().all', () => {
    expect(kt(everyIdx)).toContain('withIndex().all')
  })
  it('Kotlin: `.findIndex((el,idx))` → withIndex().firstOrNull{…}?.index ?: -1', () => {
    expect(kt(findIdxIdx)).toContain('withIndex().firstOrNull')
    expect(kt(findIdxIdx)).toContain('?.index ?: -1')
  })

  // Multi-statement predicate bodies — the whole-class fix (completes #1947 for
  // the sibling predicate methods): emit every statement, not just `cb.body`.
  it('Swift: multi-statement filter predicate emits the body (no silent drop)', () => {
    const code = sw(filterMulti)
    expect(code).toContain('let keep = x > i')
    expect(code).toContain('return keep')
    expect(code).not.toContain('in ""')
  })
  it('Kotlin: multi-statement filter predicate uses a LABELED return (return@filterIndexed)', () => {
    const code = kt(filterMulti)
    expect(code).toContain('val keep = x > i')
    // a bare `return` inside a lambda is prohibited — must be `return@filterIndexed`
    expect(code).toContain('return@filterIndexed keep')
    expect(code).not.toContain('-> ""')
  })
  it('Kotlin: an EARLY/nested return inside a predicate lambda is labeled (return@any)', () => {
    expect(kt(someEarly)).toContain('return@any')
  })

  // Controls — a 1-arg predicate must keep the plain form (the index emit must
  // NOT fire for a single-param callback).
  it('Swift/Kotlin: 1-arg `.some`/`.filter` keep the plain form (no index emit)', () => {
    expect(sw(some1)).not.toContain('enumerated()')
    expect(sw(filter1)).not.toContain('enumerated()')
    expect(kt(some1)).not.toContain('withIndex()')
    expect(kt(filter1)).not.toContain('filterIndexed')
  })

  // Compile proof — one component exercising all four index methods TYPECHECKS
  // against real SwiftUI / kotlinc.
  const proof = A(`  const evens = computed(() => xs().filter((x, i) => i % 2 === 0).length)
  const anyAtIndex = computed(() => xs().some((x, i) => i === x))
  const allGtIndex = computed(() => xs().every((x, i) => x > i))
  const firstBig = computed(() => xs().findIndex((x, i) => x > 3 && i > 0))
  const out = computed(() => String(evens()) + " " + String(anyAtIndex()) + " " + String(allGtIndex()) + " " + String(firstBig()))`)

  it.skipIf(!isSwiftUIAvailable())(
    'iOS: all four index methods + multi-statement bodies TYPECHECK against real SwiftUI',
    () => {
      for (const src of [proof, filterMulti, someEarly]) {
        const r = validateSwiftTypecheck(sw(src))
        expect(r.ok, r.error ?? '').toBe(true)
      }
    },
    180_000,
  )
  it.skipIf(!isKotlincAvailable())(
    'Android: the same components (incl. multi-statement + labeled returns) compile via kotlinc',
    () => {
      for (const src of [proof, filterMulti, someEarly]) {
        const r = validateKotlin(kt(src))
        expect(r.ok, r.error ?? '').toBe(true)
      }
    },
    180_000,
  )
})
