import { describe, expect, it, vi } from 'vitest'
import {
  applyPatch,
  applySnapshot,
  arrayOf,
  getPath,
  getSnapshot,
  identifier,
  mapOf,
  model,
  onPatch,
  reference,
} from '../index'
import type { Patch } from '../types'

// Property: for EVERY field kind — primitive, plain object/array, nested model,
// arrayOf(Model), mapOf(Model), reference — a random sequence of writes on `a`
// produces patches that (1) are plain JSON, (2) replay onto a fresh instance to
// the same snapshot with real model instances in every container, and (3) the
// final snapshot restores through applySnapshot and create() to the same state.
//
// #4311: a model instance in an array field emitted `/todos/done` (no index),
// carried live instances in the `/todos` patch value (serialized as `{}`), and
// applyPatch threw on the replay.

const Tag = model({ state: { id: identifier(), label: '' } })
const Todo = model({ state: { title: '', done: false, owner: reference(Tag) } }).actions(
  (self) => ({
    toggle: () => self.done.update((d) => !d),
    rename: (title: string) => self.title.set(title),
  }),
)
const Meta = model({ state: { version: 0, note: '' } })
const Board = model({
  state: {
    name: '',
    count: 0,
    flags: [] as string[],
    settings: { dense: false } as { dense: boolean },
    meta: Meta,
    tags: arrayOf(Tag),
    todos: arrayOf(Todo),
    byKey: mapOf(Todo),
    pinned: reference(Tag),
  },
})

type BoardI = ReturnType<typeof Board.create>

/** Deterministic PRNG (mulberry32) so a failing seed reproduces. */
function rng(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const KEYS = ['a', 'b/c', 'd~e', 'f']

function randomOp(b: BoardI, r: () => number, n: number): void {
  const pick = <T>(xs: readonly T[]): T | undefined => xs[Math.floor(r() * xs.length)]
  const todos = b.todos()
  const tags = b.tags()
  switch (Math.floor(r() * 14)) {
    case 0:
      return b.name.set(`n${n}`)
    case 1:
      return b.count.update((c) => c + 1)
    case 2:
      return b.flags.set([...b.flags(), `f${n}`])
    case 3:
      return b.settings.set({ dense: !b.settings().dense })
    case 4:
      return b.meta().version.update((v) => v + 1)
    case 5:
      return b.meta.set(Meta.create({ version: n, note: `m${n}` }))
    case 6:
      return b.tags.set([...tags, Tag.create({ id: `t${n}`, label: `L${n}` })])
    case 7:
      return b.todos.set([...todos, Todo.create({ title: `todo${n}` })])
    case 8:
      // remove a random element (index shift for the rest)
      if (todos.length > 0)
        b.todos.set(todos.filter((_, i) => i !== Math.floor(r() * todos.length)))
      return
    case 9:
      // reorder
      if (todos.length > 1) b.todos.set([...todos].reverse())
      return
    case 10:
      pick(todos)?.toggle()
      pick(todos)?.rename(`r${n}`)
      return
    case 11: {
      const t = pick(todos)
      const tag = pick(tags)
      if (t && tag) t.owner.set(tag)
      if (tag) b.pinned.set(tag)
      return
    }
    case 12: {
      const k = pick(KEYS)!
      const next = { ...b.byKey() }
      if (next[k] && r() < 0.5) delete next[k]
      else next[k] = Todo.create({ title: `k${n}` })
      return b.byKey.set(next)
    }
    default: {
      const v = Object.values(b.byKey())
      ;(v[Math.floor(r() * v.length)] as ReturnType<typeof Todo.create> | undefined)?.toggle()
    }
  }
}

function expectInstances(b: BoardI): void {
  b.todos().forEach((t, i) => {
    expect(typeof t.toggle).toBe('function')
    expect(getPath(t)).toBe(`/todos/${i}`)
  })
  b.tags().forEach((t, i) => expect(getPath(t)).toBe(`/tags/${i}`))
  for (const [k, t] of Object.entries(b.byKey())) {
    expect(typeof t.toggle).toBe('function')
    expect(getPath(t)).toBe(`/byKey/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`)
  }
  expect(getPath(b.meta())).toBe('/meta')
}

describe('state-tree — patches and snapshots round-trip for every field kind', () => {
  it('random write sequences replay through applyPatch, applySnapshot and create', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const r = rng(seed)
      const a = Board.create()
      const start = getSnapshot(a)
      const log: Patch[] = []
      onPatch(a, (p) => log.push(p))
      for (let n = 0; n < 40; n++) randomOp(a, r, n)

      const expected = getSnapshot(a)
      // (1) every patch is plain JSON — nothing is lost on the wire
      const wire = JSON.parse(JSON.stringify(log)) as Patch[]
      expect(wire, `seed ${seed}`).toEqual(log)

      // (2) replay onto a fresh instance created from the same start
      const b = Board.create(start)
      applyPatch(b, wire)
      expect(getSnapshot(b), `seed ${seed} applyPatch`).toEqual(expected)
      expectInstances(b)
      // references resolve to the replayed nodes, not to `a`'s
      if (b.pinned() !== undefined) expect(b.tags()).toContain(b.pinned())

      // (3) the snapshot restores into an existing instance and through create()
      const c = Board.create()
      applySnapshot(c, JSON.parse(JSON.stringify(expected)))
      expect(getSnapshot(c), `seed ${seed} applySnapshot`).toEqual(expected)
      expectInstances(c)
      const d = Board.create(JSON.parse(JSON.stringify(expected)))
      expect(getSnapshot(d), `seed ${seed} create`).toEqual(expected)
      expectInstances(d)
    }
  })

  it('the issue repro: indexed child path, snapshot values, replayable', () => {
    const T = model({ state: { title: '', done: false } }).actions((self) => ({
      toggle: () => self.done.update((d) => !d),
    }))
    const List = model({ state: { todos: arrayOf(T) } }).actions((self) => ({
      add: (title: string) => self.todos.update((xs) => [...xs, T.create({ title })]),
    }))
    const a = List.create()
    const b = List.create()
    const log: Patch[] = []
    onPatch(a, (p) => log.push(p))
    a.add('one')
    a.add('two')
    a.todos()[1]!.toggle()

    expect(log).toEqual([
      { op: 'replace', path: '/todos', value: [{ title: 'one', done: false }] },
      {
        op: 'replace',
        path: '/todos',
        value: [
          { title: 'one', done: false },
          { title: 'two', done: false },
        ],
      },
      { op: 'replace', path: '/todos/1/done', value: true },
    ])
    expect(getPath(a.todos()[1]!)).toBe('/todos/1')

    applyPatch(b, log)
    expect(getSnapshot(b)).toEqual(getSnapshot(a))
    expect(b.todos()[0]).not.toBe(a.todos()[0]) // b got its own nodes
    b.todos()[0]!.toggle()
    expect(a.todos()[0]!.done()).toBe(false)
  })

  it('an undeclared array of models: indexed paths + snapshot values, and a dev warning naming arrayOf', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const T = model({ state: { done: false } })
      const List = model({ state: { todos: [] as ReturnType<typeof T.create>[] } })
      const a = List.create()
      const log: Patch[] = []
      onPatch(a, (p) => log.push(p))
      a.todos.set([T.create(), T.create()])
      a.todos()[1]!.done.set(true)
      expect(log[0]).toEqual({
        op: 'replace',
        path: '/todos',
        value: [{ done: false }, { done: false }],
      })
      expect(log[1]).toEqual({ op: 'replace', path: '/todos/1/done', value: true })
      expect(warn.mock.calls.some(([m]) => String(m).includes('arrayOf'))).toBe(true)

      // A populated undeclared list infers the element model from its elements,
      // so a replayed snapshot can grow and shrink it.
      const b = List.create({ todos: [T.create()] })
      applySnapshot(b, { todos: [{ done: true }, { done: false }, { done: true }] })
      expect(getSnapshot(b)).toEqual({ todos: [{ done: true }, { done: false }, { done: true }] })
      expect(b.todos().every((t) => typeof t.done === 'function')).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })

  it('a reference write emits a replace patch carrying the id', () => {
    const U = model({ state: { id: identifier(), name: '' } })
    const Root = model({ state: { users: arrayOf(U), current: reference(U) } })
    const root = Root.create({
      users: [
        { id: 'u1', name: 'A' },
        { id: 'u2', name: 'B' },
      ],
    })
    const log: Patch[] = []
    onPatch(root, (p) => log.push(p))
    root.current.set(root.users()[1]!)
    root.current.set(root.users()[1]!) // unchanged id: no patch
    expect(log).toEqual([{ op: 'replace', path: '/current', value: 'u2' }])
  })
})
