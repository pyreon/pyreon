import type { Signal } from '@pyreon/reactivity'
import { signal } from '@pyreon/reactivity'
import { matchesCombo, parseShortcut } from './parse'
import type { HotkeyEntry, HotkeyOptions } from './types'

// ─── State ───────────────────────────────────────────────────────────────────

// Linear array on purpose. Per-keystroke dispatch (line 35) iterates entries
// in registration order — O(n) where n = registered hotkeys. For real apps
// (single-digit to low-tens) the cost is sub-microsecond and well under the
// 16ms frame budget. Switching to a Map<comboKey, entries[]> would help only
// past ~5,000 hotkeys, which is unrealistic. The array also preserves
// registration order for the rare case where two hotkeys match the same
// combo on different scopes — first-registered wins. Don't replace with a
// Map without confirming a real app actually hits the perf wall.
const entries: HotkeyEntry[] = []
const activeScopes = signal<Set<string>>(new Set(['global']))
let listenerAttached = false
let keydownHandler: ((event: KeyboardEvent) => void) | null = null

// ─── Input detection ─────────────────────────────────────────────────────────

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isInputFocused(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target) return false
  if (INPUT_TAGS.has(target.tagName)) return true
  if (target.isContentEditable) return true
  return false
}

// ─── Global listener ─────────────────────────────────────────────────────────

function attachListener(): void {
  if (listenerAttached) return
  if (typeof window === 'undefined') return
  listenerAttached = true

  keydownHandler = (event) => {
    const scopes = activeScopes.peek()

    for (const entry of entries) {
      // Check scope
      if (!scopes.has(entry.options.scope)) continue

      // Check enabled
      const enabled =
        typeof entry.options.enabled === 'function'
          ? entry.options.enabled()
          : entry.options.enabled
      if (!enabled) continue

      // Check input focus
      if (!entry.options.enableOnInputs && isInputFocused(event)) continue

      // Check key match
      if (!matchesCombo(event, entry.combo)) continue

      // Match found
      if (entry.options.preventDefault) event.preventDefault()
      if (entry.options.stopPropagation) event.stopPropagation()
      entry.handler(event)
    }
  }

  window.addEventListener('keydown', keydownHandler)
}

function detachListener(): void {
  if (!listenerAttached || !keydownHandler) return
  window.removeEventListener('keydown', keydownHandler)
  listenerAttached = false
  keydownHandler = null
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Register a keyboard shortcut. Returns an unregister function.
 *
 * @example
 * ```ts
 * const unregister = registerHotkey('ctrl+s', (e) => save(), { description: 'Save' })
 * // later: unregister()
 * ```
 */
export function registerHotkey(
  shortcut: string,
  handler: (event: KeyboardEvent) => void,
  options?: HotkeyOptions,
): () => void {
  attachListener()

  const entry: HotkeyEntry = {
    shortcut,
    combo: parseShortcut(shortcut),
    handler,
    options: {
      scope: options?.scope ?? 'global',
      preventDefault: options?.preventDefault !== false,
      stopPropagation: options?.stopPropagation === true,
      enableOnInputs: options?.enableOnInputs === true,
      enabled: options?.enabled ?? true,
      ...(options?.description != null ? { description: options.description } : {}),
    },
  }

  entries.push(entry)

  return () => {
    const idx = entries.indexOf(entry)
    if (idx !== -1) entries.splice(idx, 1)

    // Detach listener if no more entries
    if (entries.length === 0) {
      detachListener()
    }
  }
}

// ─── Scope management ────────────────────────────────────────────────────────

/**
 * Activate a hotkey scope. 'global' is always active.
 */
export function enableScope(scope: string): void {
  const current = activeScopes.peek()
  if (current.has(scope)) return
  const next = new Set(current)
  next.add(scope)
  activeScopes.set(next)
}

/**
 * Deactivate a hotkey scope. Cannot deactivate 'global'.
 */
export function disableScope(scope: string): void {
  if (scope === 'global') return
  const current = activeScopes.peek()
  if (!current.has(scope)) return
  const next = new Set(current)
  next.delete(scope)
  activeScopes.set(next)
}

/**
 * Get the currently active scopes as a reactive signal.
 */
export function getActiveScopes(): Signal<Set<string>> {
  return activeScopes
}

/**
 * Get all registered hotkeys (for building help dialogs).
 */
export function getRegisteredHotkeys(): ReadonlyArray<{
  shortcut: string
  scope: string
  description?: string
}> {
  return entries.map((e) => ({
    shortcut: e.shortcut,
    scope: e.options.scope,
    ...(e.options.description != null ? { description: e.options.description } : {}),
  }))
}

// ─── Reset (for testing) ────────────────────────────────────────────────

export function _resetHotkeys(): void {
  entries.length = 0
  activeScopes.set(new Set(['global']))
  detachListener()
}
