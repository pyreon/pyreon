import type { KeyCombo } from "./types";

// ─── Key aliases ─────────────────────────────────────────────────────────────

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  return: "enter",
  del: "delete",
  ins: "insert",
  space: " ",
  spacebar: " ",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  plus: "+",
};

/**
 * Parse a shortcut string like 'ctrl+shift+s' into a KeyCombo.
 * Supports aliases (esc, del, space, etc.) and mod (ctrl on Windows/Linux, meta on Mac).
 */
export function parseShortcut(shortcut: string): KeyCombo {
  const parts = shortcut.toLowerCase().trim().split("+");
  const combo: KeyCombo = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: "",
  };

  for (const part of parts) {
    const p = part.trim();
    if (p === "ctrl" || p === "control") {
      combo.ctrl = true;
    } else if (p === "shift") {
      combo.shift = true;
    } else if (p === "alt") {
      combo.alt = true;
    } else if (p === "meta" || p === "cmd" || p === "command") {
      combo.meta = true;
    } else if (p === "mod") {
      // mod = meta on Mac, ctrl elsewhere
      if (isMac()) {
        combo.meta = true;
      } else {
        combo.ctrl = true;
      }
    } else {
      combo.key = KEY_ALIASES[p] ?? p;
    }
  }

  return combo;
}

/**
 * Check if a KeyboardEvent matches a KeyCombo.
 */
export function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  if (event.ctrlKey !== combo.ctrl) return false;
  if (event.shiftKey !== combo.shift) return false;
  if (event.altKey !== combo.alt) return false;
  if (event.metaKey !== combo.meta) return false;

  const eventKey = event.key.toLowerCase();
  return eventKey === combo.key;
}

/**
 * Format a KeyCombo back to a human-readable string.
 */
export function formatCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push("Ctrl");
  if (combo.shift) parts.push("Shift");
  if (combo.alt) parts.push("Alt");
  if (combo.meta) parts.push(isMac() ? "⌘" : "Meta");
  parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : capitalize(combo.key));
  return parts.join("+");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
}
