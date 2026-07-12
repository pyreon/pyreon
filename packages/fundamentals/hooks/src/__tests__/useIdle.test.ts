import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mountCallbacks: Array<() => unknown> = []
let unmountCallbacks: Array<() => void> = []

vi.mock('@pyreon/core', () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(() => {
      const ret = fn()
      if (typeof ret === 'function') unmountCallbacks.push(ret as () => void)
    })
  },
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn)
  },
}))

import { useIdle } from '../useIdle'

describe('useIdle', () => {
  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts not idle by default', () => {
    const idle = useIdle(1000)
    expect(idle()).toBe(false)
  })

  it('honours initialState', () => {
    const idle = useIdle(1000, { initialState: true })
    expect(idle()).toBe(true)
  })

  it('goes idle after the timeout with no activity', () => {
    const idle = useIdle(1000)
    mountCallbacks.forEach((cb) => cb())
    expect(idle()).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(idle()).toBe(true)
  })

  it('resets to active on an activity event and re-arms the timer', () => {
    const idle = useIdle(1000)
    mountCallbacks.forEach((cb) => cb())
    vi.advanceTimersByTime(1000)
    expect(idle()).toBe(true)

    document.dispatchEvent(new Event('mousemove'))
    expect(idle()).toBe(false)

    // Not idle again until another full window elapses.
    vi.advanceTimersByTime(999)
    expect(idle()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(idle()).toBe(true)
  })

  it('activity before the timeout keeps it active', () => {
    const idle = useIdle(1000)
    mountCallbacks.forEach((cb) => cb())
    vi.advanceTimersByTime(500)
    document.dispatchEvent(new Event('keydown'))
    vi.advanceTimersByTime(500)
    expect(idle()).toBe(false)
  })

  it('respects a custom events list', () => {
    const idle = useIdle(1000, { events: ['click'] })
    mountCallbacks.forEach((cb) => cb())
    vi.advanceTimersByTime(1000)
    expect(idle()).toBe(true)
    // A non-listed event does not reset.
    document.dispatchEvent(new Event('mousemove'))
    expect(idle()).toBe(true)
    // The listed event does.
    document.dispatchEvent(new Event('click'))
    expect(idle()).toBe(false)
  })

  it('clears the timer and listeners on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    useIdle(1000)
    mountCallbacks.forEach((cb) => cb())
    unmountCallbacks.forEach((cb) => cb())
    expect(clearSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    removeSpy.mockRestore()
    clearSpy.mockRestore()
  })
})
