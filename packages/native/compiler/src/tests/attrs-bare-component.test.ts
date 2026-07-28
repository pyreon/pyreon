// `attrs(Text)` — the form the library actually exposes — emitted
// uncompilable native code.
//
// `@pyreon/attrs` is documented as `attrs(component)` chainable, in its own
// README, in CLAUDE.md, and in the multiplatform styling table
// ("`attrs(Base).attrs({…})` ✅ — default-prop HOC"). The native parser accepted
// only `attrs({ component: Base })` — a config-object shape the runtime does
// not require and no document showed.
//
// The bare form fell through to the generic emit:
//
//   const Label = attrs(Text).attrs({ accessibilityLabel: 'labelled' })
//   →  private let Label = attrs(Text).attrs(__Obj0(accessibilityLabel: "labelled"))
//
// There is no `attrs` function in Swift or Kotlin, so the native build failed
// with "cannot find 'attrs' in scope" — and nothing warned. Anyone following
// the documented API got uncompilable output; only someone who had read the
// COMPILER's internal doc-comment would have written the shape that worked.
//
// Fixed by accepting both, rather than by warning that the documented API is
// unsupported. When the implementation and the documented API disagree and the
// API is reasonable, the implementation is what should move.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (defn: string) => `import attrs from '@pyreon/attrs'
import { Text } from '@pyreon/primitives'
${defn}
export function C(){ return (<Label>x</Label>) }`

const BARE = app(`const Label = attrs(Text).attrs({ accessibilityLabel: 'labelled' })`)
const CONFIG = app(`const Label = attrs({ component: Text }).attrs({ accessibilityLabel: 'labelled' })`)

describe('attrs() accepts a bare component', () => {
  it('lowers the DOCUMENTED bare form to the base primitive with its defaults', () => {
    expect(transform(BARE, { target: 'swift' }).code).toContain(
      'Text("x").accessibilityLabel("labelled")',
    )
  })

  it('emits no leftover `attrs(` passthrough — that was the bug', () => {
    // Stated separately from the assertion above: an emit could produce the
    // right Text AND still leave the uncompilable chain behind it.
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(BARE, { target }).code, target).not.toContain('attrs(')
    }
  })

  it('both call forms produce the SAME emit', () => {
    // The config form was the only one supported; it must keep working, and
    // the two must not drift into different lowerings.
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(BARE, { target }).code, target).toBe(
        transform(CONFIG, { target }).code,
      )
    }
  })

  it('warns about neither form', () => {
    for (const src of [BARE, CONFIG]) {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(transform(src, { target }).warnings ?? []).toEqual([])
      }
    }
  })

  it.skipIf(!isSwiftcAvailable())('the bare form type-checks on Swift', () => {
    const res = validateSwiftWithStubs(transform(BARE, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the bare form type-checks on Kotlin', () => {
    const res = validateKotlin(transform(BARE, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it('still warns for a NON-primitive base, in the bare form too', () => {
    // The existing guard must survive the new shape — a base with no native
    // primitive has to stay loud rather than silently unresolved.
    const src = `import attrs from '@pyreon/attrs'
import { Text } from '@pyreon/primitives'
const NotAPrimitive = () => null
const Label = attrs(NotAPrimitive).attrs({ accessibilityLabel: 'x' })
export function C(){ return (<Text>x</Text>) }`
    const w = transform(src, { target: 'swift' }).warnings ?? []
    expect(w.some((x) => x.includes('NotAPrimitive'))).toBe(true)
  })
})
