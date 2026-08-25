/**
 * Build-time parser for a `useHotkey('mod+s', …)` shortcut string.
 *
 * Deliberately NOT reusing `@pyreon/hotkeys`' `parseShortcut`: that one resolves
 * `mod` at RUNTIME via `isMac()`, which a compiler cannot do — the target is
 * known at build time, and `mod` means Command on iOS and Ctrl on Android. So
 * `mod` stays symbolic here and each emitter resolves it.
 *
 * The vocabulary otherwise mirrors the web parser exactly (`ctrl`/`control`,
 * `shift`, `alt`, `meta`/`cmd`/`command`, `mod`, plus its alias table), because
 * a shortcut that works on web and silently does nothing on device would be a
 * worse outcome than one that fails to compile.
 */

/** Alias table copied from `@pyreon/hotkeys`' parse.ts — keep in step with it. */
const KEY_ALIASES: Readonly<Record<string, string>> = {
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
  comma: ',',
}

import type { HotkeyComboIR, HotkeyModifier } from './types'

const ORDER: readonly HotkeyModifier[] = ['mod', 'meta', 'control', 'alt', 'shift']

/**
 * Parse a shortcut string, or return a REASON it cannot be lowered.
 *
 * A reason rather than a bare null: every caller here turns it into a named
 * warning, and "unsupported" with no cause is the failure mode this whole area
 * has been fixing all day.
 */
export function parseHotkeyCombo(
  shortcut: string,
): { ok: true; combo: HotkeyComboIR } | { ok: false; reason: string } {
  if (shortcut.includes(',')) {
    // `@pyreon/hotkeys` accepts a comma-separated LIST ('ctrl+s, mod+p'). One
    // native binding cannot carry two combos, and silently taking the first
    // would drop a shortcut the user registered.
    return {
      ok: false,
      reason: `a comma-separated shortcut LIST is not supported natively — register one useHotkey() per combo (use the \`comma\` alias for a literal comma key)`,
    }
  }
  const mods: HotkeyModifier[] = []
  let key = ''
  for (const raw of shortcut.toLowerCase().trim().split('+')) {
    const p = raw.trim()
    if (p === '') continue
    if (p === 'ctrl' || p === 'control') pushMod(mods, 'control')
    else if (p === 'shift') pushMod(mods, 'shift')
    else if (p === 'alt') pushMod(mods, 'alt')
    else if (p === 'meta' || p === 'cmd' || p === 'command') pushMod(mods, 'meta')
    else if (p === 'mod') pushMod(mods, 'mod')
    else {
      if (key !== '') {
        return { ok: false, reason: `two base keys ('${key}' and '${p}') — a combo takes one` }
      }
      key = KEY_ALIASES[p] ?? p
    }
  }
  if (key === '') return { ok: false, reason: `no base key — a bare modifier cannot be a shortcut` }
  mods.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  return { ok: true, combo: { key, modifiers: mods } }
}

function pushMod(mods: HotkeyModifier[], m: HotkeyModifier): void {
  if (!mods.includes(m)) mods.push(m)
}
