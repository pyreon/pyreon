import {
  stripEventSuppression,
  type AstNode,
  type CallRecognizer,
  type ExtPayload,
} from '@pyreon/native-compiler/plugin-api'
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
      // The web handler takes a KeyboardEvent; native has no such object, so
      // a handler that READS its parameter would be silently wrong and is
      // refused by name. The one idiom that is safe to lower is suppressing
      // the BROWSER default (`e.preventDefault()` / `e.stopPropagation()`,
      // which every `mod+s` handler writes): there is no browser default to
      // suppress on a native key binding, so those statements are no-ops
      // there and are dropped. Anything else touching the parameter refuses.
      const params = (cb.params as AnyNode[] | undefined) ?? []
      const stripped = params.length === 0 ? cb.body : stripEventSuppression(cb, params)
      if (stripped === null) {
        ctx.report(
          `Component ${ctx.declName}: useHotkey('${shortcutValue}') handler takes a KeyboardEvent parameter, which has no native equivalent — drop the parameter, or keep the event-dependent logic behind a <Web> escape hatch. (Only \`e.preventDefault()\` / \`e.stopPropagation()\` are lowered, as no-ops.) The hotkey is DROPPED on iOS/Android.`,
        )
      } else {
        const handlerBody =
          stripped?.type === 'BlockStatement'
            ? ctx.statements(stripped)
            : [{ kind: 'expr' as const, expr: ctx.expr(stripped!) }]
        return {
          type: 'hotkey',
          payload: { combo: parsed.combo, body: handlerBody } as unknown as ExtPayload,
        }
      }
    }
  }

  return null
}
