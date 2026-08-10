/**
 * Contract for the v9 reactivity bindings (`pyreonReactivity`).
 *
 * These are the seam TanStack Table v9 calls to build EVERY piece of its
 * internal state, so a defect here is invisible in the adapter's own types and
 * shows up as "the table renders once and never updates". The v9 migration
 * shipped the file with its `subscribe` paths untested — which is the half that
 * makes the table reactive at all — so this suite exercises the bindings
 * directly rather than only through a mounted table.
 *
 * `subscribe` is deliberately covered in BOTH shapes TanStack may call it with
 * (a bare `next` function and an observer object), because the adapter has to
 * normalise them and the wrong branch is silently inert, never an error.
 */
import { signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { pyreonReactivity } from '../reactivity'

describe('pyreonReactivity — writable atom', () => {
  it('round-trips a value through get/set', () => {
    const atom = pyreonReactivity().createWritableAtom(1)
    expect(atom.get()).toBe(1)
    atom.set(2)
    expect(atom.get()).toBe(2)
  })

  it('accepts the updater form and passes the previous value', () => {
    const atom = pyreonReactivity().createWritableAtom(10)
    atom.set((prev) => prev + 5)
    expect(atom.get()).toBe(15)
  })

  it('honors `compare`: an EQUAL write is a no-op and does not notify', () => {
    // Pyreon's `signal` has no `equals` hook, so the atom's compare contract
    // is implemented in the adapter. If it regressed, table-core would notify
    // on every no-op state re-emission.
    const bindings = pyreonReactivity()
    const atom = bindings.createWritableAtom(
      { n: 1 },
      { debugName: 'test', compare: (a, b) => a.n === b.n },
    )
    const seen: Array<{ n: number }> = []
    atom.subscribe((v: { n: number }) => seen.push(v))

    atom.set({ n: 1 }) // equal by compare — must be dropped
    expect(seen).toHaveLength(0)
    expect(atom.get()).toEqual({ n: 1 })

    atom.set({ n: 2 })
    expect(seen).toEqual([{ n: 2 }])
  })

  it('notifies a BARE next function with the new value', () => {
    const atom = pyreonReactivity().createWritableAtom('a')
    const next = vi.fn()
    atom.subscribe(next)
    atom.set('b')
    expect(next).toHaveBeenCalledWith('b')
  })

  it('notifies an OBSERVER OBJECT, with `next` bound to the observer', () => {
    const atom = pyreonReactivity().createWritableAtom(0)
    const observer = {
      seen: [] as number[],
      next(v: number) {
        // `this` must be the observer — the adapter binds it. An unbound
        // `next` would throw here rather than record.
        this.seen.push(v)
      },
    }
    atom.subscribe(observer)
    atom.set(1)
    expect(observer.seen).toEqual([1])
  })

  it('tolerates an observer with NO next — inert, never a throw', () => {
    const atom = pyreonReactivity().createWritableAtom(0)
    atom.subscribe({} as never)
    expect(() => atom.set(1)).not.toThrow()
  })

  it('unsubscribe stops delivery', () => {
    const atom = pyreonReactivity().createWritableAtom(0)
    const next = vi.fn()
    const sub = atom.subscribe(next)
    atom.set(1)
    sub.unsubscribe()
    atom.set(2)
    expect(next).toHaveBeenCalledTimes(1)
    expect(atom.get()).toBe(2)
  })
})

describe('pyreonReactivity — readonly atom', () => {
  it('reflects its computation', () => {
    const src = signal(2)
    const atom = pyreonReactivity().createReadonlyAtom(() => src() * 3)
    expect(atom.get()).toBe(6)
    src.set(4)
    expect(atom.get()).toBe(12)
  })

  it('notifies subscribers when an upstream signal changes', () => {
    const src = signal(1)
    const atom = pyreonReactivity().createReadonlyAtom(() => src() * 10)
    const next = vi.fn()
    atom.subscribe(next)
    src.set(2)
    expect(next).toHaveBeenCalledWith(20)
  })

  it('with `compare`, does NOT notify when the recomputed value is equal', () => {
    const src = signal({ n: 1 })
    const atom = pyreonReactivity().createReadonlyAtom(() => ({ n: src().n }), {
      debugName: 'test',
      compare: (a, b) => a.n === b.n,
    })
    const next = vi.fn()
    atom.subscribe(next)

    src.set({ n: 1 }) // recomputes to an EQUAL value — must stay quiet
    expect(next).not.toHaveBeenCalled()

    src.set({ n: 2 })
    expect(next).toHaveBeenCalledWith({ n: 2 })
  })

  it('supports the observer-object shape', () => {
    const src = signal(1)
    const atom = pyreonReactivity().createReadonlyAtom(() => src() + 1)
    const seen: number[] = []
    atom.subscribe({ next: (v: number) => seen.push(v) })
    src.set(5)
    expect(seen).toEqual([6])
  })

  it('unsubscribe stops delivery', () => {
    const src = signal(0)
    const atom = pyreonReactivity().createReadonlyAtom(() => src())
    const next = vi.fn()
    const sub = atom.subscribe(next)
    src.set(1)
    sub.unsubscribe()
    src.set(2)
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('pyreonReactivity — instance lifetime', () => {
  it('unmount unsubscribes every REGISTERED subscription', () => {
    // `addSubscription` is table-core's hand-off of a subscription it owns;
    // if `unmount` did not drain it, every unmounted table would leak its
    // external-atom bridges.
    const bindings = pyreonReactivity()
    const a = { unsubscribe: vi.fn() }
    const b = { unsubscribe: vi.fn() }
    bindings.addSubscription(a)
    bindings.addSubscription(b)

    expect(bindings.unmount, 'bindings must provide unmount').toBeTypeOf('function')
    bindings.unmount?.()
    expect(a.unsubscribe).toHaveBeenCalledTimes(1)
    expect(b.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('unmount is idempotent — a second call does not re-dispose', () => {
    const bindings = pyreonReactivity()
    const sub = { unsubscribe: vi.fn() }
    bindings.addSubscription(sub)
    bindings.unmount?.()
    bindings.unmount?.()
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('gives each table its OWN bindings — unmounting one cannot dispose another', () => {
    const one = pyreonReactivity()
    const two = pyreonReactivity()
    const sub = { unsubscribe: vi.fn() }
    two.addSubscription(sub)
    one.unmount?.()
    expect(sub.unsubscribe).not.toHaveBeenCalled()
  })

  it('declares the options store and external-atom wrapping v9 relies on', () => {
    // `wrapExternalAtoms` is what makes `addSubscription` load-bearing rather
    // than decorative, and `createOptionsStore` is the mechanism that replaced
    // the v8 version counter. Both are plain flags core reads once, so a
    // silent flip would only surface as lost reactivity.
    const bindings = pyreonReactivity()
    expect(bindings.createOptionsStore).toBe(true)
    expect(bindings.wrapExternalAtoms).toBe(true)
  })
})

describe('pyreonReactivity — scheduling primitives', () => {
  it('batch coalesces writes into one notification', () => {
    const bindings = pyreonReactivity()
    const atom = bindings.createWritableAtom(0)
    const next = vi.fn()
    atom.subscribe(next)
    bindings.batch(() => {
      atom.set(1)
      atom.set(2)
    })
    expect(next).toHaveBeenCalledTimes(1)
    expect(atom.get()).toBe(2)
  })

  it('untrack reads without subscribing', () => {
    const bindings = pyreonReactivity()
    const src = signal(1)
    const derived = bindings.createReadonlyAtom(() => bindings.untrack(() => src()))
    const next = vi.fn()
    derived.subscribe(next)
    src.set(2)
    expect(next).not.toHaveBeenCalled()
  })

  it('schedule defers to a microtask rather than running inline', async () => {
    const bindings = pyreonReactivity()
    const order: string[] = []
    bindings.schedule(() => order.push('scheduled'))
    order.push('sync')
    await Promise.resolve()
    expect(order).toEqual(['sync', 'scheduled'])
  })
})
