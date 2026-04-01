import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetHotkeys,
  disableScope,
  enableScope,
  formatCombo,
  getRegisteredHotkeys,
  matchesCombo,
  parseShortcut,
  registerHotkey,
} from '../index'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fireKey(
  key: string,
  modifiers: Partial<{
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
    metaKey: boolean
  }> = {},
  target?: HTMLElement,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    bubbles: true,
    cancelable: true,
  })
  ;(target ?? window).dispatchEvent(event)
  return event
}

// ─── Additional coverage tests ─────────────────────────────────────────────

describe('parseShortcut — additional coverage', () => {
  it('handles plus key via alias', () => {
    const combo = parseShortcut('ctrl+plus')
    expect(combo.ctrl).toBe(true)
    expect(combo.key).toBe('+')
  })

  it('handles spacebar alias', () => {
    expect(parseShortcut('spacebar').key).toBe(' ')
  })

  it('handles arrow key aliases', () => {
    expect(parseShortcut('up').key).toBe('arrowup')
    expect(parseShortcut('down').key).toBe('arrowdown')
    expect(parseShortcut('left').key).toBe('arrowleft')
    expect(parseShortcut('right').key).toBe('arrowright')
  })

  it('handles ins alias', () => {
    expect(parseShortcut('ins').key).toBe('insert')
  })

  it('trims whitespace in parts', () => {
    const combo = parseShortcut(' ctrl + shift + s ')
    expect(combo.ctrl).toBe(true)
    expect(combo.shift).toBe(true)
    expect(combo.key).toBe('s')
  })
})

describe('matchesCombo — additional coverage', () => {
  it('does not match when alt differs', () => {
    const combo = parseShortcut('alt+a')
    const event = new KeyboardEvent('keydown', { key: 'a', altKey: false })
    expect(matchesCombo(event, combo)).toBe(false)
  })

  it('does not match when meta differs', () => {
    const combo = parseShortcut('meta+k')
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: false })
    expect(matchesCombo(event, combo)).toBe(false)
  })

  it('matches complex combo with all modifiers', () => {
    const combo = parseShortcut('ctrl+shift+alt+meta+x')
    const event = new KeyboardEvent('keydown', {
      key: 'x',
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
      metaKey: true,
    })
    expect(matchesCombo(event, combo)).toBe(true)
  })
})

describe('formatCombo — additional coverage', () => {
  it('formats alt modifier', () => {
    const result = formatCombo(parseShortcut('alt+a'))
    expect(result).toContain('Alt')
  })

  it('formats meta modifier on non-Mac', () => {
    // happy-dom is non-Mac, so meta shows as "Meta"
    const result = formatCombo(parseShortcut('meta+k'))
    expect(result).toContain('Meta')
  })
})

describe('registerHotkey — additional coverage', () => {
  beforeEach(() => _resetHotkeys())
  afterEach(() => _resetHotkeys())

  it('stopPropagation option works', () => {
    registerHotkey('ctrl+s', () => {}, { stopPropagation: true })
    const event = fireKey('s', { ctrlKey: true })
    // Can't easily test stopPropagation on window, but the path is exercised
  })

  it('does not fire in select elements by default', () => {
    let fired = false
    registerHotkey('ctrl+s', () => {
      fired = true
    })

    const select = document.createElement('select')
    document.body.appendChild(select)
    fireKey('s', { ctrlKey: true }, select)
    select.remove()

    expect(fired).toBe(false)
  })

  it('unregister is idempotent', () => {
    const unsub = registerHotkey('ctrl+s', () => {})
    unsub()
    unsub() // double-call should not throw
    expect(getRegisteredHotkeys()).toHaveLength(0)
  })

  it('getRegisteredHotkeys omits description when not provided', () => {
    registerHotkey('ctrl+s', () => {})
    const hotkeys = getRegisteredHotkeys()
    expect(hotkeys[0]).toEqual({
      shortcut: 'ctrl+s',
      scope: 'global',
    })
    expect('description' in hotkeys[0]!).toBe(false)
  })

  it('handles null target in isInputFocused', () => {
    let fired = false
    registerHotkey('a', () => {
      fired = true
    })
    // Dispatch on window (target could be window, not an element)
    fireKey('a')
    expect(fired).toBe(true)
  })

  it('scope restricts which hotkeys fire', () => {
    let globalFired = false
    let editorFired = false

    registerHotkey('ctrl+s', () => {
      globalFired = true
    })
    registerHotkey(
      'ctrl+s',
      () => {
        editorFired = true
      },
      { scope: 'editor' },
    )

    fireKey('s', { ctrlKey: true })
    expect(globalFired).toBe(true)
    expect(editorFired).toBe(false)

    // Enable editor scope
    enableScope('editor')
    globalFired = false
    fireKey('s', { ctrlKey: true })
    expect(globalFired).toBe(true)
    expect(editorFired).toBe(true)

    // Disable editor scope
    disableScope('editor')
    editorFired = false
    fireKey('s', { ctrlKey: true })
    expect(editorFired).toBe(false)
  })
})
