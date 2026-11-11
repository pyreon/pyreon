import { batch } from '../batch'
import { computed } from '../computed'
import { effect } from '../effect'
import { linked } from '../linked'
import { effectScope } from '../scope'
import { signal } from '../signal'

describe('linked()', () => {
  it('follows its source, accepts local writes, and resets when the source changes', () => {
    const options = signal(['a', 'b'])
    const selected = linked(() => options()[0]!)
    expect(selected()).toBe('a')
    selected.set('b')
    expect(selected()).toBe('b')
    options.set(['c', 'd'])
    expect(selected()).toBe('c')
    selected.update((v) => `${v}!`)
    expect(selected()).toBe('c!')
  })

  it('passes the new source and the previous { source, value } to compute', () => {
    const options = signal(['a', 'b', 'c'])
    const calls: unknown[] = []
    const selected = linked(options, (opts, prev): string => {
      calls.push(prev)
      return prev && opts.includes(prev.value) ? prev.value : opts[0]!
    })
    expect(selected()).toBe('a')
    selected.set('c')
    options.set(['b', 'c'])
    // 'c' is still in the list → kept.
    expect(selected()).toBe('c')
    options.set(['x'])
    expect(selected()).toBe('x')
    expect(calls).toEqual([undefined, { source: ['a', 'b', 'c'], value: 'c' }, { source: ['b', 'c'], value: 'c' }])
  })

  it('runs compute untracked: signals read inside it do not reset the value', () => {
    const src = signal(1)
    const factor = signal(10)
    const v = linked(src, (s) => s * factor())
    expect(v()).toBe(10)
    v.set(5)
    factor.set(100)
    expect(v()).toBe(5)
    src.set(2)
    expect(v()).toBe(200)
  })

  it('keeps an override when the source recomputes to the same value', () => {
    const a = signal(1)
    const b = signal(1)
    const v = linked(() => a() + b())
    v.set(99)
    batch(() => {
      a.set(2)
      b.set(0)
    })
    expect(v()).toBe(99)
  })

  it('does not resurrect a superseded override when an unrelated source dependency re-runs', () => {
    const a = signal(1)
    const b = signal(1)
    const v = linked(() => a() + b())
    v.set(99)
    a.set(5) // source 2 → 6: resets
    expect(v()).toBe(6)
    batch(() => {
      a.set(4)
      b.set(2)
    }) // re-evaluates, source still 6
    expect(v()).toBe(6)
  })

  it('a write made after a pending source change wins', () => {
    const src = signal('a')
    const v = linked(() => src())
    expect(v()).toBe('a')
    batch(() => {
      src.set('b')
      v.set('mine')
    })
    expect(v()).toBe('mine')
  })

  it('a write before the first read is kept', () => {
    const src = signal('a')
    const v = linked(() => src())
    v.set('early')
    expect(v()).toBe('early')
    expect(v.peek()).toBe('early')
  })

  it('notifies effects on source changes and on local writes', () => {
    const src = signal(1)
    const v = linked(() => src() * 2)
    const seen: number[] = []
    const fx = effect(() => {
      seen.push(v())
    })
    v.set(7)
    src.set(3)
    v.set(6) // same as current value → no notification
    expect(seen).toEqual([2, 7, 6])
    fx.dispose()
  })

  it('peek() does not subscribe', () => {
    const src = signal(1)
    const v = linked(() => src())
    let runs = 0
    const fx = effect(() => {
      runs++
      v.peek()
    })
    src.set(2)
    v.set(3)
    expect(runs).toBe(1)
    fx.dispose()
  })

  it('composes with computed', () => {
    const src = signal(2)
    const v = linked(() => src())
    const doubled = computed(() => v() * 2)
    expect(doubled()).toBe(4)
    v.set(10)
    expect(doubled()).toBe(20)
    src.set(3)
    expect(doubled()).toBe(6)
  })

  it('honours a custom equals for downstream notifications', () => {
    const src = signal({ id: 1, n: 0 })
    const v = linked(() => src(), { equals: (x, y) => x.id === y.id })
    const v2 = linked(src, (s) => ({ ...s }), { equals: (x, y) => x.id === y.id })
    let runs = 0
    const fx = effect(() => {
      runs++
      v()
      v2()
    })
    src.set({ id: 1, n: 1 })
    expect(runs).toBe(1)
    src.set({ id: 2, n: 0 })
    expect(runs).toBe(2)
    fx.dispose()
  })

  it('dispose() stops following the source; a scope disposes it too', () => {
    const src = signal(1)
    const v = linked(() => src())
    expect(v()).toBe(1)
    v.dispose()
    src.set(2)
    expect(v()).toBe(1)

    const scope = effectScope()
    let inScope!: ReturnType<typeof linked<number>>
    scope.runInScope(() => {
      inScope = linked(() => src())
    })
    expect(inScope()).toBe(2)
    scope.stop()
    src.set(3)
    expect(inScope()).toBe(2)
  })
})
