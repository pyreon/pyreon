import { describe, expect, it } from 'vitest'
import { destroy, model, onPatch, onSnapshot } from '../index'
import { instanceMeta } from '../registry'
import type { Patch } from '../types'

// Regression: array/object-held model children (the headline `todos: Todo[]`
// composition) reached the instance via `scanForChildren` (parent pointer only)
// — so a mutation INSIDE a child (`self.todos()[0].toggle()`) never fired the
// parent's onPatch / onSnapshot (stale persistence) and `destroy(parent)` never
// tore the child down (leak). Field-nested children (`child: Todo`) were wired;
// array/object children weren't. Now they propagate + tear down the same way.

const Todo = model({ state: { title: '', done: false } }).actions((self) => ({
  toggle: () => self.done.set(!self.done()),
}))

describe('state-tree — array/object child upward propagation', () => {
  it('1a: an array-child mutation fires the parent onPatch', () => {
    const List = model({ state: { todos: [] as ReturnType<typeof Todo.create>[] } })
    const list = List.create({ todos: [Todo.create({ title: 'a', done: false })] })
    const patches: Patch[] = []
    onPatch(list, (p) => patches.push(p))

    list.todos()[0]!.toggle()

    // The child's mutation reached the parent (path prefixed with the field key).
    expect(patches.length).toBeGreaterThan(0)
    expect(patches[0]!.path).toBe('/todos/done')
    expect(patches[0]!.value).toBe(true)
  })

  it('1b: an array-child mutation fires the parent onSnapshot (stale-persistence fix)', async () => {
    const List = model({ state: { todos: [] as ReturnType<typeof Todo.create>[] } })
    const list = List.create({ todos: [Todo.create({ title: 'a', done: false })] })
    const snaps: unknown[] = []
    onSnapshot(list, (s) => snaps.push(s))

    list.todos()[0]!.toggle()
    await Promise.resolve() // onSnapshot coalesces to a microtask

    expect(snaps).toHaveLength(1)
    expect(snaps[0]).toEqual({ todos: [{ title: 'a', done: true }] })
  })

  it('1b (object): a plain-object-child mutation fires the parent onSnapshot', async () => {
    const Reg = model({ state: { byId: {} as Record<string, ReturnType<typeof Todo.create>> } })
    const reg = Reg.create({ byId: { x: Todo.create({ title: 'x', done: false }) } })
    const snaps: unknown[] = []
    onSnapshot(reg, (s) => snaps.push(s))

    reg.byId().x!.toggle()
    await Promise.resolve()

    expect(snaps).toHaveLength(1)
    expect(snaps[0]).toEqual({ byId: { x: { title: 'x', done: true } } })
  })

  it("1c: destroy(parent) runs an array-child's beforeDestroy (no leak)", () => {
    let torn = 0
    const LTodo = model({ state: { title: '' } }).lifecycle(() => ({
      beforeDestroy: () => {
        torn++
      },
    }))
    const List = model({ state: { todos: [] as ReturnType<typeof LTodo.create>[] } })
    const list = List.create({ todos: [LTodo.create({ title: 'a' }), LTodo.create({ title: 'b' })] })

    destroy(list)

    expect(torn).toBe(2) // both array children torn down
  })

  // Class-D guard: `scanForChildren` runs on EVERY `.set`, so a naive re-wire
  // would pile up upward-propagation listeners on a persisting child and grow
  // `meta.children` unboundedly. Disposal-before-rewire must keep both bounded.
  it('re-setting the array many times does NOT pile up child listeners or meta.children', () => {
    const List = model({ state: { todos: [] as ReturnType<typeof Todo.create>[] } })
    const persistent = Todo.create({ title: 'keep', done: false })
    const list = List.create({ todos: [persistent] })

    for (let i = 0; i < 20; i++) {
      // Re-set with the SAME persistent child + a fresh throwaway each round.
      list.todos.set([persistent, Todo.create({ title: `t${i}`, done: false })])
    }

    const childMeta = instanceMeta.get(persistent)!
    // Exactly one upward-propagation listener on the persisting child, not 21.
    expect(childMeta.patchListeners.size).toBe(1)
    // meta.children holds only the CURRENT set's children (2), not 21+.
    const parentMeta = instanceMeta.get(list)!
    expect(parentMeta.children.size).toBe(2)
  })

  it('a child removed by a re-set no longer propagates to the parent', () => {
    const List = model({ state: { todos: [] as ReturnType<typeof Todo.create>[] } })
    const a = Todo.create({ title: 'a', done: false })
    const b = Todo.create({ title: 'b', done: false })
    const list = List.create({ todos: [a, b] })
    // Drop `a` from the array.
    list.todos.set([b])

    const patches: Patch[] = []
    onPatch(list, (p) => patches.push(p))
    // Mutating the DETACHED `a` must not reach the parent.
    a.toggle()
    expect(patches).toHaveLength(0)
    // Mutating the still-attached `b` still does.
    b.toggle()
    expect(patches.length).toBeGreaterThan(0)
  })

  it('field-nested children are unaffected (still propagate, not double-wired)', async () => {
    const Parent = model({ state: { child: Todo } })
    const p = Parent.create({ child: { title: 'c', done: false } })
    const patches: Patch[] = []
    onPatch(p, (x) => patches.push(x))
    const snaps: unknown[] = []
    onSnapshot(p, (s) => snaps.push(s))

    p.child().toggle()
    await Promise.resolve()

    // Exactly ONE patch (not two from a double-wire).
    expect(patches).toHaveLength(1)
    expect(patches[0]!.path).toBe('/child/done')
    expect(snaps).toHaveLength(1)
  })
})
