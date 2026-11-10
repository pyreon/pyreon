/**
 * Lazy lifecycle hooks: a component that registers nothing shares the frozen
 * `EMPTY_HOOKS`; the first registration materialises a real object. The
 * leak-class contract: laziness must never DROP a registration.
 */
import { onCleanup } from '@pyreon/reactivity'
import { _runHooked, _takeHooks, runWithHooks } from '../component'
import { EMPTY_HOOKS, getCurrentHooks, onMount, onUnmount, onUpdate } from '../lifecycle'

describe('lazy lifecycle hooks', () => {
  test('no registration → the shared frozen EMPTY_HOOKS', () => {
    _runHooked(() => null, {})
    const h = _takeHooks()
    expect(h).toBe(EMPTY_HOOKS)
    expect(Object.isFrozen(h)).toBe(true)
  })

  test('every registration kind materialises and is kept', () => {
    const m = () => {}
    const u = () => {}
    const up = () => {}
    const c = () => {}
    _runHooked(() => {
      onMount(m)
      onUnmount(u)
      onUpdate(up)
      onCleanup(c)
      return null
    }, {})
    const h = _takeHooks()
    expect(h).not.toBe(EMPTY_HOOKS)
    expect(h.mount).toEqual([m])
    expect(h.update).toEqual([up])
    expect(h.unmount).toEqual([u, c])
  })

  test('a setup onCleanup alone still materialises an unmount list', () => {
    const c = () => {}
    _runHooked(() => {
      onCleanup(c)
      return null
    }, {})
    expect(_takeHooks().unmount).toEqual([c])
  })

  test('nested setup: the parent keeps hooks registered before AND after a child ran', () => {
    const before = () => {}
    const after = () => {}
    const childHook = () => {}
    let childHooks: unknown
    _runHooked(() => {
      onMount(before)
      _runHooked(() => {
        onMount(childHook)
        return null
      }, {})
      childHooks = _takeHooks()
      onMount(after)
      return null
    }, {})
    expect(_takeHooks().mount).toEqual([before, after])
    expect((childHooks as { mount: unknown[] }).mount).toEqual([childHook])
  })

  test('nested setup where the parent registers only AFTER the child', () => {
    const after = () => {}
    _runHooked(() => {
      _runHooked(() => null, {})
      _takeHooks()
      onUnmount(after)
      return null
    }, {})
    expect(_takeHooks().unmount).toEqual([after])
  })

  test('a throwing setup leaves nothing parked for the next reader', () => {
    expect(() =>
      _runHooked(() => {
        onMount(() => {})
        throw new Error('boom')
      }, {}),
    ).toThrow('boom')
    expect(_takeHooks()).toBe(EMPTY_HOOKS)
  })

  test('getCurrentHooks() during setup returns a writable object', () => {
    _runHooked(() => {
      const h = getCurrentHooks()!
      expect(Object.isFrozen(h)).toBe(false)
      h.mount = [() => {}]
      return null
    }, {})
    expect(_takeHooks().mount).toHaveLength(1)
  })

  test('runWithHooks keeps its { vnode, hooks } contract', () => {
    const r = runWithHooks(() => 'v', {})
    expect(r.vnode).toBe('v')
    expect(r.hooks).toBe(EMPTY_HOOKS)
  })
})
