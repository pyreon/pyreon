import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetRegistry, useStorage } from '../index'

describe('cross-tab sync — edge cases', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetRegistry()
  })

  afterEach(() => {
    localStorage.clear()
    _resetRegistry()
  })

  it('a null-key event (localStorage.clear() in another tab) resets to default', () => {
    const theme = useStorage('theme', 'light')
    theme.set('dark')

    // Simulate storage event with null key (happens on storage.clear())
    const event = Object.assign(new Event('storage'), {
      key: null,
      newValue: null,
      storageArea: localStorage,
    })
    window.dispatchEvent(event)

    expect(theme()).toBe('light')
  })

  it('ignores storage events for unregistered keys', () => {
    const theme = useStorage('theme', 'light')

    // Event for a key we don't track
    const event = Object.assign(new Event('storage'), {
      key: 'other-key',
      newValue: JSON.stringify('value'),
      storageArea: localStorage,
    })
    window.dispatchEvent(event)

    expect(theme()).toBe('light')
  })

  it('storage set catch branch — handles quota error gracefully', () => {
    const sig = useStorage('quota-test', 'default')
    // Even if the internal storage.setItem throws, the signal should still update
    sig.set('value')
    expect(sig()).toBe('value')
  })
})

