// Tests for the Vue-parity APIs added in M4: markRaw, shallowReactive,
// onScopeDispose. Each surface is independent; grouped here for legibility
// rather than spreading across signal/store/scope test files.

import { effect } from '../effect'
import { effectScope, getCurrentScope, onScopeDispose } from '../scope'
import { signal } from '../signal'
import { createStore, markRaw, shallowReactive } from '../store'

describe('markRaw', () => {
  test('marks an object as raw — createStore returns it unwrapped', () => {
    const raw = markRaw({ x: 1 })
    const store = createStore({ inner: raw })
    // Reading store.inner returns the raw reference, not a proxy.
    expect(store.inner).toBe(raw)
    // Mutating raw does NOT trigger reactivity (it's not proxied).
    let runs = 0
    effect(() => {
      void store.inner.x
      runs++
    })
    expect(runs).toBe(1)
    raw.x = 99
    expect(runs).toBe(1) // not reactive — raw bypasses proxy
  })

  test('also opts out of shallowReactive wrapping', () => {
    const raw = markRaw({ y: 2 })
    const store = shallowReactive({ inner: raw })
    expect(store.inner).toBe(raw)
  })

  test('class instances marked raw are usable without proxy quirks', () => {
    class Editor {
      cursor = 0
      moveTo(pos: number): void {
        this.cursor = pos
      }
    }
    const ed = markRaw(new Editor())
    const store = createStore({ editor: ed })
    expect(() => store.editor.moveTo(5)).not.toThrow()
    expect(store.editor.cursor).toBe(5)
    expect(store.editor).toBe(ed) // identity preserved
  })

  test('markRaw is idempotent', () => {
    const obj = { x: 1 }
    expect(() => {
      markRaw(obj)
      markRaw(obj)
    }).not.toThrow()
  })
})

describe('shallowReactive', () => {
  test('top-level mutations trigger reactivity', () => {
    const store = shallowReactive({ count: 0 })
    let seen = -1
    effect(() => {
      seen = store.count
    })
    expect(seen).toBe(0)
    store.count = 5
    expect(seen).toBe(5)
  })

  test('nested mutations do NOT trigger reactivity (shallow)', () => {
    const store = shallowReactive({ user: { name: 'Alice' } })
    let runs = 0
    effect(() => {
      void store.user.name
      runs++
    })
    expect(runs).toBe(1)
    // Nested mutation — should NOT re-run because nested object is raw.
    store.user.name = 'Bob'
    expect(runs).toBe(1)
  })

  test('replacing a top-level reference DOES trigger reactivity', () => {
    const store = shallowReactive({ user: { name: 'Alice' } })
    const names: string[] = []
    effect(() => {
      names.push(store.user.name)
    })
    expect(names).toEqual(['Alice'])
    store.user = { name: 'Bob' }
    expect(names).toEqual(['Alice', 'Bob'])
  })

  test('nested reads return raw references, not proxies', () => {
    const inner = { x: 1 }
    const store = shallowReactive({ inner })
    expect(store.inner).toBe(inner)
  })

  test('separate cache from createStore — same raw can be both shallow and deep', () => {
    const raw = { x: 1 }
    const deep = createStore(raw)
    const shallow = shallowReactive({ wrapper: raw })
    // The shallow store returns raw nested, not the deep proxy.
    expect(shallow.wrapper).toBe(raw)
    // The deep store wraps raw.
    expect(deep).not.toBe(raw)
  })
})

describe('onScopeDispose', () => {
  test('callback fires when scope stops', () => {
    const scope = effectScope()
    let disposed = 0
    scope.runInScope(() => {
      onScopeDispose(() => {
        disposed++
      })
    })
    expect(disposed).toBe(0)
    scope.stop()
    expect(disposed).toBe(1)
  })

  test('multiple callbacks all fire, in registration order', () => {
    const scope = effectScope()
    const order: string[] = []
    scope.runInScope(() => {
      onScopeDispose(() => order.push('first'))
      onScopeDispose(() => order.push('second'))
      onScopeDispose(() => order.push('third'))
    })
    scope.stop()
    expect(order).toEqual(['first', 'second', 'third'])
  })

  test('warns when called outside any scope (dev mode)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let called = false
    onScopeDispose(() => {
      called = true
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('without an active EffectScope'),
    )
    expect(called).toBe(false)
    warnSpy.mockRestore()
  })

  test('captures the SCOPE active at registration time', () => {
    const scopeA = effectScope()
    const scopeB = effectScope()
    const log: string[] = []
    scopeA.runInScope(() => {
      onScopeDispose(() => log.push('A'))
    })
    scopeB.runInScope(() => {
      onScopeDispose(() => log.push('B'))
    })
    scopeA.stop()
    expect(log).toEqual(['A'])
    scopeB.stop()
    expect(log).toEqual(['A', 'B'])
  })

  test('integrates with effect lifecycle — disposes alongside scope effects', () => {
    const s = signal(0)
    const scope = effectScope()
    const events: string[] = []
    scope.runInScope(() => {
      effect(() => {
        events.push(`effect:${s()}`)
      })
      onScopeDispose(() => events.push('disposed'))
    })
    s.set(1)
    expect(events).toEqual(['effect:0', 'effect:1'])
    scope.stop()
    expect(events).toEqual(['effect:0', 'effect:1', 'disposed'])
    s.set(2)
    // Both effect and dispose callback are inactive after stop.
    expect(events).toEqual(['effect:0', 'effect:1', 'disposed'])
  })

  test('captures null-scope correctly — no-op without throwing', () => {
    expect(getCurrentScope()).toBeNull()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => {
      onScopeDispose(() => {})
    }).not.toThrow()
    warnSpy.mockRestore()
  })
})
