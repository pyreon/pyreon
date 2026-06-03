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

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/hotkeys
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

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
