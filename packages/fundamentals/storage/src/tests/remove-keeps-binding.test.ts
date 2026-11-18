import { effectScope } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetRegistry, _resetStorageListener, useStorage } from '../index'
import { getEntry } from '../registry'

/**
 * #4381: `useStorage(...).remove()` used to delete the key AND release this
 * consumer's refcount and the cross-tab listener. A component that kept using
 * the key afterwards held a dead signal: other tabs no longer updated it, and
 * the next `useStorage(key)` minted a second, independent signal.
 *
 * Contract now: `remove()` deletes the stored value and resets to the default;
 * the binding stays alive until its owner scope is disposed.
 */
const otherTabWrites = (key: string | null, value: string | null) => {
  window.dispatchEvent(
    Object.assign(new Event('storage'), { key, newValue: value, storageArea: window.localStorage }),
  )
}

beforeEach(() => {
  localStorage.clear()
  _resetRegistry()
  _resetStorageListener()
})

afterEach(() => {
  localStorage.clear()
  _resetRegistry()
  _resetStorageListener()
})

describe('useStorage().remove() keeps the binding alive (#4381)', () => {
  it('the issue reproduction: a component keeps using the key after remove()', () => {
    const owner = effectScope()
    const theme = owner.runInScope(() => useStorage('theme', 'light'))

    theme.set('dark')
    theme.remove()
    expect(theme()).toBe('light')
    expect(localStorage.getItem('theme')).toBeNull()

    // Writes reach storage again.
    theme.set('sepia')
    expect(localStorage.getItem('theme')).toBe(JSON.stringify('sepia'))

    // Another tab's write still arrives.
    otherTabWrites('theme', JSON.stringify('contrast'))
    expect(theme()).toBe('contrast')

    // A later call for the same key gets the SAME live signal.
    expect(owner.runInScope(() => useStorage('theme', 'light'))).toBe(theme)

    owner.stop()
  })

  it('the owner scope disposal releases the binding: no cross-tab routing, entry gone', () => {
    const owner = effectScope()
    const theme = owner.runInScope(() => useStorage('theme', 'light'))
    theme.remove()
    owner.stop()

    expect(getEntry('local', 'theme')).toBeUndefined()
    otherTabWrites('theme', JSON.stringify('dark'))
    expect(theme()).toBe('light') // the listener is detached; nothing routes here
  })
})
