import type { AstNode, CallRecognizer, ExtPayload } from '@pyreon/native-compiler/plugin-api'
import { parseHotkeyCombo } from './combo'
type AnyNode = AstNode & { body?: AnyNode; params?: AnyNode[] }
export const recognizeHotkey: CallRecognizer = (_call, ctx) => {
  const shortcutNode = ctx.unwrap(ctx.args[0] as AnyNode | undefined)
  const cb = ctx.args[1] as AnyNode | undefined
  // A module-scope `const` resolves: the shortcut still ends up baked, and
  // naming a shortcut once and reusing it is ordinary.
  const shortcutValue = ctx.staticString(shortcutNode)
  if (shortcutValue === null) {
    // A computed shortcut cannot be baked into a native binding: SwiftUI
    // takes a KeyEquivalent at view-construction and Compose compares
    // against a Key constant. Same literal rule as animation duration.
    ctx.report(
      `Component ${ctx.declName}: useHotkey() needs a statically-known shortcut — an inline string, or a module-scope \`const\` holding one. A computed one cannot be baked into a native key binding, so the hotkey is DROPPED on iOS/Android.`,
    )
  } else if (cb?.type !== 'ArrowFunctionExpression' && cb?.type !== 'FunctionExpression') {
    ctx.report(
      `Component ${ctx.declName}: useHotkey('${shortcutValue}', …) needs an inline handler function; a reference cannot be lowered. The hotkey is DROPPED on iOS/Android.`,
    )
  } else {
    const parsed = parseHotkeyCombo(shortcutValue)
    if (!parsed.ok) {
      ctx.report(
        `Component ${ctx.declName}: useHotkey('${shortcutValue}') — ${parsed.reason}. The hotkey is DROPPED on iOS/Android.`,
      )
    } else {
      // The web handler takes a KeyboardEvent; native has no such object,
      // so a handler that USES its parameter would be silently wrong.
      // Refuse it by name rather than emit a binding that ignores it.
      if ((cb.params as AnyNode[] | undefined)?.length) {
        ctx.report(
          `Component ${ctx.declName}: useHotkey('${shortcutValue}') handler takes a KeyboardEvent parameter, which has no native equivalent — drop the parameter, or keep the event-dependent logic behind a <Web> escape hatch. The hotkey is DROPPED on iOS/Android.`,
        )
      } else {
        const handlerBody =
          cb.body?.type === 'BlockStatement'
            ? ctx.statements(cb.body)
            : [{ kind: 'expr' as const, expr: ctx.expr(cb.body!) }]
        return {
          type: 'hotkey',
          payload: { combo: parsed.combo, body: handlerBody } as unknown as ExtPayload,
        }
      }
    }
  }

  return null
}
