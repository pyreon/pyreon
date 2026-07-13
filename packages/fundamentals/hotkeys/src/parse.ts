import type { KeyCombo } from './types'

// ─── Key aliases ─────────────────────────────────────────────────────────────

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  del: 'delete',
  ins: 'insert',
  space: ' ',
  spacebar: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  plus: '+',
}

/**
 * Parse a shortcut string like 'ctrl+shift+s' into a KeyCombo.
 * Supports aliases (esc, del, space, etc.) and mod (ctrl on Windows/Linux, meta on Mac).
 */
export function parseShortcut(shortcut: string): KeyCombo {
  const parts = shortcut.toLowerCase().trim().split('+')
  const combo: KeyCombo = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: '',
  }

  for (const part of parts) {
    const p = part.trim()
    if (p === 'ctrl' || p === 'control') {
      combo.ctrl = true
    } else if (p === 'shift') {
      combo.shift = true
    } else if (p === 'alt') {
      combo.alt = true
    } else if (p === 'meta' || p === 'cmd' || p === 'command') {
      combo.meta = true
    } else if (p === 'mod') {
      // mod = meta on Mac, ctrl elsewhere
      if (isMac()) {
        combo.meta = true
      } else {
        combo.ctrl = true
      }
    } else {
      combo.key = KEY_ALIASES[p] ?? p
    }
  }

  return combo
}

/**
 * A single-character key whose typing inherently requires Shift on a standard
 * layout (`?`, `!`, `@`, `+`, `<`, `:`, …). Letters, digits, and space are NOT
 * symbols. `combo.key` is already lower-cased at parse time.
 */
function isSymbolKey(key: string): boolean {
  return key.length === 1 && !/[a-z0-9 ]/.test(key)
}

/**
 * Match core shared by {@link matchesCombo} and the dispatch hot path, taking a
 * PRE-LOWERCASED `event.key` so the per-keydown dispatch loop computes
 * `toLowerCase()` once instead of once per registered entry. Key is checked
 * FIRST — it's the most selective field, so a non-matching keystroke rejects
 * before touching the modifier bits. Not exported from the package.
 *
 * @internal
 */
export function matchesComboWithKey(
  event: KeyboardEvent,
  combo: KeyCombo,
  eventKey: string,
): boolean {
  if (eventKey !== combo.key) return false
  if (event.ctrlKey !== combo.ctrl) return false
  if (event.altKey !== combo.alt) return false
  if (event.metaKey !== combo.meta) return false

  // Shift handling: for a single-character SYMBOL key (`?`, `!`, `+`, `/`, …),
  // whether Shift was needed to type it is keyboard-layout-dependent, and the
  // produced `event.key` already encodes the character. So the Shift modifier is
  // NOT enforced for symbol keys — binding `?` fires on the real `Shift+/`
  // keystroke (the canonical "show help" shortcut) without the author having to
  // write `shift+?`, and the distinct `event.key` values keep `/` and `?` from
  // colliding. Letters and named keys keep exact Shift-matching, so `a` never
  // matches `Shift+A` and `arrowup` never matches `Shift+ArrowUp`.
  if (isSymbolKey(combo.key)) return true
  return event.shiftKey === combo.shift
}

/**
 * Check if a KeyboardEvent matches a KeyCombo. See {@link matchesComboWithKey}
 * for the Shift/symbol semantics.
 */
export function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  return matchesComboWithKey(event, combo, event.key.toLowerCase())
}

/**
 * Format a KeyCombo back to a human-readable string.
 */
export function formatCombo(combo: KeyCombo): string {
  const parts: string[] = []
  if (combo.ctrl) parts.push('Ctrl')
  if (combo.shift) parts.push('Shift')
  if (combo.alt) parts.push('Alt')
  if (combo.meta) parts.push(isMac() ? '⌘' : 'Meta')
  parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : capitalize(combo.key))
  return parts.join('+')
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent)
}
