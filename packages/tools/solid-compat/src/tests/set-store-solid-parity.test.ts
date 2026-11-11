// Solid parity for `setStore`: object values are shallow-merged into an
// object at the path; a single-argument object / returned value updates the
// root; `produce` and `reconcile` replace (deletes stick).
import { createStore, produce, reconcile } from '../index'

describe('setStore — Solid merge/replace semantics', () => {
  test('setStore(path, object) shallow-merges into the object at the path', () => {
    const [st, set] = createStore({ user: { name: 'a', age: 1 } })
    set('user', { name: 'b' })
    expect(st.user).toEqual({ name: 'b', age: 1 })
    set('user', (u: { age: number }) => ({ age: u.age + 1 }))
    expect(st.user).toEqual({ name: 'b', age: 2 })
  })

  test('a filter-predicate path merges too', () => {
    const [st, set] = createStore({ todos: [{ id: 1, title: 't', done: false }] })
    set('todos', (t: { id: number }) => t.id === 1, { done: true })
    expect(st.todos[0]).toEqual({ id: 1, title: 't', done: true })
  })

  test('arrays and primitives at the path are replaced', () => {
    const [st, set] = createStore({ tags: ['a', 'b'], n: 1 })
    set('tags', ['c'])
    set('n', 2)
    expect(st.tags).toEqual(['c'])
    expect(st.n).toBe(2)
  })

  test('setStore(object) merges into the root', () => {
    const [st, set] = createStore({ a: 1, b: 2 })
    set({ a: 10 })
    expect({ a: st.a, b: st.b }).toEqual({ a: 10, b: 2 })
  })

  test('setStore(fn) merges the value the function returns', () => {
    const [st, set] = createStore({ a: 1, b: 2 })
    set((s: { a: number }) => ({ a: s.a + 1 }))
    expect({ a: st.a, b: st.b }).toEqual({ a: 2, b: 2 })
  })

  test('setStore(produce(...)) at the root applies, and a delete inside it sticks', () => {
    const [st, set] = createStore<{ user: { name: string }; tmp?: number }>({ user: { name: 'a' }, tmp: 1 })
    set(
      produce((s: { user: { name: string }; tmp?: number }) => {
        s.user.name = 'b'
        delete s.tmp
      }),
    )
    expect(st.user.name).toBe('b')
    expect('tmp' in st).toBe(false)
  })

  test('produce at a path replaces, so a deleted key is gone', () => {
    const [st, set] = createStore<{ user: { name: string; nick?: string } }>({ user: { name: 'a', nick: 'x' } })
    set(
      'user',
      produce((u: { name: string; nick?: string }) => {
        delete u.nick
      }),
    )
    expect(st.user).toEqual({ name: 'a' })
  })

  test('reconcile at a path replaces instead of merging', () => {
    const [st, set] = createStore({ user: { name: 'a', age: 1 } as { name: string; age?: number } })
    set('user', reconcile({ name: 'z' }))
    expect(st.user).toEqual({ name: 'z' })
  })

  test('the compat mutate-in-place function form still works', () => {
    const [st, set] = createStore({ count: 0 })
    set((s: { count: number }) => {
      s.count = 5
    })
    expect(st.count).toBe(5)
  })
})
