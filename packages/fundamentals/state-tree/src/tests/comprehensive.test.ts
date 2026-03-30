import { computed, effect } from '@pyreon/reactivity'
import type { Patch } from '../index'
import {
  addMiddleware,
  applyPatch,
  applySnapshot,
  getSnapshot,
  model,
  onPatch,
  resetAllHooks,
  resetHook,
} from '../index'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const Counter = model({
  state: { count: 0 },
  views: (self) => ({
    doubled: computed(() => self.count() * 2),
  }),
  actions: (self) => ({
    inc: () => self.count.update((c: number) => c + 1),
    dec: () => self.count.update((c: number) => c - 1),
    add: (n: number) => self.count.update((c: number) => c + n),
    reset: () => self.count.set(0),
  }),
})

const Profile = model({
  state: { name: '', bio: '' },
  actions: (self) => ({
    rename: (n: string) => self.name.set(n),
    setBio: (b: string) => self.bio.set(b),
  }),
})

const App = model({
  state: { profile: Profile, title: 'My App' },
  actions: (self) => ({
    setTitle: (t: string) => self.title.set(t),
  }),
})

// ─── getSnapshot — JSON-serializable output ────────────────────────────────

describe('getSnapshot — JSON-serializable output', () => {
  it("returns a plain object that can be JSON.stringify'd and parsed back", () => {
    const c = Counter.create({ count: 42 })
    const snap = getSnapshot(c)
    const json = JSON.stringify(snap)
    const parsed = JSON.parse(json)
    expect(parsed).toEqual({ count: 42 })
  })

  it('snapshot contains no signal functions', () => {
    const c = Counter.create({ count: 5 })
    const snap = getSnapshot(c)
    for (const val of Object.values(snap)) {
      expect(typeof val).not.toBe('function')
    }
  })

  it('nested model snapshot is fully serializable', () => {
    const app = App.create({
      profile: { name: 'Alice', bio: 'dev' },
      title: 'Test',
    })
    const snap = getSnapshot(app)
    const json = JSON.stringify(snap)
    const parsed = JSON.parse(json)
    expect(parsed).toEqual({
      profile: { name: 'Alice', bio: 'dev' },
      title: 'Test',
    })
  })

  it('snapshot does not include views or actions', () => {
    const c = Counter.create({ count: 3 })
    const snap = getSnapshot(c)
    expect(snap).toEqual({ count: 3 })
    expect(snap).not.toHaveProperty('doubled')
    expect(snap).not.toHaveProperty('inc')
  })
})

// ─── applySnapshot — restores model state ──────────────────────────────────

describe('applySnapshot — restores model state', () => {
  it('restores a complete snapshot', () => {
    const c = Counter.create({ count: 99 })
    applySnapshot(c, { count: 0 })
    expect(c.count()).toBe(0)
  })

  it('restores partial snapshot — only specified keys', () => {
    const M = model({ state: { a: 1, b: 2, c: 3 } })
    const m = M.create({ a: 10, b: 20, c: 30 })
    applySnapshot(m, { b: 99 })
    expect(m.a()).toBe(10)
    expect(m.b()).toBe(99)
    expect(m.c()).toBe(30)
  })

  it('restores nested model state recursively', () => {
    const app = App.create({
      profile: { name: 'Alice', bio: 'dev' },
      title: 'Old',
    })
    applySnapshot(app, {
      profile: { name: 'Bob', bio: 'engineer' },
      title: 'New',
    })
    expect(app.profile().name()).toBe('Bob')
    expect(app.profile().bio()).toBe('engineer')
    expect(app.title()).toBe('New')
  })

  it('roundtrips: getSnapshot -> applySnapshot produces same state', () => {
    const app = App.create({
      profile: { name: 'Carol', bio: 'designer' },
      title: 'Portfolio',
    })
    const snap = getSnapshot(app)

    const app2 = App.create()
    applySnapshot(app2, snap)
    expect(getSnapshot(app2)).toEqual(snap)
  })

  it('batches updates — effect fires once for multi-field snapshot', () => {
    const M = model({ state: { x: 0, y: 0, z: 0 } })
    const m = M.create()
    let effectRuns = 0
    effect(() => {
      m.x()
      m.y()
      m.z()
      effectRuns++
    })
    effectRuns = 0
    applySnapshot(m, { x: 1, y: 2, z: 3 })
    expect(effectRuns).toBe(1)
  })
})

// ─── onPatch — listener receives correct format ────────────────────────────

describe('onPatch — patch format', () => {
  it('patch has op, path, and value fields', () => {
    const c = Counter.create()
    const patches: Patch[] = []
    onPatch(c, (p) => patches.push(p))
    c.inc()
    expect(patches).toHaveLength(1)
    expect(patches[0]).toHaveProperty('op', 'replace')
    expect(patches[0]).toHaveProperty('path', '/count')
    expect(patches[0]).toHaveProperty('value', 1)
  })

  it('path uses JSON pointer format with leading slash', () => {
    const c = Counter.create()
    const patches: Patch[] = []
    onPatch(c, (p) => patches.push(p))
    c.add(5)
    expect(patches[0]!.path).toMatch(/^\//)
  })

  it('nested model patches have composite paths', () => {
    const app = App.create({ profile: { name: 'A', bio: '' }, title: '' })
    const patches: Patch[] = []
    onPatch(app, (p) => patches.push(p))

    app.profile().rename('B')
    expect(patches[0]!.path).toBe('/profile/name')
  })

  it('value contains new value after mutation, not old', () => {
    const c = Counter.create({ count: 10 })
    const patches: Patch[] = []
    onPatch(c, (p) => patches.push(p))

    c.add(5)
    expect(patches[0]!.value).toBe(15)
  })

  it('emits patches for each signal write in sequence', () => {
    const c = Counter.create()
    const patches: Patch[] = []
    onPatch(c, (p) => patches.push(p))

    c.inc()
    c.inc()
    c.add(10)

    expect(patches).toHaveLength(3)
    expect(patches.map((p) => p.value)).toEqual([1, 2, 12])
  })
})

// ─── applyPatch — applies patches correctly ────────────────────────────────

describe('applyPatch — applies patches', () => {
  it('applies a single replace patch to top-level field', () => {
    const c = Counter.create()
    applyPatch(c, { op: 'replace', path: '/count', value: 42 })
    expect(c.count()).toBe(42)
  })

  it('applies array of patches in order', () => {
    const c = Counter.create()
    applyPatch(c, [
      { op: 'replace', path: '/count', value: 5 },
      { op: 'replace', path: '/count', value: 10 },
    ])
    expect(c.count()).toBe(10)
  })

  it('applies patches to nested model instances', () => {
    const app = App.create({
      profile: { name: 'A', bio: 'b' },
      title: 't',
    })
    applyPatch(app, { op: 'replace', path: '/profile/name', value: 'B' })
    expect(app.profile().name()).toBe('B')
  })

  it('roundtrip: record patches with onPatch, replay on fresh instance', () => {
    const original = Counter.create()
    const patches: Patch[] = []
    onPatch(original, (p) => patches.push({ ...p }))

    original.inc()
    original.add(10)
    original.dec()

    const replica = Counter.create()
    applyPatch(replica, patches)
    expect(replica.count()).toBe(original.count())
    expect(getSnapshot(replica)).toEqual(getSnapshot(original))
  })

  it('throws for unsupported op', () => {
    const c = Counter.create()
    expect(() => applyPatch(c, { op: 'add' as any, path: '/count', value: 1 })).toThrow(
      'unsupported op',
    )
  })

  it('throws for empty path', () => {
    const c = Counter.create()
    expect(() => applyPatch(c, { op: 'replace', path: '', value: 1 })).toThrow('empty path')
  })

  it('throws for unknown key', () => {
    const c = Counter.create()
    expect(() => applyPatch(c, { op: 'replace', path: '/unknown', value: 1 })).toThrow(
      'unknown state key',
    )
  })

  it('throws for non-model instance', () => {
    expect(() => applyPatch({}, { op: 'replace', path: '/x', value: 1 })).toThrow(
      'not a model instance',
    )
  })
})

// ─── addMiddleware — intercepts actions ────────────────────────────────────

describe('addMiddleware — intercepts actions', () => {
  it('captures action name and args', () => {
    const c = Counter.create()
    const calls: { name: string; args: unknown[] }[] = []
    addMiddleware(c, (call, next) => {
      calls.push({ name: call.name, args: [...call.args] })
      return next(call)
    })
    c.add(5)
    expect(calls).toEqual([{ name: 'add', args: [5] }])
  })

  it('middleware can block action by not calling next', () => {
    const c = Counter.create()
    addMiddleware(c, () => {
      /* intentionally block */
    })
    c.inc()
    expect(c.count()).toBe(0)
  })

  it('middleware can modify args', () => {
    const c = Counter.create()
    addMiddleware(c, (call, next) => {
      if (call.name === 'add') {
        return next({ ...call, args: [(call.args[0] as number) * 3] })
      }
      return next(call)
    })
    c.add(5)
    expect(c.count()).toBe(15) // 5 * 3
  })

  it('unsub removes the middleware', () => {
    const c = Counter.create()
    const log: string[] = []
    const unsub = addMiddleware(c, (call, next) => {
      log.push(call.name)
      return next(call)
    })
    c.inc()
    expect(log).toHaveLength(1)

    unsub()
    c.inc()
    expect(log).toHaveLength(1) // no new entries
  })

  it('multiple middlewares execute in Koa-style onion order', () => {
    const c = Counter.create()
    const log: string[] = []
    addMiddleware(c, (call, next) => {
      log.push('A:before')
      const r = next(call)
      log.push('A:after')
      return r
    })
    addMiddleware(c, (call, next) => {
      log.push('B:before')
      const r = next(call)
      log.push('B:after')
      return r
    })
    c.inc()
    expect(log).toEqual(['A:before', 'B:before', 'B:after', 'A:after'])
  })
})

// ─── Nested model composition ──────────────────────────────────────────────

describe('nested model composition', () => {
  it('deeply nested models work correctly', () => {
    const Leaf = model({
      state: { val: 0 },
      actions: (self) => ({
        set: (v: number) => self.val.set(v),
      }),
    })
    const Branch = model({
      state: { leaf: Leaf, tag: '' },
      actions: (self) => ({
        setTag: (t: string) => self.tag.set(t),
      }),
    })
    const Root = model({
      state: { branch: Branch, name: 'root' },
    })

    const root = Root.create({
      branch: { leaf: { val: 42 }, tag: 'test' },
      name: 'myRoot',
    })

    expect(root.branch().leaf().val()).toBe(42)
    expect(root.branch().tag()).toBe('test')
    expect(root.name()).toBe('myRoot')
  })

  it('nested model patches propagate up with correct paths', () => {
    const Leaf = model({
      state: { val: 0 },
      actions: (self) => ({
        setVal: (v: number) => self.val.set(v),
      }),
    })
    const Branch = model({
      state: { leaf: Leaf },
    })
    const Root = model({
      state: { branch: Branch },
    })

    const root = Root.create()
    const patches: Patch[] = []
    onPatch(root, (p) => patches.push(p))

    root.branch().leaf().setVal(99)
    expect(patches).toHaveLength(1)
    expect(patches[0]!.path).toBe('/branch/leaf/val')
    expect(patches[0]!.value).toBe(99)
  })

  it('nested getSnapshot serializes all levels', () => {
    const Leaf = model({ state: { x: 1 } })
    const Mid = model({ state: { leaf: Leaf, y: 2 } })
    const Top = model({ state: { mid: Mid, z: 3 } })

    const top = Top.create()
    expect(getSnapshot(top)).toEqual({
      mid: { leaf: { x: 1 }, y: 2 },
      z: 3,
    })
  })

  it('applyPatch to deeply nested path works', () => {
    const Leaf = model({ state: { x: 0 } })
    const Mid = model({ state: { leaf: Leaf } })
    const Top = model({ state: { mid: Mid } })

    const top = Top.create()
    applyPatch(top, { op: 'replace', path: '/mid/leaf/x', value: 999 })
    expect(top.mid().leaf().x()).toBe(999)
  })
})

// ─── asHook — singleton hook ───────────────────────────────────────────────

describe('asHook — creates singleton hook', () => {
  afterEach(() => resetAllHooks())

  it('returns the same instance every time', () => {
    const useC = Counter.asHook('hook-same')
    const a = useC()
    const b = useC()
    expect(a).toBe(b)
  })

  it('state mutations persist across calls', () => {
    const useC = Counter.asHook('hook-persist')
    useC().add(10)
    expect(useC().count()).toBe(10)
  })

  it('different ids yield independent instances', () => {
    const useA = Counter.asHook('hook-id-a')
    const useB = Counter.asHook('hook-id-b')
    useA().add(5)
    expect(useA().count()).toBe(5)
    expect(useB().count()).toBe(0)
  })

  it('resetHook clears specific singleton', () => {
    const useC = Counter.asHook('hook-reset-2')
    useC().add(100)
    resetHook('hook-reset-2')
    expect(useC().count()).toBe(0)
  })

  it('resetAllHooks clears all singletons', () => {
    const useA = Counter.asHook('hook-all-1')
    const useB = Counter.asHook('hook-all-2')
    useA().add(5)
    useB().add(10)

    resetAllHooks()

    expect(useA().count()).toBe(0)
    expect(useB().count()).toBe(0)
  })
})

// ─── Effect reactivity ─────────────────────────────────────────────────────

describe('effect reactivity with model instances', () => {
  it('effect tracks signal reads from model instance', () => {
    const c = Counter.create()
    const observed: number[] = []
    effect(() => {
      observed.push(c.count())
    })
    c.inc()
    c.inc()
    expect(observed).toEqual([0, 1, 2])
  })

  it('effect tracks computed views', () => {
    const c = Counter.create({ count: 1 })
    const observed: number[] = []
    effect(() => {
      observed.push(c.doubled())
    })
    c.inc()
    c.add(5)
    expect(observed).toEqual([2, 4, 14])
  })
})
