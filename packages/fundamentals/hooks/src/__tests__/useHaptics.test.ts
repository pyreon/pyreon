import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHaptics } from '../useHaptics'

function mockVibrate(impl: (...args: unknown[]) => boolean = () => true) {
  const fn = vi.fn(impl)
  Object.defineProperty(navigator, 'vibrate', {
    value: fn,
    writable: true,
    configurable: true,
  })
  return fn
}

afterEach(() => {
  // Remove the mocked navigator.vibrate so tests can't leak into each other.
  delete (navigator as unknown as Record<string, unknown>).vibrate
})

describe('useHaptics', () => {
  it('impact() defaults to the medium duration', () => {
    const vibrate = mockVibrate()
    useHaptics().impact()
    expect(vibrate).toHaveBeenCalledWith(20)
  })

  it('impact(style) maps each iOS style to its web duration', () => {
    const vibrate = mockVibrate()
    const h = useHaptics()
    h.impact('light')
    h.impact('medium')
    h.impact('heavy')
    h.impact('soft')
    h.impact('rigid')
    expect(vibrate.mock.calls.map((c) => c[0])).toEqual([10, 20, 30, 15, 25])
  })

  it('impact() with an unknown style falls back to medium', () => {
    const vibrate = mockVibrate()
    useHaptics().impact('bogus' as never)
    expect(vibrate).toHaveBeenCalledWith(20)
  })

  it('notification(type) maps each outcome to a distinct pattern', () => {
    const vibrate = mockVibrate()
    const h = useHaptics()
    h.notification('success')
    h.notification('warning')
    h.notification('error')
    expect(vibrate.mock.calls.map((c) => c[0])).toEqual([
      [10, 50, 10],
      [20, 40, 20],
      [30, 30, 30, 30, 30],
    ])
  })

  it('notification() with an unknown type falls back to warning', () => {
    const vibrate = mockVibrate()
    useHaptics().notification('bogus' as never)
    expect(vibrate).toHaveBeenCalledWith([20, 40, 20])
  })

  it('selection() fires a short tick', () => {
    const vibrate = mockVibrate()
    useHaptics().selection()
    expect(vibrate).toHaveBeenCalledWith(5)
  })

  it('is a silent no-op when navigator.vibrate is unavailable (desktop)', () => {
    delete (navigator as unknown as Record<string, unknown>).vibrate
    const h = useHaptics()
    expect(() => {
      h.impact('heavy')
      h.notification('error')
      h.selection()
    }).not.toThrow()
  })

  it('swallows a throwing navigator.vibrate (best-effort, never fatal)', () => {
    mockVibrate(() => {
      throw new Error('backgrounded page')
    })
    expect(() => useHaptics().impact()).not.toThrow()
  })
})
