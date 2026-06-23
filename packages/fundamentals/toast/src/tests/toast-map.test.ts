import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _reset, _toastMap, _toasts, toast } from '../toast'

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

  it('drops an id once its toast is dismissed', () => {
    const id = toast('X', { duration: 0 })
    expect(_toastMap().has(id)).toBe(true)
    toast.dismiss(id)
    expect(_toastMap().has(id)).toBe(false)
    expect(_toastMap().size).toBe(0)
  })

  it('is empty for an empty queue', () => {
    expect(_toastMap().size).toBe(0)
    expect(_toasts().length).toBe(0)
  })
})
