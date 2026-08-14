// Nested anonymous-object literals synthesize NESTED structs/data-classes.
//
// The flat case (`signal({ id: 1, name: 'x' })`) already synthesized a struct.
// A NESTED anonymous object used to degrade: the outer object became a tuple
// typed `Any` on Swift and an invalid `(name = …)` on Kotlin. Now every level
// of an all-scalar-leaf object literal (and arrays of them) gets its own
// synthesized struct named `Parent` + capitalized-field (`CProfile` +
// `meta` → `CProfileMeta`), so the whole shape compiles to native.
//
// Verified END-TO-END: the emit type-checks against the real SwiftUI stubs
// (`swiftc`) + the Compose stubs (`kotlinc`).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const P = '@pyreon/primitives'
const swift = (s: string) => transform(s, { target: 'swift' })
const kotlin = (s: string) => transform(s, { target: 'kotlin' })

const NESTED = `
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '${P}'
export function C() {
  const profile = signal({ name: 'Ada', meta: { age: 36, active: true } })
  return (<Stack><Text>{profile().name}</Text></Stack>)
}
`

const ARR_OF_NESTED = `
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '${P}'
export function C() {
  const rows = signal([{ id: 1, sub: { label: 'a' } }])
  return (<Stack><Text>{rows()[0].sub.label}</Text></Stack>)
}
`

const FLAT = `
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '${P}'
export function C() {
  const u = signal({ id: 1, name: 'Ada' })
  return (<Stack><Text>{u().name}</Text></Stack>)
}
`

describe('nested anonymous-object → struct synthesis', () => {
  it('Swift: a nested object field gets its own synthesized struct (Parent + field)', () => {
    const r = swift(NESTED)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('struct CProfile: Codable {')
    expect(r.code).toContain('var meta: CProfileMeta')
    expect(r.code).toContain('struct CProfileMeta: Codable {')
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it('Kotlin: a nested object field gets its own synthesized data class', () => {
    const r = kotlin(NESTED)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('CProfileMeta')
    const v = validateKotlin(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it('array-of-nested-objects synthesizes the element + its nested struct (both targets)', () => {
    const s = swift(ARR_OF_NESTED)
    const k = kotlin(ARR_OF_NESTED)
    expect(s.warnings).toEqual([])
    expect(k.warnings).toEqual([])
    expect(s.code).toContain('var sub: CRowSub')
    expect(s.code).toContain('struct CRowSub: Codable {')
    expect(validateSwiftWithStubs(s.code).ok, validateSwiftWithStubs(s.code).error).toBe(true)
    expect(validateKotlin(k.code).ok, validateKotlin(k.code).error).toBe(true)
  })

  it('control: the FLAT case still synthesizes a single struct (no regression)', () => {
    const s = swift(FLAT)
    expect(s.warnings).toEqual([])
    expect(s.code).toContain('struct CU: Codable {') // flat still works (C + binding `u`)
    expect(validateSwiftWithStubs(s.code).ok).toBe(true)
    expect(validateKotlin(kotlin(FLAT).code).ok).toBe(true)
  })
})
