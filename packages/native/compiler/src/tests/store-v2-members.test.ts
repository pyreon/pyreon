// Store v2 — computeds + methods in the defineStore setup body
// (production-gaps arc, 2026-06-10).
//
// v1's walker bailed the WHOLE store on any non-signal decl, falling
// back to an UNCOMPILABLE passthrough emit (`private let useApp =
// defineStore("app", { (tasks: tasks, …) })`) with only a warning —
// the canonical defineStore shape from the web docs (state + derived +
// actions) silently produced broken native code.
//
// Bisect sites: the computed/arrow branches in parse.ts's store
// walker; the member-emit blocks in emitSwiftStore / emitKotlinStore;
// the `_storeMethodNames*` chain rewrite in both emitters' call cases.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const STORE_V2 = `
  import { defineStore } from '@pyreon/store'
  import { signal, computed } from '@pyreon/reactivity'
  import { Stack, Text, Button } from '@pyreon/primitives'
  type Task = { id: number; title: string; done: boolean }
  const useApp = defineStore('app', () => {
    const tasks = signal<Task[]>([])
    const nextId = signal<number>(1)
    const remaining = computed(() => tasks().filter((t) => !t.done).length)
    const addTask = (title: string) => {
      tasks.set([...tasks(), { id: nextId(), title, done: false }])
      nextId.update((n) => n + 1)
    }
    const clear = () => tasks.set([])
    return { tasks, remaining, addTask, clear }
  })
  export function App() {
    const doubled = computed(() => useApp().store.remaining() * 2)
    return (
      <Stack>
        <Text>{useApp().store.remaining()} open</Text>
        <Button onPress={() => useApp().store.addTask('hi')}>Add</Button>
        <Button onPress={() => useApp().store.clear()}>Clear</Button>
      </Stack>
    )
  }
`

describe('store v2 — Swift', () => {
  it('computeds emit as typed computed properties on the singleton', () => {
    const out = transform(STORE_V2, { target: 'swift' }).code
    expect(out).toContain('var remaining: Int { tasks.filter({ t in !t.done }).count }')
  })

  it('methods emit as internal funcs; bodies use the store decls (incl. a NON-returned signal)', () => {
    const out = transform(STORE_V2, { target: 'swift' }).code
    // `nextId` is NOT in the returned object — v1's exported-only field
    // filter would have dropped it and broken this body.
    expect(out).toContain('var nextId: Int = 1')
    expect(out).toContain('func addTask(_ title: String)')
    expect(out).toContain('tasks = (tasks + [Task(id: nextId, title: title, done: false)])')
    // `.update` lowering composes inside store method bodies.
    expect(out).toContain('nextId = nextId + 1')
    expect(out).toContain('func clear() { tasks = [] }')
    // The broken v1 passthrough must be gone.
    expect(out).not.toContain('defineStore(')
  })

  it('chain rewrites: method calls keep parens+args; computed reads drop parens', () => {
    const out = transform(STORE_V2, { target: 'swift' }).code
    expect(out).toContain('PyreonStore_app.shared.addTask("hi")')
    expect(out).toContain('PyreonStore_app.shared.clear()')
    expect(out).toContain('Text("\\(PyreonStore_app.shared.remaining) open")')
  })

  it('component computeds over store COMPUTEDS infer concrete types', () => {
    const out = transform(STORE_V2, { target: 'swift' }).code
    expect(out).toContain('private var doubled: Int {')
  })
})

describe('store v2 — Kotlin (mirror)', () => {
  it('computeds emit as reactive getters; methods as funs; empty-array seeds carry the type arg', () => {
    const out = transform(STORE_V2, { target: 'kotlin' }).code
    expect(out).toContain('val remaining get() = tasks.filter({ t -> !t.done }).length')
    expect(out).toContain('fun addTask(title: String)')
    // kotlinc cannot infer T from `mutableStateOf(listOf())`.
    expect(out).toContain('var tasks by mutableStateOf<List<Task>>(listOf())')
    expect(out).not.toContain('defineStore(')
  })

  it('chain rewrites mirror Swift', () => {
    const out = transform(STORE_V2, { target: 'kotlin' }).code
    expect(out).toContain('PyreonStore_app.addTask("hi")')
    expect(out).toContain('PyreonStore_app.clear()')
    expect(out).toContain('${PyreonStore_app.remaining} open')
  })
})

describe('store v2 — conservative bails stay loud', () => {
  it('a block-body computed bails the WHOLE store with a warning (no broken emit)', () => {
    const r = transform(
      `
      import { defineStore } from '@pyreon/store'
      import { signal, computed } from '@pyreon/reactivity'
      import { Stack, Text } from '@pyreon/primitives'
      const useX = defineStore('x', () => {
        const n = signal(0)
        const big = computed(() => { return n() > 10 })
        return { n, big }
      })
      export function App() {
        return <Stack><Text>{useX().store.n()}</Text></Stack>
      }
      `,
      { target: 'swift' },
    )
    expect((r.warnings ?? []).join(' ')).toContain('expression-body arrow')
  })
})
