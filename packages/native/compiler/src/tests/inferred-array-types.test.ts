// Inferred array element types. `signal([12.5, 8.3])` (NO explicit
// generic) previously degraded to `Any`, which can't be iterated in a
// SwiftUI `ForEach` / Compose `items()` or fed to a typed reduce.
// `inferTypeFromInitial` now infers the element type from a homogeneous
// array literal — the inferred-generic sibling of the explicit-generic
// `signal<number[]>([…])` refinement. Mixed / empty / non-literal arrays
// stay `Any` (the safe degrade).

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

const SRC = wrap(`const ints = signal([1, 2, 3])
  const rates = signal([12.5, 8.3])
  const mixed_nums = signal([12.5, 8.3, 15])
  const names = signal(['x', 'y'])
  const flags = signal([true, false])
  const heterogeneous = signal([1, 'x'])`)

describe('Inferred array element types', () => {
  it('parse: homogeneous arrays infer typed elements; heterogeneous stays unknown', () => {
    const decls = parsePyreon(SRC, 'x.tsx').components[0]!.decls
    const t = (name: string) =>
      (decls.find((d) => d.kind === 'signal' && d.name === name) as { type: unknown }).type

    expect(t('ints')).toEqual({ kind: 'array', element: { kind: 'number' } })
    expect(t('rates')).toEqual({ kind: 'array', element: { kind: 'number', float: true } })
    expect(t('mixed_nums')).toEqual({ kind: 'array', element: { kind: 'number', float: true } })
    expect(t('names')).toEqual({ kind: 'array', element: { kind: 'string' } })
    expect(t('flags')).toEqual({ kind: 'array', element: { kind: 'boolean' } })
    expect(t('heterogeneous')).toEqual({ kind: 'unknown' }) // mixed → Any
  })

  it('Swift: typed arrays; Double promotes whole numbers (15 → 15.0); mixed → Any', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('var ints: [Int] = [1, 2, 3]')
    expect(out).toContain('var rates: [Double] = [12.5, 8.3]')
    expect(out).toContain('var mixed_nums: [Double] = [12.5, 8.3, 15.0]')
    expect(out).toContain('var names: [String] = ["x", "y"]')
    expect(out).toContain('var flags: [Bool] = [true, false]')
    expect(out).toContain('var heterogeneous: Any = [1, "x"]')
  })

  it('Kotlin: typed lists; Double promotes whole numbers (15 → 15.0)', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('listOf(1, 2, 3)')
    expect(out).toContain('listOf(12.5, 8.3)')
    expect(out).toContain('listOf(12.5, 8.3, 15.0)')
    expect(out).toContain('listOf("x", "y")')
    expect(out).toContain('listOf(true, false)')
  })

  it('empty array degrades to unknown (no false inference)', () => {
    const decls = parsePyreon(wrap(`const e = signal([])`), 'x.tsx').components[0]!.decls
    const e = decls.find((d) => d.kind === 'signal' && d.name === 'e') as { type: unknown }
    expect(e.type).toEqual({ kind: 'unknown' })
  })

  // Baseline well-formedness on the real toolchains (NOT the load-bearing
  // guard — `swiftc -parse` is syntax-only and the Kotlin `listOf(...)`
  // type is inferred, so both pass even without the fix; the parse +
  // emit-string specs above are the real guard).
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
