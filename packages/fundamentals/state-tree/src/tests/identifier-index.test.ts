import { describe, expect, it, vi } from 'vitest'
import { destroy, identifier, model, reference, resolveIdentifier } from '../index'
import { instanceMeta } from '../registry'

// A normalized store: users (identified) + posts (each referencing an author).
const User = model({ state: { id: identifier(), name: '' } })
const Post = model({ state: { id: identifier(), title: '', author: reference(User) } })
const Store = model({
  state: {
    users: [] as ReturnType<typeof User.create>[],
    posts: [] as ReturnType<typeof Post.create>[],
  },
}).actions((self) => ({
  addUser: (id: string, name: string) => self.users.update((l) => [...l, User.create({ id, name })]),
  addPost: (id: string, title: string, authorId: string) =>
    self.posts.update((l) => [...l, Post.create({ id, title, author: authorId })]),
  removeUser: (id: string) => self.users.update((l) => l.filter((u) => u.id() !== id)),
}))

/**
 * The identifier index is PURE ACCELERATION over `resolveIdentifier`'s tree
 * DFS. These specs pin (a) that it actually short-cuts the walk on a repeated
 * resolve — the perf claim — and (b) that every structural mutation that could
 * stale an entry (id-change, detach, destroy, re-parent, late attach) still
 * resolves correctly via validate-on-hit + DFS fallback.
 */
describe('identifier index — validated acceleration', () => {
  it('a repeated resolve skips the tree walk (index hit is O(depth), not O(N))', () => {
    const store = Store.create({ users: [], posts: [] })
    for (let i = 0; i < 50; i++) store.addUser(`u${i}`, `name-${i}`)

    const spy = vi.spyOn(instanceMeta, 'get')

    spy.mockClear()
    const first = resolveIdentifier(store, User, 'u0') as ReturnType<typeof User.create>
    const firstWalk = spy.mock.calls.length

    spy.mockClear()
    const second = resolveIdentifier(store, User, 'u0') as ReturnType<typeof User.create>
    const secondWalk = spy.mock.calls.length

    spy.mockRestore()

    expect(first).toBe(second) // same node
    expect(first.name()).toBe('name-0')
    // The DFS visits the tree (many instanceMeta.get); the validated index hit
    // touches only the candidate + its ancestor chain to the root.
    expect(firstWalk).toBeGreaterThan(10)
    expect(secondWalk).toBeLessThan(firstWalk)
    expect(secondWalk).toBeLessThanOrEqual(6)
  })

  it('an index hit returns the SAME node the DFS would (parity over many resolves)', () => {
    const store = Store.create({ users: [], posts: [] })
    for (let i = 0; i < 20; i++) store.addUser(`u${i}`, `n${i}`)
    for (let i = 0; i < 20; i++) {
      const viaIndex = resolveIdentifier(store, User, `u${i}`) // 2nd+ are cached
      const again = resolveIdentifier(store, User, `u${i}`)
      expect(viaIndex).toBe(again)
      expect((again as ReturnType<typeof User.create>).name()).toBe(`n${i}`)
    }
  })

  it('id-change: the stale entry is not returned; both old and new ids resolve correctly', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    const user = resolveIdentifier(store, User, 'u1') as ReturnType<typeof User.create>
    expect(user.name()).toBe('Ada')
    // warm the cache for 'u1', then change the id
    resolveIdentifier(store, User, 'u1')
    user.id.set('u1-renamed')
    // old id no longer resolves (stale entry validated away + DFS finds nothing)
    expect(resolveIdentifier(store, User, 'u1')).toBeUndefined()
    // new id resolves to the same node
    expect(resolveIdentifier(store, User, 'u1-renamed')).toBe(user)
    // and repeats correctly (now cached under the new id)
    expect(resolveIdentifier(store, User, 'u1-renamed')).toBe(user)
  })

  it('detach: a node spliced out of the tree stops resolving from that root', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    store.addUser('u2', 'Lin')
    expect(resolveIdentifier(store, User, 'u2')).toBeDefined() // warm cache
    resolveIdentifier(store, User, 'u2')
    store.removeUser('u2')
    // getRoot(detached) !== store → validated away → DFS → not found
    expect(resolveIdentifier(store, User, 'u2')).toBeUndefined()
    expect(resolveIdentifier(store, User, 'u1')).toBeDefined() // sibling still resolves
  })

  it('destroy: a destroyed node is not resolved', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    const user = resolveIdentifier(store, User, 'u1') as ReturnType<typeof User.create>
    resolveIdentifier(store, User, 'u1') // warm cache
    store.removeUser('u1') // detach
    destroy(user) // and destroy
    expect(resolveIdentifier(store, User, 'u1')).toBeUndefined()
  })

  it('re-parent: a node moved to a new store resolves from the new root', () => {
    const storeA = Store.create({ users: [], posts: [] })
    const storeB = Store.create({ users: [], posts: [] })
    storeA.addUser('u1', 'Ada')
    const user = resolveIdentifier(storeA, User, 'u1') as ReturnType<typeof User.create>
    resolveIdentifier(storeA, User, 'u1') // cache under storeA
    // move it: remove from A, add the same instance to B
    storeA.removeUser('u1')
    storeB.users.update((l) => [...l, user])
    // from A: gone. from B: found (cache entry validated against the query root)
    expect(resolveIdentifier(storeA, User, 'u1')).toBeUndefined()
    expect(resolveIdentifier(storeB, User, 'u1')).toBe(user)
  })

  it('late attach: a reference to an as-yet-absent id is not negatively cached', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addPost('p1', 'Hello', 'u-late')
    const post = store.posts()[0]!
    expect(post.author()).toBeUndefined() // target not in the tree yet — a miss
    // A miss must NOT be cached: after the target attaches, it resolves.
    store.addUser('u-late', 'Grace')
    expect(post.author()).toBeDefined()
    expect(post.author()!.name()).toBe('Grace')
  })
})
