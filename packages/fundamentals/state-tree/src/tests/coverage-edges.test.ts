import { s } from '@pyreon/validate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  destroy,
  getPath,
  identifier,
  isAlive,
  model,
  onSnapshot,
  reference,
  resolveIdentifier,
} from '../index'

const tick = () => new Promise<void>((r) => queueMicrotask(r))

// Targeted coverage for the disposed-instance guards, idempotent teardown,
// and no-op write fast-paths — branches the happy-path suites don't exercise.
// The validated mutators (set/patch/deepPatch/update/reset) are schema-mode.

const Counter = model({
  schema: s.object({ count: s.number(), label: s.string() }),
  initial: { count: 0, label: 'a' },
})

describe('disposed-instance guards', () => {
  afterEach(() => vi.restoreAllMocks())

  it('set / patch / deepPatch / update / reset are no-ops after destroy()', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = Counter.create({ count: 1, label: 'x' })
    destroy(m)
    expect(isAlive(m)).toBe(false)
    // every mutator early-returns via guardAlive(...) → state is frozen
    m.set({ count: 9, label: 'z' })
    m.patch({ count: 9 })
    m.deepPatch({ count: 9 })
    m.update('count', () => 9)
    m.reset()
    expect(m.count()).toBe(1)
    expect(m.label()).toBe('x')
    expect(warn).toHaveBeenCalled() // dev-warns once per guarded op
  })

  it('destroy() is idempotent — a second call is a no-op', () => {
    const m = Counter.create()
    destroy(m)
    expect(() => destroy(m)).not.toThrow()
    expect(isAlive(m)).toBe(false)
  })

  it('calling an action on a destroyed instance warns (dev) and is ignored', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const M = model({ state: { count: 0 } }).actions((self) => ({
      inc: () => self.count.update((c: number) => c + 1),
    }))
    const m = M.create()
    destroy(m)
    m.inc()
    expect(m.count()).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/destroyed model instance/))
  })
})

describe('no-op write fast-paths', () => {
  it('update(key, () => sameValue) skips the signal write (Object.is short-circuit)', () => {
    const m = Counter.create({ count: 5, label: 'a' })
    // transformer returns the identical value → the `!Object.is` guard skips sig.set
    m.update('count', () => 5)
    expect(m.count()).toBe(5)
  })
})

describe('onSnapshot input validation', () => {
  it('throws when given a non-instance', () => {
    expect(() => onSnapshot({} as object, () => {})).toThrow(/not a model instance/)
  })

  it('does not notify a listener that unsubscribes before the microtask flush', async () => {
    const M = model({ state: { count: 0 } }).actions((self) => ({
      inc: () => self.count.update((c: number) => c + 1),
    }))
    const m = M.create()
    const seen: unknown[] = []
    const unsub = onSnapshot(m, (snap) => seen.push(snap))
    m.inc() // schedules a notify
    unsub() // remove the only listener before the queued microtask runs
    await tick()
    expect(seen).toEqual([]) // the post-flush size===0 guard short-circuits
  })

  it('still notifies a live listener after a write', async () => {
    const M = model({ state: { count: 0 } }).actions((self) => ({
      inc: () => self.count.update((c: number) => c + 1),
    }))
    const m = M.create()
    const seen: Array<{ count: number }> = []
    onSnapshot(m, (snap) => seen.push(snap as { count: number }))
    m.inc()
    await tick()
    expect(seen).toEqual([{ count: 1 }])
  })
})

describe('getPath input validation', () => {
  it('throws when the starting node is not a model instance', () => {
    expect(() => getPath({} as object)).toThrow(/not a model instance/)
  })
})

describe('volatile-field validation at create()', () => {
  it('rejects a volatile key that collides with a reserved schema-mode helper', () => {
    const M = model({
      schema: s.object({ count: s.number() }),
      initial: { count: 0 },
    }).volatile(() => ({ patch: 0 })) // `patch` is a reserved mutation helper
    expect(() => M.create()).toThrow(/reserved schema-mode mutation helper/)
  })

  it('rejects a duplicate volatile key across two factories', () => {
    const M = model({ state: { count: 0 } })
      .volatile(() => ({ scratch: 0 }))
      .volatile(() => ({ scratch: 1 })) // duplicate
    expect(() => M.create()).toThrow(/duplicate volatile field/)
  })
})

describe('identifier + non-instance value walk edges', () => {
  it('supports a model with two identifier() fields (second clones the state object)', () => {
    const Dual = model({ state: { id: identifier(), code: identifier() } })
    const d = Dual.create()
    // the second identifier marker takes the `state !== rawState` branch in model setup
    expect(typeof d.id()).toBe('string')
    expect(typeof d.code()).toBe('string')
  })

  it('a reference field with no initial value resolves to undefined', () => {
    const User = model({ state: { id: identifier(), name: '' } })
    const Doc = model({ state: { id: identifier(), owner: reference(User) } })
    const doc = Doc.create({ id: 'd1' }) // owner unset → initial id normalizes to null
    expect(doc.owner.id()).toBeNull()
    expect(doc.owner()).toBeUndefined()
  })

  it('skips a field whose value is a non-plain object (class instance) during the walk', () => {
    const User = model({ state: { id: identifier(), name: '' } })
    const WithDate = model({
      state: { id: identifier(), at: new Date(0), users: [] as ReturnType<typeof User.create>[] },
    }).actions((self) => ({
      add: (u: ReturnType<typeof User.create>) => self.users.update((l) => [...l, u]),
    }))
    const w = WithDate.create({ id: 'w1' })
    w.add(User.create({ id: 'u1', name: 'Ada' }))
    // the `at` Date field is a non-plain object → collectInstances skips it (proto check),
    // while the user in the array is still found
    const found = resolveIdentifier(w, User, 'u1') as ReturnType<typeof User.create>
    expect(found.name()).toBe('Ada')
  })
})
