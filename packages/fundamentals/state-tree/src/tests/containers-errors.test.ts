import { describe, expect, it } from 'vitest'
import {
  applyPatch,
  applySnapshot,
  arrayOf,
  getSnapshot,
  identifier,
  mapOf,
  model,
  onPatch,
  reference,
} from '../index'
import type { Patch } from '../types'

const Todo = model({ state: { title: '', done: false } })
const Other = model({ state: { n: 0 } })

describe('arrayOf / mapOf — declaration and value errors', () => {
  it('rejects anything but a model definition', () => {
    expect(() => arrayOf(Todo.create() as never)).toThrow(
      /arrayOf\(\): expected a model definition/,
    )
    expect(() => mapOf(null as never)).toThrow(/mapOf\(\): expected a model definition.*got null/)
  })

  it('rejects a value of the wrong container kind or element shape', () => {
    const L = model({ state: { todos: arrayOf(Todo), byId: mapOf(Todo) } })
    expect(() => L.create({ todos: {} as never })).toThrow(
      /"todos" is declared with arrayOf\(\) and needs an array/,
    )
    expect(() => L.create({ todos: null as never })).toThrow(/needs an array, got null/)
    expect(() => L.create({ byId: [] as never })).toThrow(
      /"byId" is declared with mapOf\(\).*got an array/,
    )
    expect(() => L.create({ byId: 3 as never })).toThrow(/needs a plain object, got number/)
    expect(() => L.create({ todos: [5] as never })).toThrow(
      /"todos\/0" must be an array element snapshot.*got number/,
    )
    expect(() => L.create({ byId: { a: null } as never })).toThrow(
      /"byId\/a" must be a map element.*got null/,
    )
    expect(() => L.create({ byId: { a: [] } as never })).toThrow(/got an array/)
  })

  it('accepts live instances next to snapshots, and an unchanged snapshot writes nothing', () => {
    const L = model({ state: { todos: arrayOf(Todo), byId: mapOf(Todo) } })
    const live = Todo.create({ title: 'live' })
    const l = L.create({
      todos: [live, { title: 'snap', done: true }],
      byId: { x: { title: 'x', done: false } },
    })
    expect(l.todos()[0]).toBe(live)
    const log: Patch[] = []
    onPatch(l, (p) => log.push(p))
    applySnapshot(l, getSnapshot(l))
    expect(log).toEqual([])
    // a map snapshot with a different key set replaces the record
    applySnapshot(l, { byId: { y: { title: 'y', done: false } } })
    expect(Object.keys(l.byId())).toEqual(['y'])
  })
})

describe('applyPatch — path walking errors', () => {
  const Tag = model({ state: { id: identifier(), label: '' } })
  const Root = model({
    state: {
      count: 0,
      todos: arrayOf(Todo),
      byId: mapOf(Todo),
      tags: arrayOf(Tag),
      pinned: reference(Tag),
    },
  })
  const make = () =>
    Root.create({ todos: [{ title: 'a', done: false }], byId: { k: { title: 'k', done: false } } })

  it('names the step that cannot be walked', () => {
    const r = make()
    const p = (path: string) => () => applyPatch(r, { op: 'replace', path, value: 1 })
    expect(p('/pinned/label')).toThrow(/"pinned" is a reference field/)
    expect(p('/count/x')).toThrow(/"count" is not a nested model instance or container/)
    expect(p('/todos/5/done')).toThrow(/no element at index "5" in "\/todos\/5\/done"/)
    expect(p('/todos/01/done')).toThrow(/no element at index "01"/)
    expect(p('/byId/zz/done')).toThrow(/no entry "zz" in "\/byId\/zz\/done"/)
    expect(p('/nope/x')).toThrow(/unknown state key "nope"/)
    expect(p('/todos/0')).toThrow(/does not end at a model state field/)
  })

  it('a patch into an undeclared list that holds plain objects names arrayOf', () => {
    const L = model({ state: { todos: [] as { done: boolean }[] } })
    const l = L.create({ todos: [{ done: false }] })
    expect(() => applyPatch(l, { op: 'replace', path: '/todos/0/done', value: true })).toThrow(
      /reached a plain object, not a model instance.*arrayOf\(Model\)/,
    )
  })

  it('a value holding live instances is written as-is', () => {
    const L = model({ state: { todos: [] as ReturnType<typeof Todo.create>[] } })
    const l = L.create()
    const t = Todo.create({ title: 'live' })
    applyPatch(l, { op: 'replace', path: '/todos', value: [t] })
    expect(l.todos()[0]).toBe(t)
  })
})

describe('undeclared containers of mixed models', () => {
  it('reconcile the instances that line up and never write plain objects over them', () => {
    const L = model({ state: { items: [] as object[], byId: {} as Record<string, object> } })
    const a = Todo.create()
    const b = Other.create()
    const l = L.create({ items: [a, b], byId: { a: Todo.create(), b: Other.create() } })
    applySnapshot(l, {
      items: [{ title: 't', done: true }, { n: 2 }, { n: 3 }],
      byId: { b: { n: 9 } },
    } as never)
    expect(l.items()[0]).toBe(a)
    expect(l.items()).toHaveLength(2) // no element type to create the third from
    expect(getSnapshot(l)).toEqual({
      items: [{ title: 't', done: true }, { n: 2 }],
      byId: { a: { title: '', done: false }, b: { n: 9 } },
    })
  })
})
