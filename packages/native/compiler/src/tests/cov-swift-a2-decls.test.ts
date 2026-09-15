// Branch matrices for `emitSwiftDecl` — the per-declaration lowering table.
//
// The recurring shape is an OPTIONAL piece of the native initializer: a
// fallback locale, a page size, a zoom clamp, a node's `type`/`width`, an
// edge's `label`/`animated`. Each is a `...(x !== undefined ? [..] : [])`
// arm, and the absent side is the one that must stay BYTE-IDENTICAL to the
// pre-feature emit — a stray `, minZoom: nil` is a different initializer
// overload, not a no-op.
//
// The second recurring shape is an EMPTY map. Swift's `[]` parses as an empty
// ARRAY, so an empty dictionary must emit `[:]` or the initializer fails to
// typecheck against `[String: String]` — and the i18n/machine literals nest,
// so both the inner and the outer map need it.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' })
const P = '@pyreon/primitives'

describe('createI18n / createMachine — the `[:]` empty-map arms', () => {
  it('a populated locale map, an EMPTY inner map, and a fallback locale', () => {
    const { code } = swift(`import { Stack, Text } from '${P}'
import { createI18n } from '@pyreon/i18n'
export function App() {
  const i = createI18n({ locale: 'en', messages: { en: { hi: 'Hi' }, cs: {} }, fallbackLocale: 'en' })
  return (<Stack><Text>{i.t('hi')}</Text></Stack>)
}`)
    expect(code).toContain(
      'PyreonI18n(locale: "en", messages: ["en": ["hi": "Hi"], "cs": [:]], fallbackLocale: "en")',
    )
  })

  it('an EMPTY outer map and NO fallback locale', () => {
    const { code } = swift(`import { Stack, Text } from '${P}'
import { createI18n } from '@pyreon/i18n'
export function App() {
  const i = createI18n({ locale: 'en', messages: {} })
  return (<Stack><Text>{i.t('hi')}</Text></Stack>)
}`)
    expect(code).toContain('PyreonI18n(locale: "en", messages: [:])')
    // the absent arm must add NOTHING — not `fallbackLocale: nil`
    expect(code).not.toContain('fallbackLocale')
  })

  it('createMachine mirrors it at both map depths', () => {
    const { code } = swift(`import { Stack, Text } from '${P}'
import { createMachine } from '@pyreon/machine'
export function App() {
  const m1 = createMachine({ initial: 'idle', states: { idle: { on: { GO: 'run' } }, run: { on: {} } } })
  const m2 = createMachine({ initial: 'idle', states: {} })
  return (<Stack><Text>{() => \`\${m1()}\${m2()}\`}</Text></Stack>)
}`)
    // a state with no transitions → the INNER `[:]`
    expect(code).toContain('PyreonMachine(initial: "idle", transitions: ["idle": ["GO": "run"], "run": [:]])')
    // no states at all → the OUTER `[:]`
    expect(code).toContain('PyreonMachine(initial: "idle", transitions: [:])')
  })
})

describe('createFlow — each optional node/edge/config field is its own arm', () => {
  it('present: type/width/height on a node, type/label/animated on an edge, and the zoom clamp', () => {
    const { code } = swift(`import { Stack, Text } from '${P}'
import { createFlow } from '@pyreon/flow'
export function App() {
  const fl = createFlow({
    nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' }, type: 'input', width: 10, height: 20 }],
    edges: [{ id: 'e1', source: 'a', target: 'a', type: 'smooth', label: 'L', animated: true }],
    minZoom: 0.5,
    maxZoom: 3,
  })
  return (<Stack><Text>{String(fl.nodes().length)}</Text></Stack>)
}`)
    expect(code).toContain(
      'PyreonFlowNode(id: "a", type: "input", position: PyreonXYPosition(x: 0, y: 0), data: __Obj0(label: "A"), width: 10, height: 20)',
    )
    expect(code).toContain(
      'PyreonFlowEdge(id: "e1", source: "a", target: "a", type: "smooth", label: "L", animated: true)',
    )
    expect(code).toContain(', minZoom: 0.5, maxZoom: 3)')
  })

  it('absent: every optional arm emits NOTHING, byte-identically to the pre-feature shape', () => {
    const { code } = swift(`import { Stack, Text } from '${P}'
import { createFlow } from '@pyreon/flow'
export function App() {
  const fl = createFlow({
    nodes: [{ id: 'b', position: { x: 1, y: 1 }, data: { label: 'B' } }],
    edges: [{ id: 'e2', source: 'b', target: 'b' }],
  })
  return (<Stack><Text>{String(fl.nodes().length)}</Text></Stack>)
}`)
    expect(code).toContain(
      'PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 1, y: 1), data: __Obj0(label: "B"))',
    )
    expect(code).toContain('PyreonFlowEdge(id: "e2", source: "b", target: "b")')
    expect(code).not.toContain('minZoom')
    expect(code).not.toContain('maxZoom')
  })
})

describe('useDebouncedValue — the annotation comes from the COMPONENT’s inference, not parse time', () => {
  it('a resolvable source types the @State; an unresolvable one falls back to the parse-time type', () => {
    const { code } = swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
import { useDebouncedValue } from '@pyreon/hooks'
export function App(props: { raw: unknown }) {
  const q = signal<string>('')
  const dq = useDebouncedValue(() => q(), 300)
  const du = useDebouncedValue(() => props.raw, 200)
  return (<Stack><Press onPress={() => q.set('x')}><Text>{() => \`\${dq()}\${String(du())}\`}</Text></Press></Stack>)
}`)
    // the signal's type is only known inside the component's ctx
    expect(code).toContain('@State private var dq: String = ""')
    // and the unknown arm keeps `Any` rather than inventing a type
    expect(code).toContain('@State private var du: Any = raw')
    // the debounce itself is a `.task(id:)`, never part of the decl
    expect(code).toContain('.task(id: q)')
  })
})

describe('useDebouncedCallback / useThrottledCallback — class, label and arg type', () => {
  it('picks the class + delay label by mode, and the arg type from the callback’s param', () => {
    const { code } = swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
import { useDebouncedCallback, useThrottledCallback } from '@pyreon/hooks'
export function App() {
  const q = signal<string>('')
  const save = useDebouncedCallback((v: string) => { q.set(v) }, 400)
  const ping = useThrottledCallback(() => { q.set('p') }, 500)
  return (<Stack><Press onPress={() => save('a')}><Text>{() => q()}</Text></Press></Stack>)
}`)
    expect(code).toContain('@State private var save = PyreonDebounced<String>(delayMs: 400)')
    // a ZERO-param callback types the runtime over `Void`
    expect(code).toContain('@State private var ping = PyreonThrottled<Void>(waitMs: 500)')
    // the action attaches in .onAppear — a @State initializer has no `self`
    expect(code).toContain('save.action = { v in q = v }')
    expect(code).toContain('ping.action = { _ in q = "p" }')
  })

  it.fails(
    'KNOWN BUG: a ZERO-ARGUMENT call to a rate-limited binding LOSES its parens — `ping()` emits `ping`, so the throttled callback never fires and swiftc only sees an unused expression. The zero-arg identifier-call arm in `emitSwiftExpr` preserves parens for `_functionNames` / `_machineNames` / `_syncedSignalNames` and falls through to the bare emit for everything else; a rate-limited binding needs the same registration. Kotlin drops the call identically, so this is a shared-emit gap, not a Swift divergence. The existing suite cannot see it: its fixture always passes one argument.',
    () => {
      const { code } = swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
import { useThrottledCallback } from '@pyreon/hooks'
export function App() {
  const q = signal<string>('')
  const ping = useThrottledCallback(() => { q.set('p') }, 500)
  return (<Stack><Press onPress={() => { ping() }}><Text>{() => q()}</Text></Press></Stack>)
}`)
      // the BUTTON action is where the call lives; it currently reads
      // `Button(action: { ping })` — a bare property reference.
      expect(code).toContain('Button(action: { ping() })')
      expect(code).not.toContain('Button(action: { ping })')
    },
  )
})

describe('createTableState / useSortable — generic row type and the optional config', () => {
  it('a pageSize is appended only when > 0; every column gets an accessor', () => {
    const { code } = swift(`import { Stack, Text } from '${P}'
import { createTableState } from '@pyreon/table'
import { signal } from '@pyreon/reactivity'
type Row = { id: number; name: string }
export function App() {
  const rows = signal<Row[]>([])
  const t1 = createTableState({ data: () => rows(), columns: [{ id: 'id' }, { id: 'name' }], pageSize: 10 })
  const t2 = createTableState({ data: () => rows(), columns: [{ id: 'id' }] })
  return (<Stack><Text>{() => \`\${t1.page()}\${t2.page()}\`}</Text></Stack>)
}`)
    expect(code).toContain('PyreonTableState<Row>(')
    expect(code).toContain('PyreonTableColumn(id: "id"')
    expect(code).toContain('PyreonTableColumn(id: "name"')
    expect(code).toContain('], pageSize: 10)')
    // no pageSize configured → the arm adds nothing
    expect(code).toMatch(/t2 = PyreonTableState<Row>\(columns: \[[^\]]*\]\)/)
  })

  it('useSortable emits the axis ONLY when horizontal', () => {
    const { code } = swift(`import { Stack, Text } from '${P}'
import { useSortable } from '@pyreon/dnd'
import { signal } from '@pyreon/reactivity'
type Row = { id: number; name: string }
export function App() {
  const rows = signal<Row[]>([])
  const s1 = useSortable({ items: () => rows(), by: (r) => r.id, onReorder: (next) => rows.set(next), axis: 'horizontal' })
  const s2 = useSortable({ items: () => rows(), by: (r) => r.id, onReorder: (next) => rows.set(next) })
  return (<Stack><Text>{() => \`\${s1.items().length}\${s2.items().length}\`}</Text></Stack>)
}`)
    expect(code).toContain('PyreonSortableState<Row>(axis: .horizontal)')
    // vertical is the default — the arm emits an EMPTY argument list
    expect(code).toContain('PyreonSortableState<Row>()')
  })
})

describe('computed — the multi-statement body vs the single-expression form', () => {
  it('a BLOCK body keeps its `let`s and early return, and its locals are seeded for the emit', () => {
    const { code } = swift(`import { Stack, Text } from '${P}'
import { computed, signal } from '@pyreon/reactivity'
type Todo = { id: number; text: string; done: boolean }
export function App() {
  const todos = signal<Todo[]>([])
  const label = computed(() => {
    const found = todos().find((t) => t.id === 1)
    return found ? found.text : 'none'
  })
  return (<Stack><Text>{label}</Text></Stack>)
}`)
    // the pre-return `let` survives — it used to be silently dropped
    expect(code).toContain('let found = todos.first(where:')
    // and `found` is seeded as OPTIONAL, so the ternary lowers to `??`
    expect(code).toContain('return (found?.text ?? "none")')
  })

  it('the single-EXPRESSION form emits a one-line getter with the inferred type', () => {
    const { code } = swift(`import { Stack, Text } from '${P}'
import { computed, signal } from '@pyreon/reactivity'
export function App() {
  const q = signal<string>('ab')
  const n = computed(() => q().length)
  return (<Stack><Text>{() => String(n())}</Text></Stack>)
}`)
    expect(code).toContain('private var n: Int { q.utf16.count }')
  })
})
