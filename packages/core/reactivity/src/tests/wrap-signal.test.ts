import { signal } from '../signal'
import { wrapSignal } from '../wrap-signal'

describe('wrapSignal', () => {
  it('delegates reads to the base and routes writes through set', () => {
    const base = signal(1)
    const writes: number[] = []
    const w = wrapSignal(base, {
      set: (v) => {
        writes.push(v)
        base.set(v)
      },
    })
    expect(w()).toBe(1)
    expect(w.peek()).toBe(1)
    w.set(2)
    expect(writes).toEqual([2])
    expect(base()).toBe(2)
    expect(w()).toBe(2)
  })

  it('forwards the internal `_v` field live (the _bindText fast-path contract)', () => {
    const base = signal('hi')
    const w = wrapSignal(base, { set: (v) => base.set(v) })
    expect((w as unknown as { _v: string })._v).toBe('hi')
    base.set('bye')
    // The getter reads through to the base — so the fast path sees the live value.
    expect((w as unknown as { _v: string })._v).toBe('bye')
  })

  it('delegates `.direct` and `.subscribe` to the base', () => {
    const base = signal(0)
    const w = wrapSignal(base, { set: (v) => base.set(v) })
    let direct = 0
    let sub = 0
    const d1 = w.direct(() => {
      direct++
    })
    const d2 = w.subscribe(() => {
      sub++
    })
    base.set(1)
    expect(direct).toBe(1)
    expect(sub).toBe(1)
    d1()
    d2()
    base.set(2)
    expect(direct).toBe(1) // disposed
    expect(sub).toBe(1)
  })

  it('`.update` defaults to set(fn(peek()))', () => {
    const base = signal(10)
    const writes: number[] = []
    const w = wrapSignal(base, {
      set: (v) => {
        writes.push(v)
        base.set(v)
      },
    })
    w.update((c) => c + 5)
    expect(writes).toEqual([15])
    expect(base()).toBe(15)
  })

  it('a custom `.update` overrides the default', () => {
    const base = signal(0)
    let updated = false
    const w = wrapSignal(base, {
      set: (v) => base.set(v),
      update: () => {
        updated = true
      },
    })
    w.update((c) => c + 1)
    expect(updated).toBe(true)
    expect(base()).toBe(0) // custom update did not call set
  })

  it('forwards `.label` (get + set) and `.debug` to the base', () => {
    const base = signal(0, { name: 'b' })
    const w = wrapSignal(base, { set: (v) => base.set(v) })
    expect(w.label).toBe('b')
    w.label = 'renamed'
    expect(base.label).toBe('renamed')
    expect(w.debug().name).toBe('renamed')
  })

  it('produces a DISTINCT facade per call over a SHARED base (per-consumer identity)', () => {
    const base = signal(0)
    const a = wrapSignal(base, { set: (v) => base.set(v) })
    const b = wrapSignal(base, { set: (v) => base.set(v) })
    expect(a).not.toBe(b)
    a.set(5)
    // both read the shared base
    expect(a()).toBe(5)
    expect(b()).toBe(5)
  })
})
