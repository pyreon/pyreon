import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _reset, _toastMap, _toasts, LEAVE_DURATION, toast } from '../toast'

beforeEach(() => _reset())
afterEach(() => _reset())

/**
 * `_toastMap` is the id→Toast lookup the Toaster's per-row reactivity reads
 * (see `_toastMap` docstring). The render layer is covered by the real-Chromium
 * `toaster.browser.test.tsx`; this node suite locks the map's derivation
 * contract directly.
 */
describe('_toastMap', () => {
  it('maps each toast id to its toast object', () => {
    const a = toast('A', { duration: 0 })
    const b = toast('B', { duration: 0 })
    const m = _toastMap()
    expect(m.size).toBe(2)
    expect(m.get(a)?.message).toBe('A')
    expect(m.get(b)?.message).toBe('B')
  })

  it('reflects the live toast after an update (same id, new object)', () => {
    const id = toast.loading('Loading...')
    expect(_toastMap().get(id)?.message).toBe('Loading...')

    toast.update(id, { message: 'Done!', type: 'success' })
    const t = _toastMap().get(id)
    expect(t?.message).toBe('Done!')
    expect(t?.type).toBe('success')
  })

  it('keeps an id through its exit animation, then drops it once removed', () => {
    vi.useFakeTimers()
    const id = toast('X', { duration: 0 })
    expect(_toastMap().has(id)).toBe(true)
    // SOFT dismiss keeps the toast in the map (as `exiting`) so the row still
    // renders its live fields during the leave transition.
    toast.dismiss(id)
    expect(_toastMap().get(id)?.state).toBe('exiting')
    // After the leave animation the hard removal drops it.
    vi.advanceTimersByTime(LEAVE_DURATION)
    expect(_toastMap().has(id)).toBe(false)
    expect(_toastMap().size).toBe(0)
    vi.useRealTimers()
  })

  it('drops an id instantly on a hard remove()', () => {
    const id = toast('X', { duration: 0 })
    expect(_toastMap().has(id)).toBe(true)
    toast.remove(id)
    expect(_toastMap().has(id)).toBe(false)
    expect(_toastMap().size).toBe(0)
  })

  it('is empty for an empty queue', () => {
    expect(_toastMap().size).toBe(0)
    expect(_toasts().length).toBe(0)
  })
})
