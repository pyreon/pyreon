import type { CompilerPlugin, DeclEmitter, StatementIR } from '@pyreon/native-compiler/plugin-api'
import type { HotkeyComboIR } from './combo'
import { recognizeHotkey } from './recognize'
import {
  swiftKeyEquivalent,
  swiftEventModifiers,
  kotlinKeyConstant,
  kotlinModifierPredicate,
} from './targets'
interface Data {
  combo: HotkeyComboIR
  body: StatementIR[]
}
const hotkeyDecl: DeclEmitter = {
  legacyKind: 'hotkey',
  legacyName: false,
  lifecycleOnly: true,
  swift: () => '',
  kotlin: () => '',
  lifecycle: {
    stableHost: true,
    midOrder: 0,
    swift: (decl, ctx) => {
      const d = decl.payload as unknown as Data
      const keyEq = swiftKeyEquivalent(d.combo.key)
      if (keyEq === null) {
        ctx.warn(
          `useHotkey: '${d.combo.key}' has no SwiftUI KeyEquivalent — the hotkey is DROPPED on iOS. Use a single printable character or one of the named keys that map on both targets (escape / enter / delete / tab / space / arrow{up,down,left,right} / home / end / pageup / pagedown), or handle this shortcut inside a <NativeIOS> / <NativeAndroid> branch.`,
        )
        return []
      }
      return [
        '.background(',
        '  Button("") {',
        ...ctx.statements(d.body, 10).map((line) => `    ${line}`),
        '  }',
        `  .keyboardShortcut(${keyEq}, modifiers: ${swiftEventModifiers(d.combo.modifiers)})`,
        '  .frame(width: 0, height: 0)',
        '  .opacity(0)',
        ')',
      ]
    },
  },
  root: {
    kotlin: (decls, ctx, next) => {
      const usable = decls
        .map((decl) => decl.payload as unknown as Data)
        .filter((d) => {
          if (kotlinKeyConstant(d.combo.key) !== null) return true
          ctx.warn(
            `useHotkey: '${d.combo.key}' has no Compose Key constant — the hotkey is DROPPED on Android. Use a single printable character or one of the named keys that map on both targets (escape / enter / delete / tab / space / arrow{up,down,left,right} / home / end / pageup / pagedown), or handle this shortcut inside a <NativeIOS> / <NativeAndroid> branch.`,
          )
          return false
        })
      if (usable.length === 0) return next(ctx.indent)
      const branches = usable
        .map((d) =>
          [
            `      if (e.key == ${kotlinKeyConstant(d.combo.key)} && ${kotlinModifierPredicate(d.combo.modifiers)}) {`,
            ...ctx.statements(d.body, 8).map((line) => `        ${line}`),
            '        return@onPreviewKeyEvent true',
            '      }',
          ].join('\n'),
        )
        .join('\n')
      return [
        '  val __hkFocus = remember { FocusRequester() }',
        '  LaunchedEffect(Unit) { __hkFocus.requestFocus() }',
        '  Box(',
        '    modifier = Modifier',
        '      .focusRequester(__hkFocus)',
        '      .focusable()',
        '      .onPreviewKeyEvent { e ->',
        '        if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false',
        branches,
        '        false',
        '      }',
        '  ) {',
        next(4),
        '  }',
      ].join('\n')
    },
  },
}
export const hotkeysPlugin: CompilerPlugin = {
  name: '@pyreon/hotkeys',
  apiVersion: 1,
  modules: ['@pyreon/hotkeys'],
  statementCalls: { useHotkey: recognizeHotkey },
  decls: { hotkey: hotkeyDecl },
}
export default hotkeysPlugin
