// Nested-array signal inference (`signal([[1, 2], [3, 4]])`) — was a silent
// `Any`-annotation mis-emit on Swift.
//
// `inferTypeFromInitial` inferred a signal's type from its literal for scalar
// arrays (`[1, 2]` → `[Int]`) and flat-object arrays (`[{id:1}]` → `[Struct]`),
// but had NO case for an array of ARRAYS — so `signal([[1, 2], [3, 4]])`
// degraded to `Any`. The emitted VALUE was valid Swift (`[[1, 2], [3, 4]]`) but
// the `@State private var grid: Any` annotation fails swiftc, and any
// downstream `grid()[0][1]` read then also degrades to `Any`. Warning-free +
// uncompilable = a silent mis-emit.
//
// The fix recurses `inferTypeFromInitial` on the first inner array (matching the
// object case's first-element convention), so `[[1,2]]` → `[[Int]]`, `[[[1]]]`
// → `[[[Int]]]`, `[["a"]]` → `[[String]]`. A fractional leaf flags EVERY nested
// integer literal float (`[[1.5],[2]]` → `[[Double]] = [[1.5], [2.0]]`) so
// Kotlin's `List<List<Double>>` accepts it. Swift-only in effect — Kotlin infers
// `List<List<…>>` on its own; these specs assert BOTH targets typecheck.
//
// Bisect-verified by reverting the `els.every(e => e.kind === 'array')` case —
// the annotation re-degrades to `Any` and swiftc rejects.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const W = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
${body}
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`

describe('nested-array signal inference — typed annotation (was a silent `Any` mis-emit)', () => {
  it('int grid `signal([[1,2],[3,4]])` → `[[Int]]` (not `Any`), swiftc-clean', () => {
    const rs = transform(W(`  const grid = signal([[1,2],[3,4]])\n  const out = computed(() => grid()[0][1])`), {
      target: 'swift',
    })
    expect(rs.code).toContain('grid: [[Int]]')
    expect(rs.code).not.toContain('grid: Any')
    expect(rs.warnings ?? []).toHaveLength(0)
  })

  it('string matrix → `[[String]]`', () => {
    const rs = transform(W(`  const m = signal([["a","b"],["c"]])\n  const out = computed(() => m()[0][1])`), {
      target: 'swift',
    })
    expect(rs.code).toContain('m: [[String]]')
  })

  it('3D nesting `signal([[[1]]])` → `[[[Int]]]` (recursive)', () => {
    const rs = transform(W(`  const cube = signal([[[1]]])\n  const out = computed(() => cube()[0][0][0])`), {
      target: 'swift',
    })
    expect(rs.code).toContain('cube: [[[Int]]]')
  })

  it('fractional nested `[[1.5],[2]]` → `[[Double]]` with EVERY int flagged (2 → 2.0)', () => {
    const rs = transform(W(`  const g = signal([[1.5],[2]])\n  const out = computed(() => g()[0][0])`), {
      target: 'swift',
    })
    expect(rs.code).toContain('g: [[Double]]')
    expect(rs.code).toContain('[[1.5], [2.0]]')
  })

  it('control — flat `signal([1,2,3])` still `[Int]` (unchanged)', () => {
    const rs = transform(W(`  const xs = signal([1,2,3])\n  const out = computed(() => xs()[0])`), {
      target: 'swift',
    })
    expect(rs.code).toContain('xs: [Int]')
    expect(rs.code).not.toContain('xs: [[')
  })

  describe.skipIf(!isSwiftUIAvailable())('swiftc-typechecks', () => {
    for (const [name, body] of [
      ['int grid', `  const grid = signal([[1,2],[3,4]])\n  const out = computed(() => grid()[0][1])`],
      ['string matrix', `  const m = signal([["a","b"],["c"]])\n  const out = computed(() => m()[0][1])`],
      ['3D', `  const cube = signal([[[1]]])\n  const out = computed(() => cube()[0][0][0])`],
      ['fractional', `  const g = signal([[1.5],[2]])\n  const out = computed(() => g()[0][0])`],
    ] as const) {
      it(`${name}`, () => {
        const rs = transform(W(body), { target: 'swift' })
        const r = validateSwiftTypecheck(rs.code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc-typechecks', () => {
    for (const [name, body] of [
      ['int grid', `  const grid = signal([[1,2],[3,4]])\n  const out = computed(() => grid()[0][1])`],
      ['fractional', `  const g = signal([[1.5],[2]])\n  const out = computed(() => g()[0][0])`],
    ] as const) {
      it(`${name}`, () => {
        const rs = transform(W(body), { target: 'kotlin' })
        const r = validateKotlin(rs.code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })
})
