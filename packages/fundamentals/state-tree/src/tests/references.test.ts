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

describe('resolveIdentifier walks non-array nested-instance containers', () => {
  // The array case (users/posts) is exercised above. These cover the other two
  // container shapes collectInstances handles: a field holding a SINGLE nested
  // instance, and a field holding a plain-object map of instances.
  it('finds an instance held DIRECTLY in a field (not wrapped in an array)', () => {
    const Workspace = model({
      state: {
        id: identifier(),
        owner: undefined as ReturnType<typeof User.create> | undefined,
      },
    }).actions((self) => ({
      setOwner: (u: ReturnType<typeof User.create>) => self.owner.set(u),
    }))
    const ws = Workspace.create({ id: 'w1' })
    ws.setOwner(User.create({ id: 'u1', name: 'Ada' }))
    const found = resolveIdentifier(ws, User, 'u1') as ReturnType<typeof User.create>
    expect(found).toBeDefined()
    expect(found.name()).toBe('Ada')
    expect(resolveIdentifier(ws, User, 'nope')).toBeUndefined()
  })

  it('finds instances inside a plain-object map field', () => {
    const Registry = model({
      state: {
        id: identifier(),
        byId: {} as Record<string, ReturnType<typeof User.create>>,
      },
    }).actions((self) => ({
      put: (k: string, u: ReturnType<typeof User.create>) =>
        self.byId.update((m) => ({ ...m, [k]: u })),
    }))
    const reg = Registry.create({ id: 'r1' })
    reg.put('a', User.create({ id: 'u9', name: 'Zed' }))
    reg.put('b', User.create({ id: 'u10', name: 'Yan' }))
    const zed = resolveIdentifier(reg, User, 'u9') as ReturnType<typeof User.create>
    expect(zed.name()).toBe('Zed')
    const yan = resolveIdentifier(reg, User, 'u10') as ReturnType<typeof User.create>
    expect(yan.name()).toBe('Yan')
  })

  it('resolveIdentifier returns undefined for a null/undefined id', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    expect(resolveIdentifier(store, User, null)).toBeUndefined()
    expect(resolveIdentifier(store, User, undefined)).toBeUndefined()
  })
})

describe('reference() field — peek and identifier defaults', () => {
  // Note: the public create-input type for a reference field is id-only
  // (`string | number`), so seeding a reference with a NODE at construction is
  // type-unreachable — the runtime node-normalization for the .set(node) path is
  // covered by the '.set(node) stores the node id' test above.
  it('.peek() resolves without subscribing', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    store.addPost('p1', 'Hello', 'u1')
    const post = store.posts()[0]!
    expect(post.author.peek()!.name()).toBe('Ada')
  })

  it('identifier(default) seeds the marker default', () => {
    const Seeded = model({ state: { id: identifier('seed-0'), name: '' } })
    const inst = Seeded.create({ name: 'x' })
    expect(inst.id()).toBe('seed-0')
  })
})

describe('instance-walk + reference branch edges', () => {
  // collectInstances ignores non-instance siblings in array and plain-object
  // containers, and the walk is cycle-safe (a node reachable twice is visited once).
  it('ignores non-instance entries in array and map fields, and is cycle-safe', () => {
    const Mixed = model({
      state: {
        id: identifier(),
        // array with an instance AND a non-instance entry → collectInstances skips the latter
        list: [] as unknown[],
        // plain-object map mixing an instance, a plain value, and a class instance (non-plain object)
        map: {} as Record<string, unknown>,
      },
    }).actions((self) => ({
      seed: (u: ReturnType<typeof User.create>) => {
        self.list.update(() => [u, 'not-an-instance', 42])
        self.map.update(() => ({ a: u, b: 'plain', c: new Date(0) }))
      },
    }))
    const m = Mixed.create({ id: 'm1' })
    const ada = User.create({ id: 'u1', name: 'Ada' })
    m.seed(ada)
    // both containers carry the same instance; the walk dedupes (seen-set) and finds it once
    const found = resolveIdentifier(m, User, 'u1') as ReturnType<typeof User.create>
    expect(found.name()).toBe('Ada')
    // the non-instance siblings ('not-an-instance', 42, 'plain', Date) are simply skipped
    expect(resolveIdentifier(m, User, 'missing')).toBeUndefined()
  })

  it('an unset reference resolves to undefined; setId(null) clears it; set accepts a raw id', () => {
    const store = Store.create({ users: [], posts: [] })
    store.addUser('u1', 'Ada')
    store.addPost('p1', 'Hello', 'u1')
    const post = store.posts()[0]!
    // set via a RAW ID (the non-node branch of accessor.set)
    post.author.set('u1')
    expect(post.author()!.name()).toBe('Ada')
    // setId(null) clears → resolve sees a null id and returns undefined
    post.author.setId(null)
    expect(post.author.id()).toBeNull()
    expect(post.author()).toBeUndefined()
  })
})
