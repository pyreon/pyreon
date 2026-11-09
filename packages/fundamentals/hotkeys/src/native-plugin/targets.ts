import type { HotkeyModifier } from './combo'

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

export { swiftEventModifiers, kotlinModifierPredicate }
