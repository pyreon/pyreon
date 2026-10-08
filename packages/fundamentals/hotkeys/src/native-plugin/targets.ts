import type { HotkeyModifier } from './combo'
import { swiftStr } from '@pyreon/native-compiler/plugin-api'

function swiftKeyEquivalent(key: string): string | null {
  const named: Readonly<Record<string, string>> = {
    escape: '.escape',
    enter: '.return',
    delete: '.delete',
    tab: '.tab',
    ' ': '.space',
    arrowup: '.upArrow',
    arrowdown: '.downArrow',
    arrowleft: '.leftArrow',
    arrowright: '.rightArrow',
    home: '.home',
    end: '.end',
    pageup: '.pageUp',
    pagedown: '.pageDown',
  }
  const hit = named[key]
  if (hit !== undefined) return hit
  // Single printable character → a KeyEquivalent literal. Anything longer is a
  // named key SwiftUI does not model (e.g. 'f13', 'insert').
  if (key.length !== 1) return null
  return `KeyEquivalent(${swiftStr(key)})`
}

/** `mod` resolves to Command on Apple platforms — the platform half of the IR. */
function swiftEventModifiers(mods: readonly HotkeyModifier[]): string {
  const map: Readonly<Record<HotkeyModifier, string>> = {
    mod: '.command',
    meta: '.command',
    control: '.control',
    shift: '.shift',
    alt: '.option',
  }
  const out: string[] = []
  for (const m of mods) {
    const v = map[m]
    if (!out.includes(v)) out.push(v)
  }
  return `[${out.join(', ')}]`
}
function kotlinKeyConstant(key: string): string | null {
  const named: Readonly<Record<string, string>> = {
    escape: 'Key.Escape',
    enter: 'Key.Enter',
    delete: 'Key.Delete',
    tab: 'Key.Tab',
    ' ': 'Key.Spacebar',
    arrowup: 'Key.DirectionUp',
    arrowdown: 'Key.DirectionDown',
    arrowleft: 'Key.DirectionLeft',
    arrowright: 'Key.DirectionRight',
    // Verified against the real androidx.compose 1.7.5 artifact by compilation,
    // with negative controls (Key.Space and a bogus name both fail to resolve).
    // NOTE `Key.Home` also exists but is the Android HOME BUTTON, not caret
    // navigation — MoveHome/MoveEnd are the text-navigation pair, and there is
    // no `Key.End` at all.
    home: 'Key.MoveHome',
    end: 'Key.MoveEnd',
    pageup: 'Key.PageUp',
    pagedown: 'Key.PageDown',
  }
  const hit = named[key]
  if (hit !== undefined) return hit
  if (key.length === 1) {
    if (key >= 'a' && key <= 'z') return `Key.${key.toUpperCase()}`
    const digits = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
    if (key >= '0' && key <= '9') return `Key.${digits[Number(key)]}`
  }
  return null
}

/**
 * Modifier predicate for a combo. `mod` resolves to Ctrl on Android — the
 * platform half of the IR, mirroring Command on iOS.
 *
 * Modifiers NOT in the combo are asserted ABSENT. Without that, 'ctrl+s' would
 * also fire on 'ctrl+shift+s', so two shortcuts differing only by Shift would
 * both trigger — the kind of bug that looks like a duplicate handler.
 */
function kotlinModifierPredicate(mods: readonly HotkeyModifier[]): string {
  const want = new Set<string>()
  for (const m of mods) {
    if (m === 'mod' || m === 'control' || m === 'meta') want.add('isCtrlPressed')
    else if (m === 'shift') want.add('isShiftPressed')
    else if (m === 'alt') want.add('isAltPressed')
  }
  const all = ['isCtrlPressed', 'isShiftPressed', 'isAltPressed']
  return all.map((f) => (want.has(f) ? `e.${f}` : `!e.${f}`)).join(' && ')
}

export { swiftKeyEquivalent, swiftEventModifiers, kotlinKeyConstant, kotlinModifierPredicate }
