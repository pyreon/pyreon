import { s } from '@pyreon/validate'
import { describe, expect, it } from 'vitest'
import {
  applySnapshot,
  getSnapshot,
  identifier,
  model,
  reference,
  resolveIdentifier,
} from '../index'

// A small normalized store: users + posts (each referencing an author by id),
// all under one root so reference resolution can walk the shared tree.
const User = model({ state: { id: identifier(), name: '' } })
const Post = model({
  state: { id: identifier(), title: '', author: reference(User) },
})
const Store = model({
  state: {
    users: [] as ReturnType<typeof User.create>[],
    posts: [] as ReturnType<typeof Post.create>[],
  },
}).actions((self) => ({
  addUser: (id: string, name: string) =>
    self.users.update((l) => [...l, User.create({ id, name })]),
  addPost: (id: string, title: string, authorId: string) =>
    self.posts.update((l) => [...l, Post.create({ id, title, author: authorId })]),
}))

describe('identifier + resolveIdentifier', () => {
  it('finds a node by its identifier in the tree (plain mode)', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    store.addUser('u2', 'Lin')
    const found = resolveIdentifier(store, User, 'u2') as ReturnType<typeof User.create>
    expect(found).toBeDefined()
    expect(found.name()).toBe('Lin')
    expect(resolveIdentifier(store, User, 'nope')).toBeUndefined()
  })

  it('works with a schema-mode identifier (model({ schema, identifier }))', () => {
    const SUser = model({
      schema: s.object({ id: s.string(), name: s.string() }),
      initial: { id: '', name: '' },
      identifier: 'id',
    })
    const SStore = model({
      state: { users: [] as ReturnType<typeof SUser.create>[] },
    }).actions((self) => ({
      add: (id: string, name: string) => self.users.update((l) => [...l, SUser.create({ id, name })]),
    }))
    const st = SStore.create({ users: [] })
    st.add('a', 'Alpha')
    const found = resolveIdentifier(st, SUser, 'a') as ReturnType<typeof SUser.create>
    expect(found.name()).toBe('Alpha')
  })

  it('throws when the type has no identifier declared', () => {
    const Plain = model({ state: { x: 0 } })
    const store = Plain.create()
    expect(() => resolveIdentifier(store, Plain, 'x')).toThrow(/has no identifier/)
  })
})

describe('reference() field', () => {
  it('resolves to the live target node', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    store.addPost('p1', 'Hello', 'u1')
    const post = store.posts()[0]!
    const author = post.author() // resolves via getRoot(post) → Store → users
    expect(author).toBeDefined()
    expect(author!.name()).toBe('Ada')
  })

  it('serializes as the raw id in getSnapshot (not the resolved node)', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    store.addPost('p1', 'Hello', 'u1')
    // Snapshot the post directly — the reference field serializes as its id.
    const snap = getSnapshot(store.posts()[0]!) as { id: string; title: string; author: string | number }
    expect(snap.author).toBe('u1') // the id, NOT a nested user object
  })

  it('restores from a snapshot (applySnapshot sets the id) and re-resolves', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    store.addUser('u2', 'Lin')
    store.addPost('p1', 'Hello', 'u1')
    const post = store.posts()[0]!
    expect(post.author()!.name()).toBe('Ada')
    applySnapshot(post, { author: 'u2' })
    expect(post.author.id()).toBe('u2')
    expect(post.author()!.name()).toBe('Lin') // re-resolves to the new target
  })

  it('.set(node) stores the node id; .id() / .setId() read/write the raw id', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    store.addUser('u2', 'Lin')
    store.addPost('p1', 'Hello', 'u1')
    const post = store.posts()[0]!
    const lin = resolveIdentifier(store, User, 'u2') as ReturnType<typeof User.create>
    post.author.set(lin) // pass the NODE — its id is read
    expect(post.author.id()).toBe('u2')
    expect(post.author()!.name()).toBe('Lin')
    post.author.setId('u1') // raw id
    expect(post.author()!.name()).toBe('Ada')
  })

  it('resolves to undefined when the target is not in the tree', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addPost('p1', 'Orphan', 'ghost') // no such user
    expect(store.posts()[0]!.author()).toBeUndefined()
  })
})
