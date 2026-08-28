// ─── Signal-decl annotation for object-literal initializers (Swift) ─────────
//
// THE BUG (type-path half of the #1714 non-literal-fields work): a signal
// whose initializer is an object literal (or array of them) with a
// NON-LITERAL field gets `unknown` from parse-time `inferTypeFromInitial`
// (ctx-less by design), while the VALUE emit synthesizes/resolves a struct
// via `_exprInferCtx`. The Swift decl then read
//
//   @State private var items: Any = [__Obj0(id: 2 + 3, name: "hi")]
//
// — an annotation/value divergence where every member access and subscript
// fails the REAL-SDK typecheck (`value of type 'Any' has no subscripts`)
// with ZERO compiler warnings; the parse-only `validateSwift` gate passes it
// (the documented parse-vs-typecheck asymmetry). Kotlin was green the whole
// time: it emits no annotation, so `mutableStateOf(listOf(__Obj0(...)))`
// infers — the classic one-target-visible shape.
//
// THE FIX: after the initializer VALUE is emitted, an `Any`/`[Any]`-typed
// signal decl resolves its annotation through the SAME
// `resolveSwiftObjectStructName` (exact index → optional-subset → synth
// dedup) the value emit used — agreement by construction, and a pure dedup
// lookup by then, so `__ObjN` numbering / cross-target alignment cannot move.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('signal-decl annotation agrees with the synthesized struct value', () => {
  it('Swift: array-of-objects with a non-literal field annotates [__Obj0], not Any', () => {
    const out = transform(
      app(`  const items = signal([{ id: 2 + 3, name: "hi" }])`),
      { target: 'swift' },
    ).code
    expect(out).toContain('@State private var items: [__Obj0] = [__Obj0(id: 2 + 3, name: "hi")]')
    expect(out).not.toContain(': Any')
  })

  it('Swift: a solo object with a non-literal field annotates __Obj0', () => {
    const out = transform(
      app(`  const solo = signal({ id: 2 + 3, name: "hi" })`),
      { target: 'swift' },
    ).code
    expect(out).toContain('@State private var solo: __Obj0 = __Obj0(id: 2 + 3, name: "hi")')
    expect(out).not.toContain(': Any')
  })

  it('Swift: the annotation reuses a parse-typed SIBLING struct name (rung-1 agreement)', () => {
    // `first` is all-literal → parse types it → `AppFirst` registered in
    // `_structFieldsToName`. `items` has the SAME field shape but a
    // non-literal field → parse bails to unknown. The annotation must
    // resolve to the SAME name the value emit picks — never a fresh __ObjN
    // duplicating a named struct.
    const out = transform(
      app(
        `  const first = signal({ id: 1, name: "a" })\n` +
          `  const items = signal([{ id: 2 + 3, name: "b" }])`,
      ),
      { target: 'swift' },
    ).code
    expect(out).toContain('@State private var items: [AppFirst] = [AppFirst(id: 2 + 3, name: "b")]')
    expect(out).not.toContain('__Obj')
  })

  it('Swift: a MIXED-shape array keeps its prior annotation (no single name exists)', () => {
    const out = transform(
      app(`  const mixed = signal([{ id: 2 + 3 }, { name: "hi", extra: true }])`),
      { target: 'swift' },
    ).code
    // Each element still gets its own struct value; the decl cannot name one.
    expect(out).toContain('@State private var mixed: Any')
  })

  it('Swift: a DECLARED generic annotation is untouched (the gate is Any-only)', () => {
    const out = transform(
      app(
        `  type Thing = { id: number; name: string }\n` +
          `  const items = signal<Thing[]>([{ id: 1, name: "a" }])`,
      ),
      { target: 'swift' },
    ).code
    expect(out).toContain('@State private var items: [Thing]')
  })

  it('Kotlin: emit for the same source is annotation-free and unchanged', () => {
    const out = transform(
      app(`  const items = signal([{ id: 2 + 3, name: "hi" }])`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('var items by remember { mutableStateOf(listOf(__Obj0(id = 2 + 3, name = "hi"))) }')
  })

  it.runIf(isSwiftUIAvailable())(
    'REAL-SDK typecheck: member access through the annotated signal compiles',
    () => {
      const src = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const items = signal([{ id: 2 + 3, name: "hi" }])
  const solo = signal({ id: 7, name: "yo" })
  return (<Stack><Text>{items()[0].name}</Text><Text>{solo().name}</Text></Stack>)
}`
      const r = validateSwiftTypecheck(transform(src, { target: 'swift' }).code)
      expect(r.ok, r.ok ? '' : String(r.error).slice(0, 400)).toBe(true)
    },
  )

  it.runIf(isKotlincAvailable())('kotlinc: the Kotlin twin still compiles', async () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const items = signal([{ id: 2 + 3, name: "hi" }])
  return (<Stack><Text>{items()[0].name}</Text></Stack>)
}`
    const r = await validateKotlin(transform(src, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String((r as { error?: string }).error).slice(0, 400)).toBe(true)
  })
})
