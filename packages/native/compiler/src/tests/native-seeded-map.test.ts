// Seeded `new Map([[k, v], …])` lowers to a native dict literal — the mirror of
// the already-supported seeded `new Set([...])`.
//   Swift  → `["apple": 3, "pear": 2]`
//   Kotlin → `mutableMapOf("apple" to 3, "pear" to 2)`
// Key + value must be SCALAR (a native dict key needs Hashable; value held to
// the same scalar bar as the empty `new Map<K,V>()` form). Any other shape
// (non-pair element, non-scalar key/value, computed pair array) stays a NAMED
// warning — never a mis-emit. Verified end-to-end against real swiftc + kotlinc.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const P = '@pyreon/primitives'
const MAP = `
import { Stack, Text } from '${P}'
function App() {
  const prices = signal(new Map([["apple", 3], ["pear", 2]]))
  const n = computed(() => prices().get("apple") ?? 0)
  return (<Stack><Text>{String(n())}</Text></Stack>)
}
`
const bad = (seed: string) => `
import { Stack, Text } from '${P}'
function App() {
  const m = signal(new Map(${seed}))
  return (<Stack><Text>x</Text></Stack>)
}
`

describe('seeded new Map([[k,v],…]) → native dict literal', () => {
  it('Swift: emits a dict literal + inferred [K: V], no warning', () => {
    const r = transform(MAP, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('["apple": 3, "pear": 2]')
    expect(r.code).toContain('[String: Int]')
  })

  it('Kotlin: emits mutableMapOf(k to v), no warning', () => {
    const r = transform(MAP, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('mutableMapOf("apple" to 3, "pear" to 2)')
  })

  it('a non-pair element still WARNS (conservative)', () => {
    expect(transform(bad('[1, 2]'), { target: 'swift' }).warnings.some((w) => w.includes('seeded'))).toBe(true)
  })

  it('a non-scalar key still WARNS (no Hashable guarantee)', () => {
    expect(transform(bad('[[{a:1}, 2]]'), { target: 'swift' }).warnings.some((w) => w.includes('seeded'))).toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('typechecks against real SwiftUI stubs', () => {
    const r = validateSwiftWithStubs(transform(MAP, { target: 'swift' }).code)
    expect(r.ok, r.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('compiles against real Compose stubs', () => {
    const r = validateKotlin(transform(MAP, { target: 'kotlin' }).code)
    expect(r.ok, r.error).toBe(true)
  })
})
