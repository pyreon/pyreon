// Zero-silent-drops (P1) — a component-level value-const (`const pageSize = 2` /
// `const steps = ["a","b","c"]`) referenced from a COMPUTED or a HANDLER failed
// on Swift. Value-consts emit as body-local `let`s in the ViewBuilder, which a
// struct-level computed property AND a `private func` handler both sit OUTSIDE.
// Surfaced by compiling realistic data-table + wizard apps end-to-end.
//
// Two distinct sub-gaps, both closed here (Swift-only — Kotlin's const `val`,
// `derivedStateOf` computed, and handler lambdas all live in the same Composable
// body, so it always saw the const):
//
//  PART A — TYPE. A computed referencing a value-const inferred `Any` because
//    value-consts were never seeded into the inference ctx (`inferType(pageSize)`
//    → unknown). Swift then emits `private var x: Any { … }`, and a downstream
//    `String(x())` fails ("no exact matches in call to initializer"). Fixed by a
//    persistent `valueConsts` map in `InferenceCtx`, populated in `buildInferenceCtx`
//    (Pass 1.5) and checked in `inferType`'s identifier case.
//
//  PART B — SCOPE. A handler referencing a value-const (`if step < steps.length`)
//    emitted a bare `steps`, but `let steps = …` is a body-local in the ViewBuilder
//    → "cannot find 'steps' in scope". Fixed by inlining value-consts into handler
//    bodies (`emitSwiftFunction` named + `emitSwiftAction` inline) — the same inline
//    the struct-level computed path already uses.
//
// Bisect-load-bearing at TWO points:
//   • neuter the `valueConsts` lookup in `inferType` (infer-type.ts identifier
//     case) → Part-A computed re-annotates `Any`; the Part-A spec + compile proofs fail.
//   • neuter the handler inline in `emitSwiftFunction` → the handler emits bare
//     `steps` again; the Part-B spec + wizard proof fail.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

// PART A — a FLOAT value-const in a type-sensitive computed. Without the
// inference seed, `factor` is unknown → the binary infers `Int`, but the emit is
// `Double(rows.count) * (2.5)` (a Double) → Swift rejects assigning it to the
// `Int`-annotated computed ("cannot convert value of type 'Double' to 'Int'").
// The seed types `factor` as Double, so the computed annotates `Double`. (An
// INTEGER const isn't load-bearing here — the binary recovers `number` from the
// `.length` operand alone; the float case is where the const's type is decisive.)
const partA = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const rows = signal<number[]>([1, 2, 3])
  const factor = 2.5
  const scaled = computed(() => rows().length * factor)
  return (<Stack><Text>{String(scaled())}</Text></Stack>)
}`

// PART B — an array value-const referenced from a HANDLER (`steps.length`).
const partB = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App(){
  const step = signal(0)
  const steps = ["a", "b", "c"]
  const title = computed(() => steps[step()])
  const next = () => { if (step() < steps.length - 1) { step.set(step() + 1) } }
  return (<Stack><Text>{title}</Text><Button onPress={next}>Next</Button></Stack>)
}`

describe('P1 — component-level value-const referenced from a computed / handler (Swift)', () => {
  // PART A — the FLOAT const makes the computed type Double (not Int/Any).
  it('Swift: a float value-const in a computed types it Double (not Int)', () => {
    const code = sw(partA)
    expect(code).toContain('private var scaled: Double')
    expect(code).not.toContain('scaled: Int')
  })

  // PART B — the handler INLINES the const array (so it isn't a dangling
  // reference to the body-local `let`).
  it('Swift: a value-const in a handler is inlined (no bare `steps` reference)', () => {
    const code = sw(partB)
    const nextFn = code.split('func next')[1]?.split('\n  }')[0] ?? ''
    expect(nextFn).toContain('["a"') // the array literal was inlined
    expect(nextFn).not.toContain('steps.count') // NOT a bare (out-of-scope) reference
  })

  // MUTATION-SAFETY carve-out — a REASSIGNED binding (`let nextId = 1;
  // nextId++`) is not a true const, so it must NOT be inlined (substituting its
  // initial value would emit the broken `(1) += 1`). It stays read-by-name; only
  // the immutable `steps` in the same component inlines.
  const mutated = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const items = signal<number[]>([])
  let nextId = 1
  const steps = ["a", "b", "c"]
  const add = () => { items.set([...items(), nextId++]) }
  const reset = () => { if (steps.length > 0) { items.set([]) } }
  return (<Stack><Text>x</Text></Stack>)
}`
  it('Swift: a reassigned `let` counter is NOT inlined (stays by-name)', () => {
    const code = sw(mutated)
    expect(code).toContain('nextId += 1') // by name — the mutation is preserved
    expect(code).not.toContain('(1) += 1') // NOT the broken inlined-initial form
    // …while an immutable const in the SAME component still inlines into a handler.
    const resetFn = code.split('func reset')[1]?.split('\n  }')[0] ?? ''
    expect(resetFn).toContain('["a"')
  })

  // Kotlin was always fine (same-body scope + derivedStateOf inference) — lock it
  // so a future Swift-shaped change can't accidentally regress Kotlin.
  it('Kotlin: both shapes compile unchanged', () => {
    expect(kt(partA)).toContain('factor')
    expect(kt(partB)).toContain('steps')
  })

  // Compile proofs — Part A + Part B in isolation, plus a realistic WIZARD
  // (component-array-const in a computed AND two handlers).
  const wizard = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Inline, Text, Field, Button } from '@pyreon/primitives'
export function Wizard(){
  const step = signal(0)
  const name = signal("")
  const email = signal("")
  const steps = ["Name", "Email", "Review"]
  const stepTitle = computed(() => steps[step()])
  const isLast = computed(() => step() === steps.length - 1)
  const next = () => { if (step() < steps.length - 1) { step.set(step() + 1) } }
  const back = () => { if (step() > 0) { step.set(step() - 1) } }
  return (<Stack gap="md">
    <Text>{stepTitle}</Text>
    <Field value={name()} onChangeText={(v: string) => name.set(v)} />
    <Field value={email()} onChangeText={(v: string) => email.set(v)} />
    <Inline gap="sm">
      <Button onPress={back}>Back</Button>
      <Button onPress={next}>Next</Button>
    </Inline>
  </Stack>)
}`

  it.skipIf(!isSwiftUIAvailable())('iOS: value-const shapes + a realistic wizard TYPECHECK', () => {
    for (const src of [partA, partB, wizard]) {
      const r = validateSwiftTypecheck(sw(src))
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
  it.skipIf(!isKotlincAvailable())('Android: the same shapes compile via kotlinc', () => {
    for (const src of [partA, partB, wizard]) {
      const r = validateKotlin(kt(src))
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
})
