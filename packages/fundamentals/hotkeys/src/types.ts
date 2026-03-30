// ─── Hotkey Types ────────────────────────────────────────────────────────────

/**
 * A parsed key combination.
 * Example: 'ctrl+shift+s' → { ctrl: true, shift: true, alt: false, meta: false, key: 's' }
 */
export interface KeyCombo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

/**
 * Options for registering a hotkey.
 */
export interface HotkeyOptions {
  /** Scope for the hotkey — only active when this scope is active. Default: 'global' */
  scope?: string;
  /** Whether to prevent default browser behavior — default: true */
  preventDefault?: boolean;
  /** Whether to stop event propagation — default: false */
  stopPropagation?: boolean;
  /** Whether the hotkey fires when an input/textarea/contenteditable is focused — default: false */
  enableOnInputs?: boolean;
  /** Description of what this hotkey does — useful for help dialogs */
  description?: string;
  /** Whether the hotkey is enabled — default: true */
  enabled?: boolean | (() => boolean);
}

/**
 * A registered hotkey entry.
 */
export interface HotkeyEntry {
  /** The original shortcut string (e.g. 'ctrl+s') */
  shortcut: string;
  /** Parsed key combination */
  combo: KeyCombo;
  /** The callback to invoke */
  handler: (event: KeyboardEvent) => void;
  /** Options */
  options: Required<
    Pick<
      HotkeyOptions,
      "scope" | "preventDefault" | "stopPropagation" | "enableOnInputs" | "enabled"
    >
  > & { description?: string };
}
