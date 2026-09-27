import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  applyPatch,
  applySnapshot,
  getParent,
  getPath,
  getRoot,
  getSnapshot,
  destroy,
  isRoot,
  model,
  onPatch,
} from '../index'
import { instanceMeta } from '../registry'
import type { Patch } from '../types'

const Profile = model({ state: { name: '' } })
const App = model({ state: { profile: Profile, title: '' } })

type ProfileInst = ReturnType<typeof Profile.create>

// ─── 1. Field-nested model: rewire on replacement ─────────────────────────────

describe('field-nested model child — replacement rewires propagation', () => {
  it("a REPLACED child's writes reach the parent (patch + snapshot)", () => {
    const app = App.create({ profile: { name: 'a' } })
    const patches: Patch[] = []
    onPatch(app, (p) => patches.push(p))

    const next = Profile.create({ name: 'b' })
    app.profile.set(next)
    patches.length = 0

    next.name.set('c')

    expect(patches).toEqual([{ op: 'replace', path: '/profile/name', value: 'c' }])
    expect(getSnapshot(app)).toEqual({ profile: { name: 'c' }, title: '' })
  })

  it('the DETACHED old child no longer emits phantom patches on the parent', () => {
    const app = App.create({ profile: { name: 'a' } })
    const old = app.profile() as ProfileInst
    const patches: Patch[] = []
    onPatch(app, (p) => patches.push(p))

    app.profile.set(Profile.create({ name: 'b' }))
    patches.length = 0

    old.name.set('zzz')

    expect(patches).toEqual([])
    expect(getSnapshot(app)).toEqual({ profile: { name: 'b' }, title: '' })
  })

  it('meta.children tracks exactly the live child after replacement', () => {
    const app = App.create({ profile: { name: 'a' } })
    const old = app.profile() as ProfileInst
    const next = Profile.create({ name: 'b' })
    app.profile.set(next)
    const children = instanceMeta.get(app)!.children
    expect(children.has(next)).toBe(true)
    expect(children.has(old)).toBe(false)
  })
})

// ─── 2. applyPatch over a model-typed field ───────────────────────────────────

describe('applyPatch — model-typed field receives a snapshot', () => {
  it('replaying a recorded child-replacement patch keeps the field a live instance', () => {
    const app = App.create({ profile: { name: 'a' } })
    const recorded: Patch[] = []
    onPatch(app, (p) => recorded.push(p))
    app.profile.set(Profile.create({ name: 'b' }))

    const replica = App.create({ profile: { name: 'a' } })
    applyPatch(replica, JSON.parse(JSON.stringify(recorded)) as Patch[])

    const prof = replica.profile() as ProfileInst
    expect(prof.name()).toBe('b')
    expect(getSnapshot(replica)).toEqual({ profile: { name: 'b' }, title: '' })
  })

  it('undo via applyPatch restores the previous child state', () => {
    const app = App.create({ profile: { name: 'a' } })
    const before = getSnapshot(app).profile
    app.profile.set(Profile.create({ name: 'b' }))
    applyPatch(app, { op: 'replace', path: '/profile', value: before })
    expect((app.profile() as ProfileInst).name()).toBe('a')
  })
})

// ─── 3. schema-mode reset baseline ────────────────────────────────────────────

describe('schema-mode reset — non-JSON values survive the baseline clone', () => {
  const schema = z.object({
    at: z.date(),
    tags: z.set(z.string()),
    byId: z.map(z.string(), z.number()),
    big: z.bigint(),
  })

  it('Date / Map / Set / bigint fields reset to their initial values', () => {
    const at = new Date('2020-01-01T00:00:00Z')
    const M = model({
      schema,
      initial: { at, tags: new Set(['x']), byId: new Map([['a', 1]]), big: 10n },
    })
    const m = M.create() as unknown as {
      at: { (): Date; set(v: Date): void }
      tags: { (): Set<string> }
      byId: { (): Map<string, number> }
      big: { (): bigint; set(v: bigint): void }
      reset(): void
    }
    m.at.set(new Date('2030-01-01T00:00:00Z'))
    m.big.set(99n)
    m.tags().add('mutated-in-place')
    m.reset()
    expect(m.at()).toBeInstanceOf(Date)
    expect(m.at().getTime()).toBe(at.getTime())
    expect(m.big()).toBe(10n)
    expect(m.tags()).toEqual(new Set(['x']))
    expect(m.byId()).toBeInstanceOf(Map)
    expect(m.byId().get('a')).toBe(1)
  })
})

describe('schema-mode reset — a non-cloneable field keeps its reference', () => {
  it('a function-valued field does not make .create() throw', () => {
    const fn = () => 1
    const M = model({ schema: z.object({ n: z.number(), f: z.any() }), initial: { n: 1, f: fn } })
    const m = M.create() as unknown as {
      n: { set(v: number): void; (): number }
      f(): unknown
      reset(): void
    }
    m.n.set(5)
    m.reset()
    expect(m.n()).toBe(1)
    expect(m.f()).toBe(fn)
  })
})

describe('applySnapshot — array container mixing instances and plain values', () => {
  it('reconciles the instance slots and leaves plain slots alone', () => {
    const Todo = model({ state: { title: '' } })
    const Mixed = model({ state: { items: [] as unknown[] } })
    const t = Todo.create({ title: 'a' })
    const m = Mixed.create({ items: [t, 'plain'] })
    applySnapshot(m, { items: [{ title: 'b' }, 'other'] } as never)
    expect(t.title()).toBe('b')
    expect(m.items()[1]).toBe('plain')
  })
})

describe('applySnapshot — object container of instances reconciles in place', () => {
  it('byId values are updated, not replaced', () => {
    const Todo = model({ state: { title: '' } })
    const Reg = model({ state: { byId: {} as Record<string, ReturnType<typeof Todo.create>> } })
    const x = Todo.create({ title: 'x' })
    const reg = Reg.create({ byId: { x } })
    applySnapshot(reg, { byId: { x: { title: 'y' }, missing: { title: 'z' } } } as never)
    expect(reg.byId().x).toBe(x)
    expect(x.title()).toBe('y')
  })
})

// ─── 4. parent pointer cleared on detach ──────────────────────────────────────

describe('tree helpers — a removed node is no longer parented', () => {
  const Todo = model({ state: { title: '' } })
  type TodoInst = ReturnType<typeof Todo.create>
  const List = model({ state: { todos: [] as TodoInst[], byId: {} as Record<string, TodoInst> } })

  it('array removal clears parent / root / path', () => {
    const a = Todo.create({ title: 'a' })
    const b = Todo.create({ title: 'b' })
    const list = List.create({ todos: [a, b] })
    list.todos.set([b])
    expect(getParent(a)).toBeUndefined()
    expect(isRoot(a)).toBe(true)
    expect(getRoot(a)).toBe(a)
    expect(getPath(a)).toBe('')
    // survivor keeps its parent
    expect(getParent(b)).toBe(list)
  })

  it('object-container removal clears parent', () => {
    const x = Todo.create({ title: 'x' })
    const list = List.create({ byId: { x } })
    list.byId.set({})
    expect(getParent(x)).toBeUndefined()
  })

  it('field-nested replacement clears the old child parent', () => {
    const app = App.create({ profile: { name: 'a' } })
    const old = app.profile() as ProfileInst
    app.profile.set(Profile.create({ name: 'b' }))
    expect(getParent(old)).toBeUndefined()
    expect(getParent(app.profile() as ProfileInst)).toBe(app)
  })

  it('a bare model in a PLAIN field is un-parented when overwritten', () => {
    const Box = model({ state: { item: null as unknown } })
    const a = Todo.create({ title: 'a' })
    const box = Box.create({ item: a })
    expect(getParent(a)).toBe(box)
    box.item.set(null)
    expect(getParent(a)).toBeUndefined()
  })

  it('a node held under TWO keys stays owned until both release it', () => {
    const a = Todo.create({ title: 'a' })
    const list = List.create({ todos: [a], byId: { a } })
    list.todos.set([])
    expect(getParent(a)).toBe(list)
    expect(instanceMeta.get(list)!.children.has(a)).toBe(true)
    list.byId.set({})
    expect(getParent(a)).toBeUndefined()
    expect(instanceMeta.get(list)!.children.has(a)).toBe(false)
  })

  it('a node moved to another parent is not un-parented by the old one', () => {
    const a = Todo.create({ title: 'a' })
    const l1 = List.create({ todos: [a] })
    const l2 = List.create({ todos: [] })
    l2.todos.set([a])
    l1.todos.set([])
    expect(getParent(a)).toBe(l2)
  })
})

// ─── 5. applySnapshot with null / non-object for a nested model key ───────────

describe('applySnapshot — non-object value for a nested model key', () => {
  it('does not throw a TypeError on null', () => {
    const app = App.create({ profile: { name: 'a' } })
    expect(() => applySnapshot(app, { profile: null } as never)).not.toThrow()
    expect(app.profile()).toBeNull()
  })

  it('rejects a null top-level snapshot with a [Pyreon] error', () => {
    const app = App.create({ profile: { name: 'a' } })
    expect(() => applySnapshot(app, null as never)).toThrow('[Pyreon]')
    expect(() => applySnapshot(app, 'x' as never)).toThrow(/got string/)
  })
})

// ─── 6. error prefix ─────────────────────────────────────────────────────────

describe('error prefix', () => {
  it('destroy on a non-instance throws with the prefix', () => {
    expect(() => destroy({})).toThrow(/^\[Pyreon\] state-tree destroy/)
  })

  it('uses the [Pyreon] prefix everywhere', () => {
    expect(() => onPatch({}, () => {})).toThrow(/^\[Pyreon\] state-tree onPatch/)
    expect(() => getSnapshot({})).toThrow(/^\[Pyreon\] state-tree getSnapshot/)
    const app = App.create()
    expect(() => applyPatch(app, { op: 'add' as 'replace', path: '/title', value: 1 })).toThrow(
      /^\[Pyreon\] state-tree applyPatch/,
    )
  })
})
