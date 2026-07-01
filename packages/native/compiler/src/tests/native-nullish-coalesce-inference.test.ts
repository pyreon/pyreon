// Zero-silent-drops (P1) — `a ?? b` (nullish-coalescing) result-type inference.
//
// `inferType`'s `logical`/`??` case was `inferType(left) ?? inferType(right)` —
// a JS `??` on the two inferred TypeIRs. But `inferType` NEVER returns
// null/undefined (its floor is `{ kind: 'unknown' }`), so the JS `??` ALWAYS
// took the LEFT result — INCLUDING its optional (`T | undefined`) branch. So the
// idiomatic optional-consumption shape `nums().at(-1) ?? 0` typed the computed
// `Int?` instead of `Int`, and CONSUMING it — `String(out())`, arithmetic, any
// typed position — failed on Swift ("value of optional type 'Int?' must be
// unwrapped to a value of type 'Int'"). This hit the whole optional family:
// `.at()`, `.find()`, `.findLast()`, `fetch.data() ?? []`, an optional `?? def`.
//
// The fix mirrors the real `a ?? b` semantics (`NonNullable<a> | b`): infer the
// left, UNWRAP its optional branch (`unwrapOptionalType`), and return that when
// it's a concrete non-optional type; otherwise fall back to the right (the
// literal fallback carries the type — `data() ?? []` → the `[]` array type).
//
// `.at()` itself already lowered (a bounds-checked optional); the BUG was the
// sibling `??` inference, not `.at()`. Consuming `.at(-1)` WITHOUT a fallback
// via `String()` is still a genuine optional-consumption error on Swift (as in
// JS `String(undefined)`); the idiomatic `?? fallback` is what's fixed here.
//
// Bisect-load-bearing: neuter the `??` branch back to `return inferType(left)`
// → the computed re-types `Int?` and the annotation + compile proofs fail; the
// `str ?? str` regression control (non-optional left) stays green throughout.

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
  const nums = signal<number[]>([10, 20, 30])
${body}
  return (<Stack><Text>{out}</Text></Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

// Returned DIRECTLY (not String-wrapped) so the computed's annotation IS the
// `?? ` result type — `Int` when the optional collapses, `Int?` when it doesn't.
const atFallback = A(`  const out = computed(() => nums().at(-1) ?? 0)`)
const findFallback = A(`  const out = computed(() => nums().find((n: number) => n > 15) ?? 0)`)
// Regression control — a NON-optional left: `?? "no"` never fires; result stays
// `String`. Unwrapping a non-union returns it unchanged, so this is unaffected.
const strFallback = A(`  const out = computed(() => (nums().length > 0 ? "yes" : undefined) ?? "no")`)

describe('P1 — `a ?? b` nullish-coalescing result-type inference', () => {
  it('Swift: `.at(-1) ?? 0` infers `Int` (not `Int?`)', () => {
    expect(sw(atFallback)).toContain('var out: Int {')
    expect(sw(atFallback)).not.toContain('var out: Int? {')
  })
  it('Swift: `.find(...) ?? 0` infers `Int` (not `Int?`)', () => {
    expect(sw(findFallback)).toContain('var out: Int {')
    expect(sw(findFallback)).not.toContain('var out: Int? {')
  })
  it('Swift: a non-optional left `?? "no"` stays `String` (regression)', () => {
    expect(sw(strFallback)).toContain('var out: String {')
  })

  // Compile proof — `.at() ?? fallback` and `.find() ?? fallback` consumed by
  // String() + arithmetic in one component TYPECHECK against real SwiftUI /
  // kotlinc (the optional is genuinely collapsed, not just annotated).
  const proof = A(`  const last = computed(() => nums().at(-1) ?? 0)
  const firstBig = computed(() => nums().find((n: number) => n > 15) ?? -1)
  const sum = computed(() => last() + firstBig())
  const out = computed(() => String(last()) + " " + String(firstBig()) + " " + String(sum()))`)

  it.skipIf(!isSwiftUIAvailable())('iOS: `.at()`/`.find()` `?? fallback` TYPECHECK against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Object fallback — `.find(...) ?? { … }` resolves the object type so a
  // downstream field read typechecks (both targets).
  const objProof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Row = { id: number; label: string }
export function App(){
  const rows = signal<Row[]>([{ id: 1, label: "a" }])
  const picked = computed(() => rows().find((r: Row) => r.id === 1) ?? { id: 0, label: "none" })
  const out = computed(() => picked().label)
  return (<Stack><Text>{out}</Text></Stack>)
}`
  it.skipIf(!isSwiftUIAvailable())('iOS: `.find(...) ?? { … }` resolves the object type for a field read', () => {
    const r = validateSwiftTypecheck(sw(objProof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: object-fallback compiles via kotlinc', () => {
    const r = validateKotlin(kt(objProof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
