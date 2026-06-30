import { describe, expect, it } from 'vitest'
import { applySnapshot, getSnapshot, model } from '../index'

// Regression: arrays / plain-objects of MODEL INSTANCES (the `todos: Todo[]`
// shape) previously serialized the live signal facades instead of plain data,
// and applySnapshot wrote raw plain objects (replacing the instances).

const Todo = model({ state: { title: '', done: false } }).actions((self) => ({
  toggle: () => self.done.set(!self.done()),
}))

describe('snapshot — arrays / objects of model instances', () => {
  it('getSnapshot recurses into an array of model instances → plain JSON', () => {
    const List = model({ state: { todos: [] as ReturnType<typeof Todo.create>[] } })
    const list = List.create({ todos: [Todo.create({ title: 'a', done: false }), Todo.create({ title: 'b', done: true })] })
    const snap = getSnapshot(list) as { todos: { title: string; done: boolean }[] }
    expect(snap.todos).toEqual([
      { title: 'a', done: false },
      { title: 'b', done: true },
    ])
    // Must be plain serializable data — no function facades.
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)
  })

  it('getSnapshot recurses into a plain object whose values are model instances', () => {
    const Registry = model({ state: { byId: {} as Record<string, ReturnType<typeof Todo.create>> } })
    const reg = Registry.create({ byId: { x: Todo.create({ title: 'x', done: true }) } })
    expect(getSnapshot(reg)).toEqual({ byId: { x: { title: 'x', done: true } } })
  })

  it('applySnapshot reconciles same-shape arrays IN PLACE (instances preserved)', () => {
    const List = model({ state: { todos: [] as ReturnType<typeof Todo.create>[] } })
    const list = List.create({ todos: [Todo.create({ title: 'a', done: false }), Todo.create({ title: 'b', done: false })] })
    const first = list.todos()[0]
    applySnapshot(list, { todos: [{ title: 'A', done: true }, { title: 'B', done: true }] })
    expect(getSnapshot(list)).toEqual({ todos: [{ title: 'A', done: true }, { title: 'B', done: true }] })
    // Same instance objects — reconciled in place, not replaced by plain data.
    expect(list.todos()[0]).toBe(first)
    expect(typeof list.todos()[0]!.toggle).toBe('function')
  })

  it('plain-value arrays/objects are unchanged (no behavior change for non-instances)', () => {
    const M = model({ state: { items: [1, 2, 3] as number[], meta: { a: 1 } as Record<string, number> } })
    const m = M.create({ items: [1, 2, 3], meta: { a: 1 } })
    const snap = getSnapshot(m) as { items: number[]; meta: Record<string, number> }
    expect(snap.items).toEqual([1, 2, 3])
    expect(snap.meta).toEqual({ a: 1 })
    // identity preserved for plain-value containers (returned as-is)
    expect(snap.items).toBe(m.items())
  })
})
