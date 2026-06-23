import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  destroy,
  getSnapshot,
  model,
  onAction,
  onPatch,
  onSnapshot,
} from '../index'
import type { Patch } from '../index'

// Flush the microtask queue (onSnapshot coalesces onto a microtask).
const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0))

describe('volatile state', () => {
  it('volatile fields are signal-backed + reactive', () => {
    const M = model({ state: { n: 0 } })
      .volatile(() => ({ loading: false }))
      .actions((self) => ({
        begin: () => self.loading.set(true),
      }))
    const m = M.create()
    const loading: boolean = m.loading() // strictly typed via TVolatile
    expect(loading).toBe(false)
    m.begin()
    expect(m.loading()).toBe(true)
  })

  it('volatile is EXCLUDED from getSnapshot', () => {
    const M = model({ state: { n: 1 } }).volatile(() => ({ scratch: 'x', live: null as unknown }))
    const m = M.create()
    m.scratch.set('changed')
    expect(getSnapshot(m)).toEqual({ n: 1 }) // no scratch / live
  })

  it('volatile writes emit NO patch (excluded from onPatch)', () => {
    const M = model({ state: { n: 0 } })
      .volatile(() => ({ flag: false }))
      .actions((self) => ({
        bump: () => self.n.update((x) => x + 1),
        flip: () => self.flag.set(true),
      }))
    const m = M.create()
    const patches: Patch[] = []
    onPatch(m, (p) => patches.push(p))
    m.flip() // volatile — no patch
    expect(patches).toEqual([])
    m.bump() // state — one patch
    expect(patches).toEqual([{ op: 'replace', path: '/n', value: 1 }])
  })

  it('throws on a volatile field colliding with a state field', () => {
    const M = model({ state: { count: 0 } }).volatile(() => ({ count: true }))
    expect(() => M.create()).toThrow(/collides with a state\/schema field/)
  })

  it('throws on a view colliding with a volatile field', () => {
    const M = model({ state: { n: 0 } })
      .volatile(() => ({ busy: false }))
      .views(() => ({ busy: () => true }))
    expect(() => M.create()).toThrow(/collides with a volatile field/)
  })
})

describe('onSnapshot', () => {
  it('fires (microtask-coalesced) after a state change; NOT on subscribe', async () => {
    const M = model({ state: { count: 0 } }).actions((self) => ({
      inc: () => self.count.update((n) => n + 1),
    }))
    const m = M.create()
    const snaps: unknown[] = []
    onSnapshot(m, (s) => snaps.push(s))
    await flushMicrotasks()
    expect(snaps).toEqual([]) // did NOT fire on subscribe
    m.inc()
    await flushMicrotasks()
    expect(snaps).toEqual([{ count: 1 }])
  })

  it('coalesces multiple writes in one action into ONE emit', async () => {
    const M = model({ state: { a: 0, b: 0 } }).actions((self) => ({
      bump: () => {
        self.a.update((n) => n + 1)
        self.b.update((n) => n + 1)
        self.a.update((n) => n + 1)
      },
    }))
    const m = M.create()
    const snaps: unknown[] = []
    onSnapshot(m, (s) => snaps.push(s))
    m.bump()
    await flushMicrotasks()
    expect(snaps).toEqual([{ a: 2, b: 1 }]) // ONE emit, latest state
  })

  it('a volatile change does NOT fire onSnapshot', async () => {
    const M = model({ state: { n: 0 } })
      .volatile(() => ({ flag: false }))
      .actions((self) => ({ flip: () => self.flag.set(true) }))
    const m = M.create()
    const snaps: unknown[] = []
    onSnapshot(m, (s) => snaps.push(s))
    m.flip()
    await flushMicrotasks()
    expect(snaps).toEqual([])
  })

  it('unsubscribe stops firing', async () => {
    const M = model({ state: { count: 0 } }).actions((self) => ({
      inc: () => self.count.update((n) => n + 1),
    }))
    const m = M.create()
    const snaps: unknown[] = []
    const dispose = onSnapshot(m, (s) => snaps.push(s))
    m.inc()
    await flushMicrotasks()
    dispose()
    m.inc()
    await flushMicrotasks()
    expect(snaps).toEqual([{ count: 1 }]) // only the first
  })

  it('destroy clears snapshot listeners', async () => {
    const M = model({ state: { count: 0 } }).actions((self) => ({
      inc: () => self.count.update((n) => n + 1),
    }))
    const m = M.create()
    const snaps: unknown[] = []
    onSnapshot(m, (s) => snaps.push(s))
    destroy(m)
    // (action no-ops on a dead instance too, but the listener is gone regardless)
    await flushMicrotasks()
    expect(snaps).toEqual([])
  })
})

describe('onAction', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warn.mockRestore())

  it('observes action calls (name + args) and does not block them', () => {
    const M = model({ state: { count: 0 } }).actions((self) => ({
      add: (n: number) => self.count.update((c) => c + n),
    }))
    const m = M.create()
    const calls: Array<{ name: string; args: unknown[] }> = []
    onAction(m, (call) => calls.push({ name: call.name, args: call.args }))
    m.add(5)
    expect(calls).toEqual([{ name: 'add', args: [5] }])
    expect(m.count()).toBe(5) // observer did not block the action
  })

  it('unsubscribe stops observing', () => {
    const M = model({ state: { count: 0 } }).actions((self) => ({
      inc: () => self.count.update((c) => c + 1),
    }))
    const m = M.create()
    const calls: string[] = []
    const unsub = onAction(m, (call) => calls.push(call.name))
    m.inc()
    unsub()
    m.inc()
    expect(calls).toEqual(['inc']) // only the first
  })
})
