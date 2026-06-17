import type { Signal } from '@pyreon/reactivity'
import { isServer, signal } from '@pyreon/reactivity'
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

// ─── Sequence state ──────────────────────────────────────────────────────────

/**
 * Active sequence-tracking state. When a user presses a key that matches the
 * FIRST combo of one-or-more sequential hotkeys (`'g t'`, `'g n'`, etc.), we
 * remember the matched prefix and wait for the next keystroke. If it matches
 * the next combo in any pending sequence, we keep narrowing. A full match
 * fires the handler; a non-match clears the pending state. The state also
 * times out after `SEQUENCE_TIMEOUT_MS` so a stranded prefix doesn't trap
 * the next single-key shortcut.
 */
interface PendingSequence {
  /** The entry whose remaining keys we're tracking. */
  entry: HotkeyEntry
  /** Index of the NEXT combo we expect to match in `entry.sequence`. */
  next: number
}

const SEQUENCE_TIMEOUT_MS = 1000
let pending: PendingSequence[] = []
let pendingTimer: ReturnType<typeof setTimeout> | null = null

function clearPending(): void {
  pending = []
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
}

function armSequenceTimeout(): void {
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(clearPending, SEQUENCE_TIMEOUT_MS)
}

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
  if (isServer) return
  listenerAttached = true

  keydownHandler = (event) => {
    const scopes = activeScopes.peek()

    // ─── Stage 1: advance any pending sequences ──────────────────────────
    // If we're mid-sequence, the user's next keystroke must match the
    // NEXT combo of at least one pending entry. Non-matches drop that
    // pending entry; a full match (last combo) fires the handler and
    // clears all pending state. If anything advanced, return early so
    // single-key shortcuts (like 't' alone) don't ALSO fire on this
    // keystroke — sequence ownership of the keystroke beats fresh
    // single-combo matches.
    if (pending.length > 0) {
      const surviving: PendingSequence[] = []
      let fired = false
      for (const p of pending) {
        const expected = p.entry.sequence[p.next]
        // Defensive — unreachable. A PendingSequence is only created with a
        // `next` that points at a valid index: stage-1 survivors (L101) use
        // `p.next + 1` strictly below `sequence.length`, and fresh entries
        // (L144) use `next: 0` only when `sequence.length > 0`. So
        // `sequence[next]` is always defined.
        /* v8 ignore next */
        if (!expected) continue
        if (!matchesCombo(event, expected)) continue
        // Advance
        if (p.next + 1 === p.entry.sequence.length) {
          // Full match — fire
          if (p.entry.options.preventDefault) event.preventDefault()
          if (p.entry.options.stopPropagation) event.stopPropagation()
          p.entry.handler(event)
          fired = true
        } else {
          surviving.push({ entry: p.entry, next: p.next + 1 })
        }
      }
      if (fired || surviving.length > 0) {
        pending = surviving
        if (surviving.length > 0) armSequenceTimeout()
        else clearPending()
        return
      }
      // No pending sequence matched — fall through to fresh dispatch
      // but clear the stale pending state.
      clearPending()
    }

    // ─── Stage 2: fresh dispatch ────────────────────────────────────────
    const newPending: PendingSequence[] = []
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

      // Check FIRST combo match
      if (!matchesCombo(event, entry.combo)) continue

      if (entry.sequence.length === 0) {
        // Single-combo hotkey — fire immediately
        if (entry.options.preventDefault) event.preventDefault()
        if (entry.options.stopPropagation) event.stopPropagation()
        entry.handler(event)
      } else {
        // Sequential hotkey — record as pending; consume the keystroke
        // (preventDefault so 'g' doesn't trigger a browser shortcut)
        // but DON'T fire the handler yet.
        if (entry.options.preventDefault) event.preventDefault()
        newPending.push({ entry, next: 0 })
      }
    }

    if (newPending.length > 0) {
      pending = newPending
      armSequenceTimeout()
    }
  }

  window.addEventListener('keydown', keydownHandler)
}

function detachListener(): void {
  if (isServer) return
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

  // Sequential combo support: space-separated combos like `'g t'` are
  // treated as ordered sequences — user presses `g`, then `t` within
  // `SEQUENCE_TIMEOUT_MS`, the handler fires. Each sub-combo is parsed
  // through the existing `parseShortcut` (so `'ctrl+k p'` works: `ctrl+k`
  // followed by `p`). Single-combo shortcuts have `sequence: []` and
  // behave identically to the pre-sequence code path.
  const subShortcuts = shortcut
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (subShortcuts.length === 0) {
    throw new Error(`[@pyreon/hotkeys] empty shortcut: ${JSON.stringify(shortcut)}`)
  }
  const combos = subShortcuts.map(parseShortcut)
  const firstCombo = combos[0]
  // Unreachable given the `subShortcuts.length === 0` throw above (combos is
  // 1:1 with the non-empty subShortcuts), but the index access is typed
  // `T | undefined`, so the guard keeps TS happy.
  /* v8 ignore start */
  if (!firstCombo) {
    throw new Error(`[@pyreon/hotkeys] invalid shortcut: ${JSON.stringify(shortcut)}`)
  }
  /* v8 ignore stop */
  const rest = combos.slice(1)

  const entry: HotkeyEntry = {
    shortcut,
    combo: firstCombo,
    sequence: rest,
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
  clearPending()
  detachListener()
}
