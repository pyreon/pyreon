// Field access on a TERNARY of two object literals (`(cond ? {v:1} : {v:2}).v`)
// — was a silent `Any`-annotation mis-emit on Swift. Completes the
// "field-access on an object-producing expression" class that the
// object-literal case (native-object-literal-field-access) opened.
//
// `inferType`'s member case resolves a field access on an object-literal or
// struct/typeRef operand, but a TERNARY operand infers `unknown` — so
// `(nums().length > 0 ? { v: 1 } : { v: 2 }).v` degraded the computed to `Any`.
// The emit `(cond ? __Obj0(v:1) : __Obj0(v:2)).v` is a valid Int expression
// (both branches synthesize the SAME struct), but the `private var out: Any`
// annotation fails swiftc once consumed (`String(out())`).
//
// The fix resolves the field's type from a branch (paren-unwrapping each), and
// only when the field exists in BOTH branches — a MIXED ternary (different
// fields per branch) bails to the safe `Any` (unchanged). No struct name is
// needed, only the field's type.
//
// Bisect-verified by reverting the `objLit.kind === 'ternary'` branch — the
// annotation re-degrades to `Any` and swiftc rejects.

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
  const nums = signal<number[]>([1,2,3])
  const s = signal<string>("hi")
${body}
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`

describe('ternary-of-objects field access — typed annotation (was a silent `Any` mis-emit)', () => {
  it('`(cond ? {v:1} : {v:2}).v` → `out: Int` (not `Any`)', () => {
    const rs = transform(W(`  const out = computed(() => (nums().length > 0 ? { v: 1 } : { v: 2 }).v)`), {
      target: 'swift',
    })
    expect(rs.code).toContain('out: Int')
    expect(rs.code).not.toContain('out: Any')
    expect(rs.warnings ?? []).toHaveLength(0)
  })

  it('string field `(cond ? {label: s()} : {label: "x"}).label` → `out: String`', () => {
    const rs = transform(
      W(`  const out = computed(() => (nums().length > 0 ? { label: s() } : { label: "x" }).label)`),
      { target: 'swift' },
    )
    expect(rs.code).toContain('out: String')
  })

  it('control — a MIXED ternary (field only in one branch) bails to `Any`', () => {
    const rs = transform(W(`  const out = computed(() => (nums().length > 0 ? { v: 1 } : { w: 2 }).v)`), {
      target: 'swift',
    })
    // `.v` is not in BOTH branches → the fix must NOT type it; stays the safe
    // `Any` (unchanged pre-existing behaviour).
    expect(rs.code).toContain('out: Any')
  })

  describe.skipIf(!isSwiftUIAvailable())('swiftc-typechecks', () => {
    for (const [name, body] of [
      ['.v Int', `  const out = computed(() => (nums().length > 0 ? { v: 1 } : { v: 2 }).v)`],
      ['.label String', `  const out = computed(() => (nums().length > 0 ? { label: s() } : { label: "x" }).label)`],
    ] as const) {
      it(`${name}`, () => {
        const rs = transform(W(body), { target: 'swift' })
        const r = validateSwiftTypecheck(rs.code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc-typechecks', () => {
    it('.v Int', () => {
      const rs = transform(W(`  const out = computed(() => (nums().length > 0 ? { v: 1 } : { v: 2 }).v)`), {
        target: 'kotlin',
      })
      const r = validateKotlin(rs.code)
      expect(r.ok, r.error?.slice(0, 300)).toBe(true)
    })
  })
})
