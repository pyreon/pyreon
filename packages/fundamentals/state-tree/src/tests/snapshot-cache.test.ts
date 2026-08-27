import { describe, expect, it } from 'vitest'
import { applySnapshot, getSnapshot, identifier, model, onSnapshot, reference } from '../index'

// getSnapshot caches its result (MST-aligned) and invalidates on EVERY write.
// The "same object on repeated calls" checks are the structural proof of the win
// (a rebuild would allocate a new object), and are load-immune. The
// "different object + correct value after a write" checks lock invalidation
// across every write path: leaf, nested child, reference id, and applySnapshot.
describe('getSnapshot caching', () => {
  const Todo = model({ state: { title: '', done: false } })

  it('returns the SAME object on repeated calls when nothing changed (cached)', () => {
    const t = Todo.create({ title: 'a' })
    const s1 = getSnapshot(t)
    const s2 = getSnapshot(t)
    expect(s2).toBe(s1) // no rebuild
    expect(s1).toEqual({ title: 'a', done: false })
  })

  it('rebuilds after a LEAF write, with the new value', () => {
    const t = Todo.create({ title: 'a' })
    const s1 = getSnapshot(t)
    t.title.set('b')
    const s2 = getSnapshot(t)
    expect(s2).not.toBe(s1)
    expect(s2.title).toBe('b')
    // and re-caches
    expect(getSnapshot(t)).toBe(s2)
  })

  it('rebuilds after a NESTED-child write (parent cache invalidated via the patch chain)', () => {
    const Profile = model({ state: { name: '' } })
    const App = model({ state: { profile: Profile, title: '' } })
    const app = App.create({ profile: { name: 'x' }, title: 't' })
    const s1 = getSnapshot(app)
    expect(s1).toEqual({ profile: { name: 'x' }, title: 't' })
    app.profile().name.set('y')
    const s2 = getSnapshot(app)
    expect(s2).not.toBe(s1)
    expect((s2.profile as { name: string }).name).toBe('y')
  })

  it('rebuilds after a REFERENCE id write (idSig bypasses afterSet/emitPatch)', () => {
    const User = model({ state: { id: identifier(), name: '' } })
    const Post = model({ state: { id: identifier(), title: '', author: reference(User) } })
    const Store = model({
      state: {
        users: [] as ReturnType<typeof User.create>[],
        posts: [] as ReturnType<typeof Post.create>[],
      },
    })
    const store = Store.create({
      users: [User.create({ id: 'u1', name: 'Ada' }), User.create({ id: 'u2', name: 'Lin' })],
      posts: [Post.create({ id: 'p1', title: 'hi', author: 'u1' })],
    })
    const post = store.posts()[0]!
    const s1 = getSnapshot(post)
    expect(s1.author as string).toBe('u1')
    post.author.setId('u2')
    const s2 = getSnapshot(post)
    expect(s2).not.toBe(s1)
    expect(s2.author as string).toBe('u2')
  })

  it('rebuilds after applySnapshot', () => {
    const t = Todo.create({ title: 'a' })
    const s1 = getSnapshot(t)
    applySnapshot(t, { title: 'z' })
    const s2 = getSnapshot(t)
    expect(s2).not.toBe(s1)
    expect(s2.title).toBe('z')
  })

  it('onSnapshot still fires after the cache has been primed', async () => {
    const t = Todo.create({ title: 'a' })
    getSnapshot(t) // prime the cache
    let fired: { title: string; done: boolean } | null = null
    onSnapshot(t, (snap) => {
      fired = snap as { title: string; done: boolean }
    })
    t.title.set('c')
    await Promise.resolve()
    expect(fired).not.toBeNull()
    expect(fired!.title).toBe('c')
  })
})
