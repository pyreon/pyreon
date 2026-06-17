// Double-aware signal types — an EXPLICIT `signal<number>(12.5)` /
// `signal<number[]>([12.5, …])` generic bypasses inferTypeFromInitial (it
// only runs when there's no generic), so a fractional literal mis-emitted
// `Int = 12.5` / `[Int] = [12.5]` — INVALID Swift/Kotlin (an Int can't hold
// 12.5). The refineSignalNumberFloats post-pass refines the type to Double
// from the fractional-literal evidence; whole-number array elements are
// flagged float so they render `15.0` (Kotlin's List<Double> rejects a bare
// Int element). Strictly additive: integer signals/arrays stay Int.

import { describe, expect, it } from 'vitest'
import { parsePyreon } from '../parse'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const wrap = (decls: string): string =>
  `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  ${decls}
  return <Stack><Text>hi</Text></Stack>
}`

// One source exercising every shape — scalar fractional, all-fractional
// array, array with a whole number, and the int control cases.
const SRC = wrap(`const rate = signal<number>(12.5)
  const rates = signal<number[]>([12.5, 8.3])
  const mixed = signal<number[]>([12.5, 8.3, 15])
  const count = signal<number>(7)
  const counts = signal<number[]>([1, 2, 3])`)

describe('Double-aware signal number types — explicit-generic refinement', () => {
  it('parse: fractional scalar/array refine to float; whole-number array elements flagged; ints untouched', () => {
    const decls = parsePyreon(SRC, 'x.tsx').components[0]!.decls
    const sig = (name: string) => decls.find((d) => d.kind === 'signal' && d.name === name)!

    expect((sig('rate') as { type: unknown }).type).toEqual({ kind: 'number', float: true })
    expect((sig('rates') as { type: unknown }).type).toEqual({
      kind: 'array',
      element: { kind: 'number', float: true },
    })
    expect((sig('count') as { type: unknown }).type).toEqual({ kind: 'number' }) // Int — untouched
    expect((sig('counts') as { type: unknown }).type).toEqual({
      kind: 'array',
      element: { kind: 'number' }, // Int array — untouched
    })

    // The whole-number `15` in the fractional `mixed` array is flagged
    // float so it renders `15.0`.
    const mixed = sig('mixed') as { initial: { kind: string; elements: { value: number; float?: boolean }[] } }
    const fifteen = mixed.initial.elements.find((e) => e.value === 15)!
    expect(fifteen.float).toBe(true)
  })

  it('Swift: fractional → Double / [Double] (15 → 15.0); ints stay Int', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('var rate: Double = 12.5')
    expect(out).toContain('var rates: [Double] = [12.5, 8.3]')
    expect(out).toContain('var mixed: [Double] = [12.5, 8.3, 15.0]')
    expect(out).toContain('var count: Int = 7')
    expect(out).toContain('var counts: [Int] = [1, 2, 3]')
  })

  it('Kotlin: fractional → Double literals (15 → 15.0); ints stay Int', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('mutableStateOf(12.5)')
    expect(out).toContain('listOf(12.5, 8.3)')
    expect(out).toContain('listOf(12.5, 8.3, 15.0)')
    expect(out).toContain('mutableStateOf(7)')
    expect(out).toContain('listOf(1, 2, 3)')
  })

  // Baseline well-formedness on the real toolchains. NOTE these are NOT
  // the load-bearing guard for the Double refinement: `validateSwift` uses
  // `swiftc -parse` (SYNTAX only — it accepts `Int = 12.5`, the type
  // mismatch is a `-typecheck`/device-build error), and the Kotlin emit
  // carries no explicit `List<Double>` annotation (kotlinc infers a wider
  // type for a mixed `listOf(...)`), so BOTH pass even with the post-pass
  // disabled. The emit-string + parse specs above are the real bisect
  // guard. These specs guard against the emit producing SYNTACTICALLY
  // broken output (malformed `[Double] = […]` / `listOf(…)`).
  it.skipIf(!isSwiftcAvailable())('emitted Swift is well-formed (swiftc -parse)', () => {
    const result = validateSwift(transform(SRC, { target: 'swift' }).code)
    if (!result.ok) throw new Error(`swiftc rejected:\n${result.error}`)
    expect(result.ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('emitted Kotlin is well-formed (kotlinc)', () => {
    const result = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    if (!result.ok) throw new Error(`kotlinc rejected:\n${result.error}`)
    expect(result.ok).toBe(true)
  })
})
