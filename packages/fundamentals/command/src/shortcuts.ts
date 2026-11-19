import { formatCombo, parseShortcut } from '@pyreon/hotkeys'

/** The key presses of one shortcut: `'g d'` is two (a sequence), `'mod+k'` one. */
function presses(shortcut: string): string[] {
  return shortcut.split(/\s+/u).filter(Boolean)
}

/**
 * A shortcut as the user reads it, for the current platform: `'mod+k'` is "⌘+K" on macOS and "Ctrl+K" elsewhere
 * (`@pyreon/hotkeys` `formatCombo`); a sequence keeps its spaces ("G D"). Throws like `parseShortcut` for an invalid one.
 */
export function formatShortcut(shortcut: string): string {
  return presses(shortcut)
    .map((press) => formatCombo(parseShortcut(press)))
    .join(' ')
}

/** The keys of each press, for rendering them as separate keycaps: `'mod+shift+k'` is `[['Ctrl', 'Shift', 'K']]`. */
export function shortcutKeys(shortcut: string): readonly (readonly string[])[] {
  return presses(shortcut).map((press) => formatCombo(parseShortcut(press)).split(/\+(?=.)/u))
}

/**
 * Whether the shortcut includes a modifier a typed character cannot produce (Ctrl, Alt or Meta; Shift alone does not
 * count). Such a shortcut may fire while a text field has focus, a bare key may not: this is the rule commands follow.
 */
export function hasCommandModifier(shortcut: string): boolean {
  return presses(shortcut).some((press) => {
    const combo = parseShortcut(press)
    return combo.ctrl || combo.alt || combo.meta
  })
}
