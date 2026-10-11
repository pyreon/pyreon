// Field access on an inline object literal (`({ count: …, label: … }).count`)
// — was a silent `Any`-annotation mis-emit on Swift.
//
// `inferType`'s member case resolved a field access when the object's inferred
// type was `{kind:'object'}` or a declared `typeRef`, but an INLINE object
// literal infers `unknown` (there is no general `expr.kind === 'object'`
// inference case — deliberately, because a nameless literal has no struct NAME
// for an annotation, only field TYPES). So `({ count: nums().length, label:
// s() }).count` degraded the computed to `Any`: the emit `(__Obj0(…)).count` is
// a valid Swift Int expression, but the `private var out: Any` annotation fails
// swiftc the moment it's consumed (`String(out())`). Warning-free +
// uncompilable = a silent mis-emit.
//
// The fix resolves the field's type DIRECTLY from the literal's own fields
// (unwrapping the `paren` node `({…})` wraps it in), so `out` annotates `Int`
// / `String` without needing the struct name. A SPREAD object literal
// (`{ ...base, y }`) bails (can't field-type without the spread's type) — it
// stays the safe `Any`, unchanged. This does NOT cover the intermediate-const
// form (`const o = {…}; return o.count`) — that needs multi-statement dataflow.
//
// Bisect-verified by reverting the object-literal branch — the annotation
// re-degrades to `Any` and swiftc rejects.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
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

describe('object-literal field access — typed annotation (was a silent `Any` mis-emit)', () => {
  it('`({count, label}).count` → `out: Int` (not `Any`)', () => {
    const rs = transform(W(`  const out = computed(() => ({ count: nums().length, label: s() }).count)`), {
      target: 'swift',
    })
    expect(rs.code).toContain('out: Int')
    expect(rs.code).not.toContain('out: Any')
    expect(rs.warnings ?? []).toHaveLength(0)
  })

  it('`({count, label}).label` → `out: String`', () => {
    const rs = transform(W(`  const out = computed(() => ({ count: nums().length, label: s() }).label)`), {
      target: 'swift',
    })
    expect(rs.code).toContain('out: String')
  })

  it('float field `({price: 1.5}).price` → `out: Double`', () => {
    const rs = transform(W(`  const out = computed(() => ({ price: 1.5, qty: 2 }).price)`), {
      target: 'swift',
    })
    expect(rs.code).toContain('out: Double')
  })

  it('control — a SPREAD object literal bails (stays `Any`, not a wrong type)', () => {
    const rs = transform(
      W(`  const base = signal({ x: 1 })\n  const out = computed(() => ({ ...base(), y: 2 }).y)`),
      { target: 'swift' },
    )
    // The fix must NOT type this (spread's contribution is unknown here); it
    // stays the safe `Any` — unchanged pre-existing behaviour, no regression.
    expect(rs.code).toContain('out: Any')
  })

  describe.skipIf(!isSwiftUIAvailable())('swiftc-typechecks', () => {
    for (const [name, body] of [
      ['.count', `  const out = computed(() => ({ count: nums().length, label: s() }).count)`],
      ['.label', `  const out = computed(() => ({ count: nums().length, label: s() }).label)`],
      ['float .price', `  const out = computed(() => ({ price: 1.5, qty: 2 }).price)`],
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
      ['.count', `  const out = computed(() => ({ count: nums().length, label: s() }).count)`],
      ['.label', `  const out = computed(() => ({ count: nums().length, label: s() }).label)`],
    ] as const) {
      it(`${name}`, () => {
        const rs = transform(W(body), { target: 'kotlin' })
        const r = validateKotlin(rs.code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })
})
