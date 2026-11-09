import {
  keyBindingDecl,
  stripEventSuppression,
  type AstNode,
  type CallRecognizer,
  type ExtPayload,
  type StatementIR,
} from '@pyreon/native-compiler/plugin-api'

/**
 * `useKeyboard(key, handler, options?)` — a hardware-keyboard binding. It lowers to exactly what `useHotkey` does
 * (SwiftUI `.keyboardShortcut`, a Compose `onPreviewKeyEvent` root); the key maps and the emit are shared through the
 * compiler (`keyBindingDecl`), so the two hooks cannot disagree about what "escape" is.
 *
 * Differences from the web hook, each of which is a named warning or a documented rule rather than a silent gap:
 *  - the web `key` is a `KeyboardEvent.key` (`'Escape'`, `'ArrowUp'`, `'a'`); it is lower-cased onto the shared key
 *    tokens. A single UPPERCASE letter means Shift+letter on the web, which would silently become plain `a` here, so
 *    it is refused (`useHotkey('shift+a', …)` states it);
 *  - `event: 'keyup'` and `target` have no native meaning (a shortcut fires on key-down, app-wide) and are refused;
 *  - the web handler fires whatever modifiers are held; a native shortcut fires when the key is pressed with NO
 *    modifier (SwiftUI matches modifiers exactly, and Compose asserts them absent so both targets agree);
 *  - `ignoreInputs` is accepted: a focused native text field consumes its own keys before a shortcut sees them.
 */
type AnyNode = AstNode & { body?: AnyNode; params?: AnyNode[]; properties?: AnyNode[] }

interface KeyboardData {
  key: string
  body: StatementIR[]
}

const NO_MODIFIERS = '!e.isCtrlPressed && !e.isShiftPressed && !e.isAltPressed'

export const keyboardDecl = keyBindingDecl({
  legacyKind: 'keyboard',
  label: 'useKeyboard',
  noun: 'key binding',
  focusVar: '__kbFocus',
  read: (decl) => {
    const d = decl.payload as unknown as KeyboardData
    return { key: d.key, swiftModifiers: '[]', kotlinModifierPredicate: NO_MODIFIERS, body: d.body }
  },
})

const OPTION_KEYS = new Set(['event', 'target', 'ignoreInputs'])

export const recognizeKeyboard: CallRecognizer = (_call, ctx) => {
  const where = `Component ${ctx.declName}: useKeyboard()`
  const keyValue = ctx.staticString(ctx.unwrap(ctx.args[0] as AnyNode | undefined))
  if (keyValue === null) {
    ctx.report(
      `${where} needs a statically-known key — an inline string, or a module-scope const holding one. A computed one cannot be baked into a native binding, so it was DROPPED and will not run on device.`,
    )
    return null
  }
  const handler = ctx.args[1] as AnyNode | undefined
  if (handler?.type !== 'ArrowFunctionExpression' && handler?.type !== 'FunctionExpression') {
    ctx.report(
      `${where} ('${keyValue}') needs an inline handler function; a reference cannot be lowered, so it was DROPPED on iOS/Android.`,
    )
    return null
  }
  if (keyValue.length === 1 && keyValue !== keyValue.toLowerCase()) {
    ctx.report(
      `${where} ('${keyValue}') — an uppercase letter is Shift+${keyValue.toLowerCase()} on the web, which a native binding would silently turn into a plain '${keyValue.toLowerCase()}'. It was DROPPED; write useHotkey('shift+${keyValue.toLowerCase()}', …) to state it.`,
    )
    return null
  }
  const optionsNode = ctx.unwrap(ctx.args[2] as AnyNode | undefined) as AnyNode | undefined
  if (optionsNode !== undefined) {
    if (optionsNode.type !== 'ObjectExpression') {
      ctx.report(`${where} ('${keyValue}') needs its options as an object literal to lower, so it was DROPPED.`)
      return null
    }
    for (const prop of (optionsNode.properties as AnyNode[] | undefined) ?? []) {
      const name = prop.type === 'Property' || prop.type === 'ObjectProperty' ? ctx.propKey(prop) : undefined
      if (name === undefined || name === null || !OPTION_KEYS.has(name)) {
        ctx.report(`${where} ('${keyValue}') has an option that is not event, target or ignoreInputs, so it was DROPPED.`)
        return null
      }
      if (name === 'target') {
        ctx.report(
          `${where} ('${keyValue}') — the \`target\` option has no native meaning (a native shortcut is app-wide), so it was DROPPED on iOS/Android.`,
        )
        return null
      }
      if (name === 'event') {
        const value = ctx.staticString(ctx.unwrap(prop.value as AnyNode | undefined))
        if (value !== 'keydown') {
          ctx.report(
            `${where} ('${keyValue}') — only event: 'keydown' lowers (a native shortcut fires on key-down, there is no key-up binding), so it was DROPPED on iOS/Android.`,
          )
          return null
        }
      }
    }
  }
  const params = (handler.params as AnyNode[] | undefined) ?? []
  const stripped = params.length === 0 ? handler.body : stripEventSuppression(handler, params)
  if (stripped === null || stripped === undefined) {
    ctx.report(
      `${where} ('${keyValue}') handler takes a KeyboardEvent parameter, which has no native equivalent — drop the parameter, or keep the event only for e.preventDefault() / e.stopPropagation() (a no-op natively). It was DROPPED on iOS/Android.`,
    )
    return null
  }
  const body =
    stripped.type === 'BlockStatement'
      ? ctx.statements(stripped)
      : [{ kind: 'expr' as const, expr: ctx.expr(stripped) }]
  return {
    type: 'keyboard',
    payload: { key: keyValue.toLowerCase(), body } as unknown as ExtPayload,
  }
}
