import { effectScope } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStorage } from '../index'
import { _resetRegistry, _resetStorageListener } from '../internal'

/**
 * Regression for the cross-tab `storage` listener leak. Before the refcount,
 * the listener was attached on the first `useStorage` call and NEVER
 * removed. The listener stayed bound to `window` for the lifetime of the page.
 *
 * With the refcount, each `useStorage` call retains, and its OWNER SCOPE's
 * disposal releases (the component unmounting); the listener detaches at 0. A
 * later `useStorage` reattaches cleanly. `.remove()` releases nothing: removing
 * the value keeps the binding alive (#4381).
 */
describe('useStorage — cross-tab listener refcount (regression)', () => {
  let addSpy: ReturnType<typeof vi.spyOn>
  let removeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    _resetStorageListener()
    _resetRegistry()
    addSpy = vi.spyOn(window, 'addEventListener')
    removeSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    addSpy.mockRestore()
    removeSpy.mockRestore()
    localStorage.clear()
    _resetStorageListener()
    _resetRegistry()
  })

  const countCalls = (spy: ReturnType<typeof vi.spyOn>, event: string): number =>
    spy.mock.calls.filter((c: unknown[]) => c[0] === event).length

  it('attaches the storage listener exactly once when multiple signals exist', () => {
    useStorage('a', 0)
    useStorage('b', 0)
    expect(countCalls(addSpy, 'storage')).toBe(1)
  })

  it('detaches the storage listener when every consumer scope is disposed', () => {
    const sa = effectScope()
    const sb = effectScope()
    sa.runInScope(() => useStorage('a', 0))
    sb.runInScope(() => useStorage('b', 0))
    expect(countCalls(addSpy, 'storage')).toBe(1)
    expect(countCalls(removeSpy, 'storage')).toBe(0)

    sa.stop()
    expect(countCalls(removeSpy, 'storage')).toBe(0) // still one retained

    sb.stop()
    expect(countCalls(removeSpy, 'storage')).toBe(1) // now detached
  })

  it('.remove() does not detach the listener (the binding stays live)', () => {
    const scope = effectScope()
    const a = scope.runInScope(() => useStorage('a', 0))
    a.remove()
    expect(countCalls(removeSpy, 'storage')).toBe(0)
    scope.stop()
    expect(countCalls(removeSpy, 'storage')).toBe(1)
  })

  it('reattaches cleanly when a new signal is created after full disposal', () => {
    const scope = effectScope()
    scope.runInScope(() => useStorage('a', 0))
    scope.stop()
    expect(countCalls(addSpy, 'storage')).toBe(1)
    expect(countCalls(removeSpy, 'storage')).toBe(1)

    useStorage('b', 0)
    expect(countCalls(addSpy, 'storage')).toBe(2) // reattached
    expect(countCalls(removeSpy, 'storage')).toBe(1)
  })
})
