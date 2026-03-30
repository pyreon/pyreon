import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetHotkeys,
  disableScope,
  enableScope,
  formatCombo,
  getActiveScopes,
  getRegisteredHotkeys,
  matchesCombo,
  parseShortcut,
  registerHotkey,
} from '../index'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('parseShortcut', () => {
  it('parses simple key', () => {
    const combo = parseShortcut('a')
    expect(combo).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      key: 'a',
    })
  })

  it('parses ctrl+key', () => {
    const combo = parseShortcut('ctrl+s')
    expect(combo.ctrl).toBe(true)
    expect(combo.key).toBe('s')
  })

  it('parses multiple modifiers', () => {
    const combo = parseShortcut('ctrl+shift+alt+k')
    expect(combo.ctrl).toBe(true)
    expect(combo.shift).toBe(true)
    expect(combo.alt).toBe(true)
    expect(combo.key).toBe('k')
  })

  it('parses meta/cmd/command as meta', () => {
    expect(parseShortcut('meta+k').meta).toBe(true)
    expect(parseShortcut('cmd+k').meta).toBe(true)
    expect(parseShortcut('command+k').meta).toBe(true)
  })

  it('handles aliases', () => {
    expect(parseShortcut('esc').key).toBe('escape')
    expect(parseShortcut('return').key).toBe('enter')
    expect(parseShortcut('del').key).toBe('delete')
    expect(parseShortcut('space').key).toBe(' ')
  })

  it('parses mod as ctrl on non-Mac', () => {
    // happy-dom doesn't simulate Mac, so mod should resolve to ctrl
    const combo = parseShortcut('mod+k')
    expect(combo.ctrl || combo.meta).toBe(true)
    expect(combo.key).toBe('k')
  })

  it('parses control as ctrl', () => {
    expect(parseShortcut('control+s').ctrl).toBe(true)
  })

  it('is case-insensitive', () => {
    const combo = parseShortcut('Ctrl+Shift+S')
    expect(combo.ctrl).toBe(true)
    expect(combo.shift).toBe(true)
    expect(combo.key).toBe('s')
  })
})

describe('matchesCombo', () => {
  it('matches simple key', () => {
    const combo = parseShortcut('a')
    const event = new KeyboardEvent('keydown', { key: 'a' })
    expect(matchesCombo(event, combo)).toBe(true)
  })

  it('matches with modifiers', () => {
    const combo = parseShortcut('ctrl+s')
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true })
    expect(matchesCombo(event, combo)).toBe(true)
  })

  it('does not match when modifier is missing', () => {
    const combo = parseShortcut('ctrl+s')
    const event = new KeyboardEvent('keydown', { key: 's' })
    expect(matchesCombo(event, combo)).toBe(false)
  })

  it('does not match when extra modifier is present', () => {
    const combo = parseShortcut('ctrl+s')
    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      shiftKey: true,
    })
    expect(matchesCombo(event, combo)).toBe(false)
  })

  it('does not match wrong key', () => {
    const combo = parseShortcut('ctrl+s')
    const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })
    expect(matchesCombo(event, combo)).toBe(false)
  })
})

describe('formatCombo', () => {
  it('formats simple key', () => {
    expect(formatCombo(parseShortcut('a'))).toBe('A')
  })

  it('formats with modifiers', () => {
    const result = formatCombo(parseShortcut('ctrl+shift+s'))
    expect(result).toBe('Ctrl+Shift+S')
  })

  it('capitalizes special keys', () => {
    expect(formatCombo(parseShortcut('escape'))).toBe('Escape')
    expect(formatCombo(parseShortcut('enter'))).toBe('Enter')
  })
})

describe('registerHotkey', () => {
  beforeEach(() => {
    _resetHotkeys()
  })

  afterEach(() => {
    _resetHotkeys()
  })

  it('fires handler on matching keydown', () => {
    let fired = false
    registerHotkey('ctrl+s', () => {
      fired = true
    })
    fireKey('s', { ctrlKey: true })
    expect(fired).toBe(true)
  })

  it('does not fire on non-matching key', () => {
    let fired = false
    registerHotkey('ctrl+s', () => {
      fired = true
    })
    fireKey('a', { ctrlKey: true })
    expect(fired).toBe(false)
  })

  it('does not fire without required modifier', () => {
    let fired = false
    registerHotkey('ctrl+s', () => {
      fired = true
    })
    fireKey('s')
    expect(fired).toBe(false)
  })

  it('passes the event to the handler', () => {
    let receivedEvent: KeyboardEvent | null = null
    registerHotkey('ctrl+s', (e) => {
      receivedEvent = e
    })
    fireKey('s', { ctrlKey: true })
    expect(receivedEvent).not.toBeNull()
    expect(receivedEvent!.key).toBe('s')
  })

  it('preventDefault is true by default', () => {
    registerHotkey('ctrl+s', () => {
      // handler
    })
    const event = fireKey('s', { ctrlKey: true })
    expect(event.defaultPrevented).toBe(true)
  })

  it('preventDefault can be disabled', () => {
    registerHotkey(
      'ctrl+s',
      () => {
        // handler
      },
      { preventDefault: false },
    )
    const event = fireKey('s', { ctrlKey: true })
    expect(event.defaultPrevented).toBe(false)
  })

  it('unregister function removes the hotkey', () => {
    let count = 0
    const unregister = registerHotkey('ctrl+s', () => {
      count++
    })
    fireKey('s', { ctrlKey: true })
    expect(count).toBe(1)

    unregister()
    fireKey('s', { ctrlKey: true })
    expect(count).toBe(1)
  })

  it('does not fire in input elements by default', () => {
    let fired = false
    registerHotkey('ctrl+s', () => {
      fired = true
    })

    const input = document.createElement('input')
    document.body.appendChild(input)
    fireKey('s', { ctrlKey: true }, input)
    input.remove()

    expect(fired).toBe(false)
  })

  it('fires in input elements when enableOnInputs is true', () => {
    let fired = false
    registerHotkey(
      'ctrl+s',
      () => {
        fired = true
      },
      { enableOnInputs: true },
    )

    const input = document.createElement('input')
    document.body.appendChild(input)
    fireKey('s', { ctrlKey: true }, input)
    input.remove()

    expect(fired).toBe(true)
  })

  it('does not fire in textarea by default', () => {
    let fired = false
    registerHotkey('ctrl+s', () => {
      fired = true
    })

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    fireKey('s', { ctrlKey: true }, textarea)
    textarea.remove()

    expect(fired).toBe(false)
  })

  it('does not fire in contenteditable by default', () => {
    let fired = false
    registerHotkey('ctrl+s', () => {
      fired = true
    })

    const div = document.createElement('div')
    div.contentEditable = 'true'
    document.body.appendChild(div)
    fireKey('s', { ctrlKey: true }, div)
    div.remove()

    expect(fired).toBe(false)
  })

  it('enabled: false prevents firing', () => {
    let fired = false
    registerHotkey(
      'ctrl+s',
      () => {
        fired = true
      },
      { enabled: false },
    )
    fireKey('s', { ctrlKey: true })
    expect(fired).toBe(false)
  })

  it('enabled as function controls firing dynamically', () => {
    let enabled = true
    let count = 0
    registerHotkey(
      'ctrl+s',
      () => {
        count++
      },
      { enabled: () => enabled },
    )

    fireKey('s', { ctrlKey: true })
    expect(count).toBe(1)

    enabled = false
    fireKey('s', { ctrlKey: true })
    expect(count).toBe(1)
  })

  it('multiple hotkeys can be registered', () => {
    let saveCount = 0
    let undoCount = 0
    registerHotkey('ctrl+s', () => saveCount++)
    registerHotkey('ctrl+z', () => undoCount++)

    fireKey('s', { ctrlKey: true })
    fireKey('z', { ctrlKey: true })

    expect(saveCount).toBe(1)
    expect(undoCount).toBe(1)
  })
})

describe('scopes', () => {
  beforeEach(() => {
    _resetHotkeys()
  })

  afterEach(() => {
    _resetHotkeys()
  })

  it('global scope is active by default', () => {
    const scopes = getActiveScopes()
    expect(scopes.peek().has('global')).toBe(true)
  })

  it('global scope hotkeys fire by default', () => {
    let fired = false
    registerHotkey('ctrl+s', () => {
      fired = true
    })
    fireKey('s', { ctrlKey: true })
    expect(fired).toBe(true)
  })

  it('non-global scope hotkeys do not fire by default', () => {
    let fired = false
    registerHotkey(
      'ctrl+s',
      () => {
        fired = true
      },
      { scope: 'editor' },
    )
    fireKey('s', { ctrlKey: true })
    expect(fired).toBe(false)
  })

  it('enableScope activates a scope', () => {
    let fired = false
    registerHotkey(
      'ctrl+s',
      () => {
        fired = true
      },
      { scope: 'editor' },
    )

    enableScope('editor')
    fireKey('s', { ctrlKey: true })
    expect(fired).toBe(true)
  })

  it('disableScope deactivates a scope', () => {
    let count = 0
    registerHotkey(
      'ctrl+s',
      () => {
        count++
      },
      { scope: 'editor' },
    )

    enableScope('editor')
    fireKey('s', { ctrlKey: true })
    expect(count).toBe(1)

    disableScope('editor')
    fireKey('s', { ctrlKey: true })
    expect(count).toBe(1)
  })

  it('cannot disable global scope', () => {
    disableScope('global')
    expect(getActiveScopes().peek().has('global')).toBe(true)
  })

  it('enableScope is idempotent', () => {
    enableScope('editor')
    enableScope('editor')
    expect(getActiveScopes().peek().size).toBe(2) // global + editor
  })

  it('disableScope for non-active scope is no-op', () => {
    disableScope('nonexistent')
    expect(getActiveScopes().peek().size).toBe(1)
  })
})

describe('getRegisteredHotkeys', () => {
  beforeEach(() => {
    _resetHotkeys()
  })

  afterEach(() => {
    _resetHotkeys()
  })

  it('returns all registered hotkeys', () => {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op handlers for registry test
    const noop = () => {}
    registerHotkey('ctrl+s', noop, { description: 'Save' })
    registerHotkey('ctrl+z', noop, { scope: 'editor', description: 'Undo' })

    const hotkeys = getRegisteredHotkeys()
    expect(hotkeys).toHaveLength(2)
    expect(hotkeys[0]).toEqual({
      shortcut: 'ctrl+s',
      scope: 'global',
      description: 'Save',
    })
    expect(hotkeys[1]).toEqual({
      shortcut: 'ctrl+z',
      scope: 'editor',
      description: 'Undo',
    })
  })

  it('reflects unregistered hotkeys', () => {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op handler
    const noop = () => {}
    const unsub = registerHotkey('ctrl+s', noop)
    expect(getRegisteredHotkeys()).toHaveLength(1)
    unsub()
    expect(getRegisteredHotkeys()).toHaveLength(0)
  })
})
