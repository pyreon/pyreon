// `.update(fn)` lowering + index expressions (PR-D, 2026-06-10).
//
// Both close gaps the ORIGINAL tasks scaffold hit (its emit produced
// `.update(` passthrough and `tasks.undefined` — see the #1506 rewrite
// commit): `signal.update(fn)` is core web vocabulary and `xs[i]` is
// plain JavaScript; sources shouldn't have to avoid either.
//
// Bisect sites:
//   - `.update` lowering → the `property === 'update'` branches in both
//     emitters' call cases + `substituteIdentifier` in expr-utils.ts
//   - index emit → the `case 'index'` in both emitters + the
//     `computed: true` branch in parse.ts's MemberExpression case
//   - expression-body assignment → `kotlinExprIsAssignment` in
//     emit-kotlin.ts

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const UPDATE_APP = `
  import { defineStore } from '@pyreon/store'
  import { signal } from '@pyreon/reactivity'
  import { Stack, Text } from '@pyreon/primitives'
  type Task = { id: number; title: string; done: boolean }
  const useApp = defineStore('app', () => {
    const tasks = signal<Task[]>([{ id: 1, title: 'x', done: false }])
    return { tasks }
  })
  export function App() {
    const count = signal<number>(0)
    const local = signal<Task[]>([{ id: 1, title: 'y', done: false }])
    const bump = () => count.update((n) => n + 1)
    const toggleLocal = (id: number) => {
      local.update((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
    }
    const toggleStore = (id: number) => {
      useApp().store.tasks.update((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
    }
    return <Stack><Text>{count}</Text></Stack>
  }
`

describe('.update(fn) lowering', () => {
  it('Swift: lowers to assignment with the param substituted by the read', () => {
    const out = transform(UPDATE_APP, { target: 'swift' }).code
    // Identical emit to the hand-written `.set(x().…)` form — no IIFE.
    expect(out).toContain('count = count + 1')
    expect(out).toContain('local = local.map(')
    expect(out).not.toContain('.update(')
  })

  it('Swift: store-field .update lowers through the singleton on BOTH sides', () => {
    const out = transform(UPDATE_APP, { target: 'swift' }).code
    expect(out).toContain(
      'PyreonStore_app.shared.tasks = PyreonStore_app.shared.tasks.map(',
    )
    // The LHS must be the singleton — the bare member chain
    // `useApp().store.tasks = …` would not compile.
    expect(out).not.toContain('useApp().store.tasks =')
  })

  it('Kotlin: mirrors the lowering through the object singleton', () => {
    const out = transform(UPDATE_APP, { target: 'kotlin' }).code
    expect(out).toContain('count = count + 1')
    expect(out).toContain('PyreonStore_app.tasks = PyreonStore_app.tasks.map(')
    expect(out).not.toContain('.update(')
  })

  it('shadowed param bails to passthrough with a warning (conservative)', () => {
    const r = transform(
      `
      import { signal } from '@pyreon/reactivity'
      import { Stack, Text } from '@pyreon/primitives'
      export function App() {
        const xs = signal<number[]>([1])
        const f = () => {
          xs.update((n) => xs().map((n) => n + 1))
        }
        return <Stack><Text>x</Text></Stack>
      }
      `,
      { target: 'swift' },
    )
    // Inner `(n) => …` shadows the outer param — substitution would
    // change meaning; the call keeps the raw emit + a warning names it.
    expect(r.code).toContain('.update(')
    expect((r.warnings ?? []).join(' ')).toContain('.update(fn)` lowering')
  })

  it('Kotlin: expression-body arrow that lowers to an assignment uses block form', () => {
    const out = transform(
      `
      import { signal } from '@pyreon/reactivity'
      import { Stack, Text } from '@pyreon/primitives'
      export function App() {
        const count = signal<number>(0)
        const reset = () => count.set(0)
        const bump = () => count.update((n) => n + 1)
        const isZero = () => count() === 0
        return <Stack><Text>{count}</Text></Stack>
      }
      `,
      { target: 'kotlin' },
    ).code
    // `fun reset() = count = 0` is a Kotlin SYNTAX error (assignments
    // are statements) — pre-existing gap, exposed by expression-body
    // mutation arrows; all earlier fixtures used block bodies.
    expect(out).not.toMatch(/fun \w+\(\)\S* = \w+ = /)
    expect(out).toMatch(/fun reset\(\)[^=]*\{/)
    expect(out).toMatch(/fun bump\(\)[^=]*\{/)
    // Value expressions KEEP the idiomatic expression-body form.
    expect(out).toContain('fun isZero() = count == 0')
  })
})

describe('index expressions', () => {
  const INDEX_APP = `
    import { signal } from '@pyreon/reactivity'
    import { Stack, Text } from '@pyreon/primitives'
    type Task = { id: number; title: string; done: boolean }
    export function App() {
      const tasks = signal<Task[]>([{ id: 1, title: 'x', done: false }])
      const lastId = () => tasks()[tasks().length - 1].id
      return <Stack><Text>{lastId()}</Text></Stack>
    }
  `

  it('Swift: xs[i] emits subscript syntax (was xs.undefined)', () => {
    const out = transform(INDEX_APP, { target: 'swift' }).code
    // .length → .count rewrite composes with the subscript emit.
    expect(out).toContain('tasks[tasks.count - 1].id')
    expect(out).not.toContain('.undefined')
  })

  it('Kotlin: xs[i] emits subscript syntax (was xs.undefined)', () => {
    const out = transform(INDEX_APP, { target: 'kotlin' }).code
    expect(out).toContain('tasks[tasks.length - 1].id')
    expect(out).not.toContain('.undefined')
  })
})
