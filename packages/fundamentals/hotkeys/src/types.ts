// ─── Hotkey Types ────────────────────────────────────────────────────────────

/**
 * A parsed key combination.
 * Example: 'ctrl+shift+s' → { ctrl: true, shift: true, alt: false, meta: false, key: 's' }
 */
export interface KeyCombo {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  key: string
}

/** The focusable editable-element kinds `enableOnInputs` can allow selectively. */
export type InputKind = 'input' | 'textarea' | 'select' | 'contenteditable'

/**
 * Options for registering a hotkey.
 */
export interface HotkeyOptions {
  /** Scope for the hotkey — only active when this scope is active. Default: 'global' */
  scope?: string
  /** Whether to prevent default browser behavior — default: true */
  preventDefault?: boolean
  /** Whether to stop event propagation — default: false */
  stopPropagation?: boolean
  /**
   * Whether the hotkey fires when an input/textarea/select/contenteditable is
   * focused. `false` (default) suppresses in all of them; `true` allows all;
   * an ARRAY allows selectively (e.g. `['input']` fires in text inputs but
   * not in textareas/selects/contenteditables).
   */
  enableOnInputs?: boolean | ReadonlyArray<InputKind>
  /** Description of what this hotkey does — useful for help dialogs */
  description?: string
  /** Whether the hotkey is enabled — default: true */
  enabled?: boolean | (() => boolean)
  /**
   * Which keyboard event fires the hotkey — default `'keydown'`. `'keyup'`
   * is useful for push-to-talk-style interactions (act on release).
   * Sequential shortcuts (`'g t'`) are keydown-only and reject `'keyup'`
   * at registration with a clear error.
   */
  event?: 'keydown' | 'keyup'
  /**
   * Skip auto-repeated events (`event.repeat`) while a combo is held —
   * default `false`. Turn on for one-shot actions (save, toggle) so holding
   * the combo doesn't machine-gun the handler.
   */
  ignoreRepeat?: boolean
  /** Fire at most once, then auto-unregister — default `false`. */
  once?: boolean
  /**
   * Listen on a specific element instead of `window` — element-scoped
   * shortcuts fire only while the event REACHES that element (i.e. focus is
   * inside it). The registry attaches ONE shared listener per
   * (target, event-type) and removes it when the last hotkey for that target
   * unregisters. Default: `window`.
   */
  target?: EventTarget
}

/**
 * A registered hotkey entry.
 */
export interface HotkeyEntry {
  /** The original shortcut string (e.g. 'ctrl+s') */
  shortcut: string
  /**
   * Parsed key combination — for SEQUENTIAL combos (`'g t'`) this is the
   * FIRST combo in the sequence; `sequence` carries the remaining combos.
   * Non-sequential combos have empty `sequence`.
   */
  combo: KeyCombo
  /**
   * Remaining combos for sequential shortcuts (`'g t'` → [{ key: 't' }]).
   * Empty for single-combo hotkeys. Each subsequent keystroke must match
   * `sequence[0]`, then `sequence[1]`, etc., within `SEQUENCE_TIMEOUT_MS`.
   * Defaults to empty.
   */
  sequence: KeyCombo[]
  /** The callback to invoke */
  handler: (event: KeyboardEvent) => void
  /** Options */
  options: Required<
    Pick<
      HotkeyOptions,
      | 'scope'
      | 'preventDefault'
      | 'stopPropagation'
      | 'enableOnInputs'
      | 'enabled'
      | 'event'
      | 'ignoreRepeat'
      | 'once'
    >
  > & { description?: string }
}
