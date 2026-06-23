// Object literals with NON-LITERAL fields → struct/data-class synthesis
// (type-inference widening, both targets).
//
// `synthLiteralStructName` previously synthesized a struct ONLY when every
// field was a scalar LITERAL (`{ id: 1, name: 'a' }`); a non-literal field
// (`{ id: count(), name: label() }` — signal reads) bailed to the labelled-
// tuple fallback. That fallback is broken for this shape on BOTH targets:
//
//   Swift:  `var obj: Any { (id: count, name: label) }`  — `obj.name` can't
//           be accessed on an `Any`-typed (or single-field-illegal) tuple.
//   Kotlin: `(id = count, name = label)`                  — NOT valid Kotlin
//           at all (named args exist only in CALLS, not as a bare expr).
//
// Now the shared helper accepts an `inferField` callback and types a non-
// literal field via `inferType` when it resolves to a SCALAR
// (number / string / boolean). So `{ id: count(), name: label(), active: f() }`
// synthesizes `__Obj0(id: Int, name: String, active: Bool)` on both targets.
//
// Verification rungs (honest):
//  - Kotlin: full `kotlinc` semantic typecheck (this was invalid Kotlin
//    syntax before — a real correctness fix, proven to the kotlinc rung).
//  - Swift: `swiftc -parse` (the harness rung — parse-only, NO semantic
//    analysis) + emit-shape (struct synthesized, `__Obj0(...)` not a tuple).
//    NOT typecheck-proven: the harness can't typecheck a View struct
//    standalone (it needs the PyreonReactivity runtime in scope). The Swift
//    struct synthesis is byte-aligned with the Kotlin one (shared helper),
//    which IS typecheck-proven.
//
// Scope (deliberate): only scalar-inferred fields synthesize — an array /
// nested-object / typeRef field still bails to the tuple (the lossy shapeKey
// can't distinguish them). The Swift computed-over-object case additionally
// needs an explicit struct return-type annotation (Swift computed properties
// can't infer) — a documented follow-up; this PR fixes the value-const / For
// / prop Swift positions (where `let` / params infer the type) and the FULL
// Kotlin object-literal-in-computed case (Kotlin infers `derivedStateOf<T>`).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const count = signal<number>(5)
  const label = signal<string>("hi")
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('object literal with non-literal scalar fields → struct synthesis', () => {
  it('Swift: synthesizes a struct (not an Any-tuple) for non-literal fields', () => {
    const out = transform(
      app(`  const p = { id: count(), name: label(), active: true }`),
      { target: 'swift' },
    ).code
    // A struct is declared with the inferred field types …
    expect(out).toMatch(/struct __Obj0[^{]*\{/)
    expect(out).toContain('id')
    expect(out).toContain('name')
    // … and the value uses the struct initializer (NOT a bare labelled
    // tuple — the `__Obj0` prefix is what distinguishes the two forms).
    expect(out).toContain('__Obj0(id: count, name: label, active: true)')
  })

  it('Kotlin: synthesizes a typed data class for non-literal fields', () => {
    const out = transform(
      app(`  const obj = computed(() => ({ id: count(), name: label() }))`),
      { target: 'kotlin' },
    ).code
    // Inferred field types (count→Int, label→String).
    expect(out).toMatch(/data class __Obj0\(var id: Int, var name: String\)/)
    expect(out).toContain('__Obj0(id = count, name = label)')
  })

  it('an all-literal object still synthesizes (no regression to the prior path)', () => {
    const out = transform(app(`  const p = { id: 1, name: "a" }`), { target: 'swift' }).code
    expect(out).toMatch(/struct __Obj0/)
    expect(out).toContain('__Obj0(id: 1, name: "a")')
  })

  it('a non-SCALAR-inferred field still falls back to the tuple (no over-reach)', () => {
    // `tags: arr()` infers to an array → NOT a scalar → bail to tuple.
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const arr = signal<number[]>([1, 2])
  const count = signal<number>(5)
  const p = { id: count(), tags: arr() }
  return (<Stack><Text>x</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    // No struct synthesized for the mixed scalar+array shape; tuple kept.
    expect(out).not.toContain('__Obj0(id: count, tags: arr)')
    expect(out).toContain('(id: count, tags: arr)')
  })

  it.skipIf(!isKotlincAvailable())(
    'Kotlin: object-literal-in-computed typechecks via kotlinc (was invalid syntax)',
    () => {
      const out = transform(
        app(`  const obj = computed(() => ({ id: count(), name: label(), active: true }))
  const shown = computed(() => obj().name)`),
        { target: 'kotlin' },
      ).code
      const res = validateKotlin(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )

  it.skipIf(!isKotlincAvailable())(
    'Kotlin: value-const object literal typechecks via kotlinc',
    () => {
      const out = transform(
        app(`  const p = { id: count(), name: label(), active: true }`),
        { target: 'kotlin' },
      ).code
      const res = validateKotlin(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )

  it.skipIf(!isSwiftcAvailable())(
    'Swift: synthesized-struct emit parses via swiftc -parse (no syntax regression)',
    () => {
      const out = transform(
        app(`  const p = { id: count(), name: label(), active: true }`),
        { target: 'swift' },
      ).code
      const res = validateSwift(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )
})
