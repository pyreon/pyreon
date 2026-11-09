import {
  keyBindingDecl,
  type CompilerPlugin,
  type StatementIR,
} from '@pyreon/native-compiler/plugin-api'
import type { HotkeyComboIR } from './combo'
import { recognizeHotkey } from './recognize'
import { swiftEventModifiers, kotlinModifierPredicate } from './targets'
interface Data {
  combo: HotkeyComboIR
  body: StatementIR[]
}
// The key-name maps and the SwiftUI/Compose emit are shared with `useKeyboard` (@pyreon/hooks) through the compiler;
// only the combo -> modifier mapping is hotkey-specific.
const hotkeyDecl = keyBindingDecl({
  legacyKind: 'hotkey',
  label: 'useHotkey',
  noun: 'hotkey',
  focusVar: '__hkFocus',
  read: (decl) => {
    const d = decl.payload as unknown as Data
    return {
      key: d.combo.key,
      swiftModifiers: swiftEventModifiers(d.combo.modifiers),
      kotlinModifierPredicate: kotlinModifierPredicate(d.combo.modifiers),
      body: d.body,
    }
  },
})
export const hotkeysPlugin: CompilerPlugin = {
  name: '@pyreon/hotkeys',
  apiVersion: 2,
  modules: ['@pyreon/hotkeys'],
  statementCalls: { useHotkey: recognizeHotkey },
  decls: { hotkey: hotkeyDecl },
}
export default hotkeysPlugin
