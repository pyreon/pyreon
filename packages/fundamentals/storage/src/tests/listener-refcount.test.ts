import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetRegistry, _resetStorageListener, useStorage } from '../index'

/**
 * Regression for the cross-tab `storage` listener leak. Before the refcount,
 * the listener was attached on the first `useStorage` call and NEVER
 * removed — even after every signal was disposed via `.remove()`. The
 * listener stayed bound to `window` for the lifetime of the page.
 *
 * With the refcount, `.remove()` decrements and the listener detaches at 0.
 * A later `useStorage` reattaches cleanly.
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

  it('detaches the storage listener when every signal is disposed', () => {
    const a = useStorage('a', 0)
    const b = useStorage('b', 0)
    expect(countCalls(addSpy, 'storage')).toBe(1)
    expect(countCalls(removeSpy, 'storage')).toBe(0)

    a.remove()
    expect(countCalls(removeSpy, 'storage')).toBe(0) // still one retained

    b.remove()
    expect(countCalls(removeSpy, 'storage')).toBe(1) // now detached
  })

  it('reattaches cleanly when a new signal is created after full disposal', () => {
    const a = useStorage('a', 0)
    a.remove()
    expect(countCalls(addSpy, 'storage')).toBe(1)
    expect(countCalls(removeSpy, 'storage')).toBe(1)

    useStorage('b', 0)
    expect(countCalls(addSpy, 'storage')).toBe(2) // reattached
    expect(countCalls(removeSpy, 'storage')).toBe(1)
  })
})
