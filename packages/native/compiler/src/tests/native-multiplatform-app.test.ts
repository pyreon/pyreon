// "One code, runs everywhere" — a realistic canonical TodoMVC app (signals +
// computed + filter/map/spread + multi-statement handlers + For + the canonical
// primitives Stack/Inline/Scroll/Text/Heading/Button/Field/Toggle) must compile
// to BOTH native targets from one source. Building this app surfaced three
// Swift/Kotlin PARITY gaps that each blocked "run everywhere" — the curated
// fixtures missed them because no single fixture combined a controlled `<Field>`,
// an "add an item" list mutation, and a per-row `<Toggle>` in one component:
//
//   FIELD-SWIFT  `<Field value={draft()} onChangeText={(v)=>draft.set(v)}>` — the
//                CANONICAL controlled shape (what native-tasks + the docs use)
//                ran on Android (Kotlin detected `'changetext'`) but Swift only
//                checked `'change'`, so iOS fell to the broken generic
//                `Field(value: …)` ("cannot find 'Field' in scope").
//   OBJ-KOTLIN   `todos.set([...todos(), { id: 3, text, done: false }])` — the
//                dominant "add an item" mutation. `synthLiteralStructName` keys
//                on field name:TYPE and bails when a value is a handler-body
//                local (`text`) the emit-time inferCtx can't type, so Kotlin
//                emitted the INVALID `(id = 3, text = text, done = false)`
//                named-args "tuple" (Swift's equivalent fallback is a valid
//                labelled tuple, so only Kotlin broke). Fixed by a field-NAME-set
//                match against the already-synthesized structs.
//   FIELD-KOTLIN the controlled `value={draft()}` (call) form fell through on
//                Kotlin (it only accepted a bare-signal `value={draft}`), while
//                Swift handled both — fixed by adding the controlled shape.
//
// Bisect-load-bearing: revert any one fix and the all-three-targets gate fails.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwift,
  validateSwiftTypecheck,
} from '../validate'

// The "one code" — a realistic canonical app a developer actually writes.
const APP = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Inline, Scroll, Text, Heading, Button, Field, Toggle } from '@pyreon/primitives'
export function TodoApp() {
  const todos = signal([{ id: 1, text: "a", done: false }, { id: 2, text: "b", done: true }])
  const draft = signal("")
  const remaining = computed(() => todos().filter((t) => !t.done).length)
  const add = () => { const text = draft().trim(); if (text.length > 0) { todos.set([...todos(), { id: 3, text, done: false }]); draft.set("") } }
  const toggle = (id: number) => { todos.set(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t))) }
  const clearDone = () => { todos.set(todos().filter((t) => !t.done)) }
  return (
    <Stack gap="md" padding={4}>
      <Heading>Todos — {remaining()} left</Heading>
      <Inline gap="sm">
        <Field value={draft()} placeholder="What needs doing?" onChangeText={(v) => draft.set(v)} />
        <Button onPress={add}>Add</Button>
      </Inline>
      <Scroll>
        <For each={todos()} by={(t) => t.id}>
          {(t) => (<Inline gap="sm"><Toggle value={t.done} onChange={() => toggle(t.id)} /><Text>{t.text}</Text></Inline>)}
        </For>
      </Scroll>
      <Button onPress={clearDone}>Clear completed</Button>
    </Stack>
  )
}`

describe('one code, runs everywhere — realistic canonical TodoMVC app', () => {
  it('FIELD-SWIFT: controlled <Field onChangeText> → SwiftUI TextField (not generic Field)', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('TextField(')
    expect(out).not.toMatch(/\bField\(value:/) // not the broken generic
  })

  it('OBJ-KOTLIN: "add an item" object literal → a named data-class ctor (not an invalid tuple)', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    // the new `{ id: 3, text, done: false }` reuses the synthesized struct
    expect(out).toMatch(/__Obj\d+\(id = 3, text = text, done = false\)/)
    expect(out).not.toMatch(/listOf\(\(id = 3/) // not the invalid bare named-args "tuple"
  })

  it('FIELD-KOTLIN: controlled <Field value={draft()} onChangeText> → Compose TextField', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('TextField(value = draft, onValueChange =')
    expect(out).not.toMatch(/\bField\(value = /) // not the broken generic
  })

  it.skipIf(!isSwiftcAvailable())('iOS: the app parses on real swiftc', () => {
    const r = validateSwift(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // The "one code, runs everywhere" gate. Bisect-load-bearing: revert any of
  // the three fixes and one of these two fails.
  it.skipIf(!isSwiftUIAvailable())('iOS: the app TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Android: the app compiles via kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
