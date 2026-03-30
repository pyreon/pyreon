/**
 * @pyreon/hotkeys — Reactive keyboard shortcut management for Pyreon.
 *
 * Register global or scoped keyboard shortcuts with automatic lifecycle
 * management. Supports modifier keys, aliases, input filtering, and
 * scope-based activation.
 *
 * @example
 * ```ts
 * import { useHotkey, useHotkeyScope } from '@pyreon/hotkeys'
 *
 * // Global shortcut
 * useHotkey('ctrl+s', () => save(), { description: 'Save' })
 *
 * // Scoped shortcut — only active when scope is enabled
 * useHotkeyScope('editor')
 * useHotkey('ctrl+z', () => undo(), { scope: 'editor' })
 *
 * // Platform-aware — mod = ⌘ on Mac, Ctrl elsewhere
 * useHotkey('mod+k', () => openCommandPalette())
 * ```
 */

// ─── Hooks ───────────────────────────────────────────────────────────────────

export { useHotkey } from './use-hotkey'
export { useHotkeyScope } from './use-hotkey-scope'

// ─── Imperative API ──────────────────────────────────────────────────────────

export {
  disableScope,
  enableScope,
  getActiveScopes,
  getRegisteredHotkeys,
  registerHotkey,
} from './registry'

// ─── Utilities ───────────────────────────────────────────────────────────────

export { formatCombo, matchesCombo, parseShortcut } from './parse'

// ─── Types ───────────────────────────────────────────────────────────────────

export type { HotkeyEntry, HotkeyOptions, KeyCombo } from './types'

// ─── Testing ─────────────────────────────────────────────────────────────────

export { _resetHotkeys } from './registry'
