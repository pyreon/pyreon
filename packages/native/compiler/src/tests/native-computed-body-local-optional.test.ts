// Zero-silent-drops (P1) — two optional-handling gaps surfaced by compiling a
// REALISTIC TodoMVC-shape CRUD app end-to-end through swiftc -typecheck +
// kotlinc (the loop's "build a small realistic app, compile it" probe). Both
// live in the find-then-field idiom that appears in nearly every CRUD computed:
//
//   const summary = computed(() => {
//     const found = todos().find(t => !t.done)   // computed-BODY local optional
//     return found ? found.text : "all done"     // truthiness + member access
//   })
//
// GAP 1 — computed-body-local seeding. `seedHandlerLocals` (#1933) seeded a
//   handler / function body's `const`/`let` types into the infer ctx, but the
//   THIRD statement-body emit path — `emitSwift/KotlinComputed`'s block body —
//   was never wired up. So `inferType(found)` returned `unknown` inside a
//   computed body and `found ?` stayed a bare optional (a non-Bool condition
//   swiftc/kotlinc reject). Fixed by calling `seedHandlerLocals` in the
//   computed-body emit on BOTH targets (the iso `found ? "has" : "none"` proof).
//
// GAP 2 — Swift optional-member ternary. Even once the CONDITION lowers, Swift
//   does NOT narrow the optional inside a ternary then-branch, so `found != nil
//   ? found.text : "all done"` STILL fails ("value of optional type 'Todo?'
//   must be unwrapped to refer to member 'text'"). `optionalMemberTernary`
//   (infer-type.ts) detects the `opt ? opt.prop : else` shape and the Swift emit
//   lowers it to `(opt?.prop ?? else)` — optional-chaining + nil-coalescing,
//   same intent, compiles. Kotlin SMART-CASTS the then-branch (`if (opt != null)
//   opt.prop else …` compiles), so it needs no rewrite — Swift-only.
//
// Together they make a realistic CRUD app compile on BOTH targets (the headline
// proof below). Bisect-load-bearing at TWO single points:
//   • neuter `seedHandlerLocals` → gap-1 + gap-2 specs fail (the computed-body
//     local is no longer typed, so neither the condition nor the member-ternary
//     classification fires); the boolean control stays green.
//   • neuter `optionalMemberTernary` → the gap-2 Swift emit spec fails (falls to
//     the general `found != nil ? found.text : …` path); gap-1 stays green.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const H =
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n`

// A FIRST computed whose body declares a local optional via `.find(…)`, plus a
// SECOND computed declaring a DIFFERENT local (`g`). The infer pass populates the
// SHARED ctx.locals as it walks both computeds, leaving the LAST one's locals
// (`g`) in the map — so emitting the FIRST computed without re-seeding sees `g`,
// not `f`, and `f` reads as `unknown` (the real multi-computed bug). The two-
// computed shape is what makes these EMIT specs load-bearing under the
// `seedHandlerLocals` neuter even when swiftc/kotlinc are unavailable (CI).
const comp = (ret: string) => `${H}export function App(){
  const td = signal([{ id: 1, text: "a", done: false }])
  const first = computed(() => { const f = td().find(t => !t.done); return ${ret} })
  const second = computed(() => { const g = td().length; return g > 0 ? "y" : "n" })
  return (<Stack><Text>{first}</Text><Text>{second}</Text></Stack>)
}`

const condOnly = comp(`f ? "has" : "none"`) // gap 1 — condition, no member access
const memberThen = comp(`f ? f.text : "none"`) // gap 2 — opt ? opt.prop : else
const boolThen = comp(`td().length > 0 ? "some" : "none"`) // boolean control

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

describe('P1 — computed-body-local optional: condition seeding + Swift member-ternary', () => {
  // GAP 1 — computed-body-local optional CONDITION lowers (the seeding fix).
  it('Swift: computed-body `localOpt ? a : b` lowers the cond to `!= nil`', () => {
    expect(sw(condOnly)).toContain('!= nil')
  })
  it('Kotlin: computed-body `localOpt ? a : b` lowers the cond to `!= null`', () => {
    expect(kt(condOnly)).toContain('!= null')
  })

  // GAP 2 — Swift `opt ? opt.prop : else` → `(opt?.prop ?? else)`.
  it('Swift: `opt ? opt.prop : else` emits optional-chaining `(opt?.prop ?? else)`', () => {
    const code = sw(memberThen)
    expect(code).toContain('?.text ??')
    // Must NOT emit the un-narrowed `found != nil ? found.text` shape.
    expect(code).not.toContain('!= nil ? f.text')
  })
  it('Kotlin: `opt ? opt.prop : else` smart-casts (`if (opt != null) opt.prop else …`)', () => {
    const code = kt(memberThen)
    expect(code).toContain('!= null')
    expect(code).toContain('f.text')
  })

  // Control — a boolean computed-body condition must NOT be optional-wrapped.
  it('Swift/Kotlin: a boolean computed-body condition is NOT optional-wrapped', () => {
    expect(sw(boolThen)).not.toContain('!= nil')
    expect(kt(boolThen)).not.toContain('!= null')
  })

  // Headline proof — a realistic TodoMVC-shape CRUD app (signal<Todo[]>, draft /
  // nextId signals, find-then-field `summary` computed, index-callback `labels`,
  // add/toggle/remove handlers, Field/Button) COMPILES end-to-end on both
  // targets. This is the first realistic multi-feature app proven through real
  // swiftc -typecheck + kotlinc.
  const crud = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Inline, Text, Button, Field } from '@pyreon/primitives'
type Todo = { id: number; text: string; done: boolean }
export function TodoApp() {
  const todos = signal<Todo[]>([{ id: 1, text: "first", done: false }])
  const draft = signal("")
  const nextId = signal(2)
  const remaining = computed(() => todos().filter(t => !t.done).length)
  const summary = computed(() => { const found = todos().find(t => !t.done); return found ? found.text : "all done" })
  const labels = computed(() => todos().map((t, i) => String(i) + ": " + t.text))
  const add = () => { const text = draft().trim(); if (text.length === 0) { return }; todos.set([...todos(), { id: nextId(), text: text, done: false }]); nextId.set(nextId() + 1); draft.set("") }
  const toggle = (id: number) => { todos.set(todos().map(t => t.id === id ? { ...t, done: !t.done } : t)) }
  const remove = (id: number) => { todos.set(todos().filter(t => t.id !== id)) }
  return (<Stack gap="md">
    <Text>{summary}</Text>
    <Text>{String(remaining()) + " left"}</Text>
    <Inline gap="sm">
      <Field value={draft()} onChangeText={(v: string) => draft.set(v)} />
      <Button onPress={add}>Add</Button>
    </Inline>
  </Stack>)
}`

  it.skipIf(!isSwiftUIAvailable())(
    'iOS: the realistic CRUD app TYPECHECKS against real SwiftUI',
    () => {
      const r = validateSwiftTypecheck(sw(crud))
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )
  it.skipIf(!isKotlincAvailable())('Android: the same CRUD app compiles via kotlinc', () => {
    const r = validateKotlin(kt(crud))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
