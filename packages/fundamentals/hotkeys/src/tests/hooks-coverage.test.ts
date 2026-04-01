import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let unmountCallbacks: Array<() => void> = []

vi.mock('@pyreon/core', () => ({
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn)
  },
}))

import {
  _resetHotkeys,
  enableScope,
  getActiveScopes,
  getRegisteredHotkeys,
} from '../registry'
import { useHotkey } from '../use-hotkey'
import { useHotkeyScope } from '../use-hotkey-scope'

function fireKey(
  key: string,
  modifiers: Partial<{
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
    metaKey: boolean
  }> = {},
): void {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(event)
}

describe('useHotkey', () => {
  beforeEach(() => {
    _resetHotkeys()
    unmountCallbacks = []
  })

  afterEach(() => {
    _resetHotkeys()
  })

  it('registers a hotkey that fires on keydown', () => {
    let fired = false
    useHotkey('ctrl+s', () => {
      fired = true
    })

    fireKey('s', { ctrlKey: true })
    expect(fired).toBe(true)
  })

  it('unregisters hotkey on unmount', () => {
    let count = 0
    useHotkey('ctrl+s', () => {
      count++
    })

    fireKey('s', { ctrlKey: true })
    expect(count).toBe(1)

    // Simulate unmount
    unmountCallbacks.forEach((fn) => fn())

    fireKey('s', { ctrlKey: true })
    expect(count).toBe(1) // should not fire after unmount
  })

  it('passes options to registerHotkey', () => {
    useHotkey('ctrl+s', () => {}, { description: 'Save', scope: 'editor' })
    const hotkeys = getRegisteredHotkeys()
    expect(hotkeys).toHaveLength(1)
    expect(hotkeys[0]!.description).toBe('Save')
    expect(hotkeys[0]!.scope).toBe('editor')
  })
})

describe('useHotkeyScope', () => {
  beforeEach(() => {
    _resetHotkeys()
    unmountCallbacks = []
  })

  afterEach(() => {
    _resetHotkeys()
  })

  it('enables a scope', () => {
    useHotkeyScope('modal')
    expect(getActiveScopes().peek().has('modal')).toBe(true)
  })

  it('disables scope on unmount', () => {
    useHotkeyScope('modal')
    expect(getActiveScopes().peek().has('modal')).toBe(true)

    // Simulate unmount
    unmountCallbacks.forEach((fn) => fn())

    expect(getActiveScopes().peek().has('modal')).toBe(false)
  })

  it('scoped hotkey fires when scope is active', () => {
    let fired = false
    useHotkeyScope('editor')
    useHotkey('escape', () => {
      fired = true
    }, { scope: 'editor' })

    fireKey('Escape')
    expect(fired).toBe(true)
  })
})
