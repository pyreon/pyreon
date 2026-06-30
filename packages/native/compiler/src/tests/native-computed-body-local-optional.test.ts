// Zero-silent-drops (P1) — three optional-handling gaps in the find-then-field
// idiom, surfaced by compiling realistic CRUD-list AND master-detail apps
// end-to-end through swiftc -typecheck + kotlinc (the loop's "build a small
// realistic app, compile it" probe). The idiom appears in nearly every app:
//
//   const summary  = computed(() => { const f = todos().find(t => !t.done); return f ? f.text : "all done" })  // body-local opt
//   const selected = computed(() => items().find(i => i.id === sel()))                                          // master-detail
//   const label    = computed(() => selected() ? selected().name : "—")                                         // computed-READ opt
//
// GAP 1 — computed-body-local seeding. `seedHandlerLocals` (#1933) seeded a
//   handler / function body's `const`/`let` types into the infer ctx, but the
//   THIRD statement-body emit path — `emitSwift/KotlinComputed`'s block body —
//   was never wired up. So `inferType(f)` returned `unknown` inside a computed
//   body and `f ?` stayed a bare optional (a non-Bool condition both reject).
//   Fixed by calling `seedHandlerLocals` in the computed-body emit on BOTH
//   targets. The MULTI-computed probes below make the emit specs load-bearing in
//   CI-without-swiftc (a single-computed probe sees the right local by accident).
//
// GAP 2 — optional-member ternary, BOTH targets. Neither target narrows the
//   optional in a ternary then-branch the JS way: Swift rejects `f != nil ?
//   f.text : …` ("value of optional type 'Todo?' must be unwrapped"); Kotlin
//   smart-casts a bare-`val` local but NOT a `selected()` read (a `by remember {
//   derivedStateOf }` DELEGATED property — "smart cast … impossible … delegated
//   property"), the dominant master-detail shape. `optionalMemberTernary`
//   (infer-type.ts) matches any cond structurally-equal to the then-branch's
//   member object (identifier / computed-read / member chain) and BOTH emits
//   lower it to optional-chaining — Swift `(opt?.prop ?? else)`, Kotlin
//   `(opt?.prop ?: else)`.
//
// GAP 3 — optional-member TYPE inference. Even once the body emits, the computed
//   `detailQty = computed(() => selected() ? selected().qty : 0)` inferred `Any`
//   (member access on `selected()`'s `T | undefined` union missed the field
//   lookup), so `String(detailQty())` failed ("no exact matches in call to
//   initializer"). `unwrapOptionalType` (infer-type.ts) unwraps the union to its
//   non-nullish branch so the field type resolves → the computed infers `Int`.
//
// Together they make CRUD-list AND master-detail apps compile on BOTH targets.
// Bisect-load-bearing at THREE single points:
//   • neuter `seedHandlerLocals` → the body-local specs fail (the local is no
//     longer typed); the boolean control stays green.
//   • neuter `optionalMemberTernary` → the member-ternary emit specs (both
//     targets) + the compile proofs fail; the cond-only + control specs stay green.
//   • neuter `unwrapOptionalType` → `detailQty` re-collapses to `Any` and the
//     master-detail Swift compile proof fails; the emit specs stay green.

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

// gap 2 (computed-READ) — `selected() ? selected().name : else`. `selected` is a
// component-level computed over `.find(…)`, so the cond is a CALL, not a bare
// identifier — the master-detail shape that failed on BOTH targets.
const compRead =
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `type Item = { id: number; name: string }\n` +
  `export function App(){
  const items = signal<Item[]>([{ id: 1, name: "a" }])
  const sel = signal(1)
  const selected = computed(() => items().find(i => i.id === sel()))
  const label = computed(() => selected() ? selected().name : "none")
  return (<Stack><Text>{label}</Text></Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

describe('P1 — find-then-field optional: computed-body seeding + member-ternary (both targets) + type', () => {
  // GAP 1 — computed-body-local optional CONDITION lowers (the seeding fix).
  it('Swift: computed-body `localOpt ? a : b` lowers the cond to `!= nil`', () => {
    expect(sw(condOnly)).toContain('!= nil')
  })
  it('Kotlin: computed-body `localOpt ? a : b` lowers the cond to `!= null`', () => {
    expect(kt(condOnly)).toContain('!= null')
  })

  // GAP 2 — `opt ? opt.prop : else` → optional-chaining on BOTH targets.
  it('Swift: `opt ? opt.prop : else` emits `(opt?.prop ?? else)`', () => {
    const code = sw(memberThen)
    expect(code).toContain('?.text ??')
    expect(code).not.toContain('!= nil ? f.text')
  })
  it('Kotlin: `opt ? opt.prop : else` emits `(opt?.prop ?: else)` (not smart-cast)', () => {
    const code = kt(memberThen)
    expect(code).toContain('?.text ?:')
    // No longer the `if (f != null) f.text else …` smart-cast form.
    expect(code).not.toContain('!= null) f.text')
  })

  // GAP 2 — COMPUTED-READ member-ternary (`selected() ? selected().name : else`),
  // the master-detail shape: Swift can't unwrap, Kotlin can't smart-cast a
  // delegated property — both now lower to optional-chaining.
  it('Swift/Kotlin: computed-read `f() ? f().prop : else` lowers to optional-chaining', () => {
    expect(sw(compRead)).toContain('?.name ??')
    expect(kt(compRead)).toContain('?.name ?:')
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

  // Headline proof #2 — a realistic MASTER-DETAIL app: a `selected` computed over
  // `.find(…)`, two computed-read detail-field ternaries (`detailName` String,
  // `detailQty` Int — exercises gap-3 type inference via `String(detailQty())`),
  // a `total` reduce, select/bump handlers. Compiles end-to-end on both targets.
  const masterDetail = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Inline, Text, Button } from '@pyreon/primitives'
type Item = { id: number; name: string; qty: number }
export function MasterDetail(){
  const items = signal<Item[]>([{ id: 1, name: "apple", qty: 3 }, { id: 2, name: "pear", qty: 5 }])
  const selectedId = signal(1)
  const selected = computed(() => items().find(i => i.id === selectedId()))
  const detailName = computed(() => selected() ? selected().name : "—")
  const detailQty = computed(() => selected() ? selected().qty : 0)
  const total = computed(() => items().reduce((sum, i) => sum + i.qty, 0))
  const select = (id: number) => { selectedId.set(id) }
  const bump = () => { items.set(items().map(i => i.id === selectedId() ? { ...i, qty: i.qty + 1 } : i)) }
  return (<Stack gap="md">
    <Text>{"Total: " + String(total())}</Text>
    <Inline gap="sm">
      <Button onPress={() => select(1)}>apple</Button>
      <Button onPress={() => select(2)}>pear</Button>
    </Inline>
    <Stack gap="sm">
      <Text>{detailName}</Text>
      <Text>{"Qty: " + String(detailQty())}</Text>
      <Button onPress={bump}>+1</Button>
    </Stack>
  </Stack>)
}`

  it.skipIf(!isSwiftUIAvailable())(
    'iOS: the realistic MASTER-DETAIL app TYPECHECKS against real SwiftUI',
    () => {
      const r = validateSwiftTypecheck(sw(masterDetail))
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )
  it.skipIf(!isKotlincAvailable())(
    'Android: the same MASTER-DETAIL app compiles via kotlinc',
    () => {
      const r = validateKotlin(kt(masterDetail))
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )
})
