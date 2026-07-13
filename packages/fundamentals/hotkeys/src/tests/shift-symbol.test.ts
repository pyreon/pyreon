import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { matchesCombo, parseShortcut } from '../parse'
import { _resetHotkeys, registerHotkey } from '../registry'

// A single printable SYMBOL character (`?`, `!`, `+`, …) is typed WITH Shift on
// a standard layout, so the real `keydown` for a `?` binding carries
// `shiftKey: true`. Exact-modifier matching used to reject it, so the canonical
// "show help" shortcut (`?`, as in Gmail / GitHub) never fired. `matchesCombo`
// now ignores Shift for symbol keys — the produced `event.key` already encodes
// the character, so `/` and `?` still don't collide.
describe('hotkeys — shifted-symbol single-key shortcuts', () => {
  function fire(key: string, shiftKey: boolean): boolean {
    const ev = new KeyboardEvent('keydown', {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    })
    let fired = false
    _resetHotkeys()
    registerHotkey('?', () => {
      fired = true
    })
    // Re-register above resets state; dispatch a specifically-shaped event.
    window.dispatchEvent(ev)
    return fired
  }

  beforeEach(() => _resetHotkeys())
  afterEach(() => _resetHotkeys())

  it('`?` binding fires on the real Shift+/ keystroke (event.key `?`, shiftKey true)', () => {
    expect(fire('?', true)).toBe(true)
  })

  it('`?` binding also fires when event.key is `?` without shift (layout-agnostic)', () => {
    expect(fire('?', false)).toBe(true)
  })

  it('a plain `/` keystroke does NOT fire the `?` binding — event.key distinguishes them', () => {
    let fired = false
    registerHotkey('?', () => {
      fired = true
    })
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '/', shiftKey: false, bubbles: true, cancelable: true }),
    )
    expect(fired).toBe(false)
  })

  it('matchesCombo: symbol key ignores the shift bit, letter key enforces it', () => {
    // Symbol `?` — matches regardless of shiftKey.
    const q = parseShortcut('?')
    expect(matchesCombo(new KeyboardEvent('keydown', { key: '?', shiftKey: true }), q)).toBe(true)
    expect(matchesCombo(new KeyboardEvent('keydown', { key: '?', shiftKey: false }), q)).toBe(true)

    // Letter `a` — exact shift-matching preserved (`a` ≠ Shift+A).
    const a = parseShortcut('a')
    expect(matchesCombo(new KeyboardEvent('keydown', { key: 'a', shiftKey: false }), a)).toBe(true)
    expect(matchesCombo(new KeyboardEvent('keydown', { key: 'a', shiftKey: true }), a)).toBe(false)
  })

  it('`+` (via `plus` alias) fires on Shift+= producing `+`', () => {
    let fired = false
    registerHotkey('plus', () => {
      fired = true
    })
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '+', shiftKey: true, bubbles: true, cancelable: true }),
    )
    expect(fired).toBe(true)
  })

  it('space keeps exact shift-matching (not treated as a symbol)', () => {
    const space = parseShortcut('space')
    expect(matchesCombo(new KeyboardEvent('keydown', { key: ' ', shiftKey: false }), space)).toBe(
      true,
    )
    expect(matchesCombo(new KeyboardEvent('keydown', { key: ' ', shiftKey: true }), space)).toBe(
      false,
    )
  })

  it('named multi-char keys keep exact shift-matching (arrowup ≠ Shift+ArrowUp)', () => {
    const up = parseShortcut('up')
    expect(matchesCombo(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: false }), up)).toBe(
      true,
    )
    expect(matchesCombo(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true }), up)).toBe(
      false,
    )
  })
})
