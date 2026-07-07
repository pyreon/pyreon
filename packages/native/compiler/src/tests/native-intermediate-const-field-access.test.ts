// Field access on a body-local object-literal const in a computed
// (`const o = { count: … }; return o.count`) — was a silent `Any`-annotation
// mis-emit on Swift. This is the COMMON `const o = compute(); return o.field`
// shape; extends the field-access-on-object-producing-expr class (inline
// literal + ternary) to the intermediate-const form.
//
// `findFirstReturnExpr` already seeds a computed body's locals into the infer
// ctx (`ctx.locals`), but an object-literal initializer infers `unknown` (the
// deliberate no-general-object-literal-inference case — a nameless literal has
// no struct NAME for an annotation), so `o` was seeded `unknown` and `o.count`
// couldn't resolve → the computed degraded to `Any`.
//
// The fix ALSO records object-literal consts in `ctx.objectLocals` (keyed by
// name → the literal), and the member case resolves `o.count` from the recorded
// literal's fields — WITHOUT changing `o`'s own type in `locals`. So a bare
// `return o` (returning the whole local object) is UNCHANGED (still `Any`, not a
// new tuple emit); only a FIELD access newly resolves.
//
// Bisect-verified by reverting the `objLit.kind === 'identifier'` /
// `ctx.objectLocals` branch — the annotation re-degrades to `Any`.

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

describe('intermediate-const object-field access — typed annotation (was a silent `Any` mis-emit)', () => {
  it('`const o = {count, label}; return o.count` → `out: Int` (not `Any`)', () => {
    const rs = transform(
      W(`  const out = computed(() => { const o = { count: nums().length, label: s() }; return o.count })`),
      { target: 'swift' },
    )
    expect(rs.code).toContain('out: Int')
    expect(rs.code).not.toContain('out: Any')
    expect(rs.warnings ?? []).toHaveLength(0)
  })

  it('`return o.label` → `out: String`', () => {
    const rs = transform(
      W(`  const out = computed(() => { const o = { count: nums().length, label: s() }; return o.label })`),
      { target: 'swift' },
    )
    expect(rs.code).toContain('out: String')
  })

  it('control — a bare `return o` (whole local object) stays `Any` (unchanged, no tuple regression)', () => {
    const rs = transform(
      W(`  const out = computed(() => { const o = { count: nums().length }; return o })`),
      { target: 'swift' },
    )
    // The fix resolves FIELD access only; `o`'s own type is untouched → the
    // computed stays `Any` (the deliberate no-nameless-object-annotation rule).
    expect(rs.code).toContain('out: Any')
  })

  describe.skipIf(!isSwiftUIAvailable())('swiftc-typechecks', () => {
    for (const [name, body] of [
      ['.count', `  const out = computed(() => { const o = { count: nums().length, label: s() }; return o.count })`],
      ['.label', `  const out = computed(() => { const o = { count: nums().length, label: s() }; return o.label })`],
    ] as const) {
      it(`${name}`, () => {
        const rs = transform(W(body), { target: 'swift' })
        const r = validateSwiftTypecheck(rs.code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc-typechecks', () => {
    it('.count', () => {
      const rs = transform(
        W(`  const out = computed(() => { const o = { count: nums().length, label: s() }; return o.count })`),
        { target: 'kotlin' },
      )
      const r = validateKotlin(rs.code)
      expect(r.ok, r.error?.slice(0, 300)).toBe(true)
    })
  })
})
