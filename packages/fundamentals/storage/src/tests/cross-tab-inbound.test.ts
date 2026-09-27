import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetRegistry, _resetStorageListener, useSessionStorage, useStorage } from '../index'
import { serialize } from '../utils'

/**
 * An INBOUND cross-tab `storage` event reflects a write another tab already
 * made to the shared localStorage. Applying it must update this tab's signal
 * WITHOUT writing back — a write-back turns a removal in tab A into a
 * re-creation of the key by tab B, and two tabs on different `version`s
 * re-serialize each other's value forever.
 */

function storageEvent(init: {
  key: string | null
  newValue: string | null
  storageArea?: Storage | null
}): Event {
  return Object.assign(new Event('storage'), {
    storageArea: localStorage,
    ...init,
  })
}

describe('cross-tab inbound events never write back', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    _resetRegistry()
    _resetStorageListener()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    _resetRegistry()
    _resetStorageListener()
  })

  it('a removal in another tab is NOT undone by this tab', () => {
    const theme = useStorage('theme', 'light')
    theme.set('dark')

    // Tab A removed the key from the SHARED storage, then the event arrives.
    localStorage.removeItem('theme')
    window.dispatchEvent(storageEvent({ key: 'theme', newValue: null }))

    expect(theme()).toBe('light')
    expect(localStorage.getItem('theme')).toBeNull()
  })

  it('an inbound value is not re-serialized back to storage (no ping-pong)', () => {
    // This tab is on schema v2; the other tab writes an unversioned (v0) value.
    const profile = useStorage('profile', { name: '' }, {
      version: 2,
      migrate: (old) => ({ name: String((old as { n: string }).n) }),
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    const raw = JSON.stringify({ n: 'Ada' })
    localStorage.setItem('profile', raw)
    setItem.mockClear()
    window.dispatchEvent(storageEvent({ key: 'profile', newValue: raw }))

    expect(profile()).toEqual({ name: 'Ada' })
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem('profile')).toBe(raw)
  })

  it('an inbound value cancels a pending debounced write of an OLDER local value', () => {
    vi.useFakeTimers()
    try {
      const draft = useStorage('draft', '', { writeDebounceMs: 100 })
      draft.set('local-older')

      localStorage.setItem('draft', serialize('remote-newer'))
      window.dispatchEvent(storageEvent({ key: 'draft', newValue: serialize('remote-newer') }))
      vi.advanceTimersByTime(500)

      expect(draft()).toBe('remote-newer')
      expect(localStorage.getItem('draft')).toBe(serialize('remote-newer'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('localStorage.clear() in another tab (key === null) resets every local signal', () => {
    const token = useStorage('token', '')
    const theme = useStorage('theme', 'light')
    token.set('secret')
    theme.set('dark')

    localStorage.clear()
    window.dispatchEvent(storageEvent({ key: null, newValue: null }))

    expect(token()).toBe('')
    expect(theme()).toBe('light')
    // Still no write-back: the cleared storage stays cleared.
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('theme')).toBeNull()
  })

  it('a clear of a DIFFERENT storage area does not touch local signals', () => {
    const token = useStorage('token', '')
    token.set('secret')
    const step = useSessionStorage('step', 0)
    step.set(3)

    window.dispatchEvent(storageEvent({ key: null, newValue: null, storageArea: sessionStorage }))
    window.dispatchEvent(
      storageEvent({ key: 'token', newValue: serialize('x'), storageArea: sessionStorage }),
    )

    expect(token()).toBe('secret')
    expect(step()).toBe(3)
  })
})
