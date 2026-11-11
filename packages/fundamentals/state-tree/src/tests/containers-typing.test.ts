import type { Signal } from '@pyreon/reactivity'
import { describe, expectTypeOf, it } from 'vitest'
import { arrayOf, getSnapshot, mapOf, model } from '../index'
import type { Snapshot } from '../index'

// Compile-time contract for arrayOf / mapOf (checked by the package's tsc;
// the bodies also run).
const Todo = model({ state: { title: '', done: false } })
type TodoI = ReturnType<typeof Todo.create>
const List = model({ state: { todos: arrayOf(Todo), byId: mapOf(Todo), tags: [] as string[] } })

describe('arrayOf / mapOf typing', () => {
  it('the field signal holds instances; the snapshot holds element snapshots', () => {
    const l = List.create()
    expectTypeOf(l.todos()[0]!).toEqualTypeOf<TodoI>()
    expectTypeOf(l.todos).toMatchTypeOf<Signal<TodoI[]>>()
    expectTypeOf(l.byId()['x']!).toEqualTypeOf<TodoI>()
    type S = Snapshot<{ todos: ReturnType<typeof arrayOf<typeof Todo>>; tags: string[] }>
    expectTypeOf<S['todos']>().toEqualTypeOf<{ title: string; done: boolean }[]>()
    expectTypeOf<S['tags']>().toEqualTypeOf<string[]>()
    expectTypeOf(
      getSnapshot<{ byId: ReturnType<typeof mapOf<typeof Todo>> }>(l).byId,
    ).toEqualTypeOf<Record<string, { title: string; done: boolean }>>()
  })

  it('create() takes element snapshots or live instances, nothing else', () => {
    List.create({ todos: [{ title: 'a', done: false }, Todo.create()], byId: { k: Todo.create() } })
    const typeOnly = () => {
      // @ts-expect-error — an element must be a Todo snapshot or instance
      List.create({ todos: [{ nope: 1 }] })
      // @ts-expect-error — mapOf takes a record, not an array
      List.create({ byId: [] as never[] as { title: string }[] })
    }
    void typeOnly
  })
})
