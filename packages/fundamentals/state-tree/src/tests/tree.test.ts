import { describe, expect, it } from 'vitest'
import {
  getParent,
  getPath,
  getRoot,
  hasParent,
  isRoot,
  model,
} from '../index'

describe('tree helpers — field-nested models', () => {
  const Child = model({ state: { v: 0 } })
  const Parent = model({ state: { child: Child, name: '' } })

  it('getParent / getRoot / isRoot / hasParent / getPath for a field-nested child', () => {
    const p = Parent.create()
    const c = p.child() as object
    expect(getParent(c)).toBe(p)
    expect(getRoot(c)).toBe(p)
    expect(isRoot(p)).toBe(true)
    expect(isRoot(c)).toBe(false)
    expect(hasParent(p)).toBe(false)
    expect(hasParent(c)).toBe(true)
    expect(getParent(p)).toBeUndefined()
    expect(getPath(c)).toBe('/child')
    expect(getPath(p)).toBe('')
  })

  it('walks deep nesting for getRoot + getPath', () => {
    const C = model({ state: { x: 0 } })
    const B = model({ state: { c: C } })
    const A = model({ state: { b: B } })
    const a = A.create()
    const b = a.b() as object
    const c = (b as { c: () => object }).c()
    expect(getRoot(c)).toBe(a)
    expect(getPath(c)).toBe('/b/c')
    expect(getParent(c)).toBe(b)
  })
})

describe('tree helpers — array children (the headline composition shape)', () => {
  const Todo = model({ state: { title: '', done: false } }).actions((self) => ({
    toggle: () => self.done.set(!self.done()),
  }))
  const TodoList = model({ state: { todos: [] as ReturnType<typeof Todo.create>[] } }).actions(
    (self) => ({
      add: (title: string) => {
        const todo = Todo.create({ title, done: false })
        self.todos.update((list) => [...list, todo])
      },
    }),
  )

  it('attaches a parent to an array-held child added via an action', () => {
    const list = TodoList.create({ todos: [] })
    list.add('write tests')
    const todo = list.todos()[0] as object
    // The B3 fix: array children get a parent, not just field-nested ones.
    expect(getParent(todo)).toBe(list)
    expect(getRoot(todo)).toBe(list)
    expect(getPath(todo)).toBe('/todos')
    expect(isRoot(todo)).toBe(false)
  })

  it('attaches parents to children present in an INITIAL array', () => {
    const a = Todo.create({ title: 'a', done: false })
    const b = Todo.create({ title: 'b', done: false })
    const list = TodoList.create({ todos: [a, b] })
    expect(getParent(list.todos()[0] as object)).toBe(list)
    expect(getParent(list.todos()[1] as object)).toBe(list)
  })

  it('attaches a parent when an array is REPLACED after creation (afterSet hook)', () => {
    const list = TodoList.create({ todos: [] })
    const fresh = Todo.create({ title: 'late', done: false })
    list.todos.set([fresh])
    expect(getParent(list.todos()[0] as object)).toBe(list)
  })
})

describe('tree helpers — guards', () => {
  it('throws on a non-model-instance', () => {
    expect(() => getParent({})).toThrow(/not a model instance/)
    expect(() => getRoot({})).toThrow(/not a model instance/)
    expect(() => getPath({})).toThrow(/not a model instance/)
    expect(() => isRoot({})).toThrow(/not a model instance/)
  })
})
