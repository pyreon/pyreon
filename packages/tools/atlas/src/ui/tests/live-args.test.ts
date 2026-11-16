/**
 * Live control values — one getter per key, one value-gated cell per key.
 *
 * The property that matters: reading `props.label` inside a binding
 * subscribes that binding to `label` ALONE, and only a real change notifies
 * it. A notification for an unchanged value would count as an update in
 * Reactive coverage that never happened.
 */
import { effect, getCurrentScope, effectScope, setCurrentScope, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { createLiveArgs, detached, sameArg } from '../live-args'

describe('sameArg', () => {
  it('is Object.is for primitives and functions', () => {
    expect(sameArg(1, 1)).toBe(true)
    expect(sameArg(Number.NaN, Number.NaN)).toBe(true)
    expect(sameArg('a', 'b')).toBe(false)
    const f = () => 1
    expect(sameArg(f, f)).toBe(true)
    expect(sameArg(f, () => 1)).toBe(false)
  })

  it('treats a re-created array or plain object with the same JSON as the same value', () => {
    expect(sameArg([1, { a: 2 }], [1, { a: 2 }])).toBe(true)
    expect(sameArg({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameArg(Object.assign(Object.create(null), { a: 1 }), { a: 1 })).toBe(true)
  })

  it('never calls a class instance or a mixed pair equal by shape', () => {
    class P {
      x = 1
    }
    expect(sameArg(new P(), new P())).toBe(false)
    expect(sameArg([1], { 0: 1 })).toBe(false)
    expect(sameArg(null, {})).toBe(false)
  })

  it('a value JSON cannot serialise is a change, not a throw', () => {
    const a: Record<string, unknown> = {}
    a.self = a
    const b: Record<string, unknown> = {}
    b.self = b
    expect(sameArg(a, b)).toBe(false)
    expect(sameArg({ n: 1n }, { n: 1n })).toBe(false)
  })
})

describe('createLiveArgs', () => {
  it('subscribes a reader to the key it read, and only notifies on a real change', () => {
    const values = signal<Record<string, unknown>>({ label: 'a', size: 'md' })
    const live = createLiveArgs(() => values())
    const props = live.props(['label', 'size'])
    const seen: unknown[] = []
    const e = effect(() => {
      seen.push(props.label)
    })
    values.set({ label: 'a', size: 'lg' }) // `size` only
    values.set({ label: 'b', size: 'lg' })
    values.set({ label: 'b', size: 'lg' })
    expect(seen).toEqual(['a', 'b'])
    // `size` changed too, but nothing ever read it, so it has no cell to notice.
    expect([...live.changed()]).toEqual(['label'])
    e.dispose()
    live.dispose()
  })

  it('records keys read while rendering, without subscribing the render to them', () => {
    const values = signal<Record<string, unknown>>({ wide: false, label: 'a' })
    const live = createLiveArgs(() => values())
    const props = live.props(['wide', 'label'])
    let runs = 0
    let keys: string[] = []
    const e = effect(() => {
      runs++
      keys = live.rendering(() => (props.wide ? 'section' : 'div')).keys
    })
    values.set({ wide: true, label: 'a' })
    expect(runs).toBe(1) // the read was untracked
    expect(keys).toEqual(['wide'])
    e.dispose()
  })

  it('nests: an inner render records its own keys, the outer keeps reading after it', () => {
    const live = createLiveArgs(() => ({ a: 1, b: 2 }))
    const props = live.props(['a', 'b'])
    const outer = live.rendering(() => {
      void props.a
      const inner = live.rendering(() => props.b)
      void props.a
      return inner.keys
    })
    expect(outer.out).toEqual(['b'])
    expect(outer.keys).toEqual(['a'])
  })

  it('creates one cell per key on first use and reuses it', () => {
    const live = createLiveArgs(() => ({ a: 1 }))
    const c = live.cell('a')
    expect(live.cell('a')).toBe(c)
    expect(live.cells().size).toBe(1)
    live.dispose()
    expect(live.cells().size).toBe(0)
  })

  it('is enumerable and configurable, so a descriptor copy keeps the getters', () => {
    const live = createLiveArgs(() => ({ a: 1 }))
    const d = Object.getOwnPropertyDescriptor(live.props(['a']), 'a')!
    expect(d.enumerable && d.configurable && typeof d.get === 'function').toBe(true)
  })

  it('its cells are not adopted by the scope that happened to create them', () => {
    const scope = effectScope()
    const prev = getCurrentScope()
    setCurrentScope(scope)
    const values = signal<Record<string, unknown>>({ a: 1 })
    const live = createLiveArgs(() => values())
    const c = live.cell('a')
    setCurrentScope(prev)
    scope.stop()
    values.set({ a: 2 })
    expect(c()).toBe(2) // still live after the creating scope stopped
    live.dispose()
  })
})

describe('detached', () => {
  it('runs with no current scope and restores the previous one, even on a throw', () => {
    const scope = effectScope()
    setCurrentScope(scope)
    expect(detached(() => getCurrentScope())).toBeNull()
    expect(getCurrentScope()).toBe(scope)
    expect(() =>
      detached(() => {
        throw new Error('x')
      }),
    ).toThrow('x')
    expect(getCurrentScope()).toBe(scope)
    setCurrentScope(null)
  })
})
