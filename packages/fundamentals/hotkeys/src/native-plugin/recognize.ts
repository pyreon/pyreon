import type { AstNode, CallRecognizer, ExtPayload } from '@pyreon/native-compiler/plugin-api'
import { parseHotkeyCombo } from './combo'
type AnyNode = AstNode & { body?: AnyNode; params?: AnyNode[] }
const SUPPRESSIONS = new Set(['preventDefault', 'stopPropagation'])

/** `<name>.preventDefault()` / `<name>.stopPropagation()` as an expression statement. */
function isSuppressionStatement(node: AnyNode, name: string): boolean {
  if (node.type !== 'ExpressionStatement') return false
  const call = (node as AnyNode & { expression?: AnyNode }).expression as
    | (AnyNode & { callee?: AnyNode; arguments?: AnyNode[] })
    | undefined
  const callee = call?.callee as (AnyNode & { object?: AnyNode; property?: AnyNode; computed?: boolean }) | undefined
  return (
    call?.type === 'CallExpression' &&
    (call.arguments?.length ?? 0) === 0 &&
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    (callee.object as (AnyNode & { name?: string }) | undefined)?.name === name &&
    SUPPRESSIONS.has(((callee.property as AnyNode & { name?: string }) ?? {}).name ?? '')
  )
}

/** Every Identifier named `name` in the subtree (the property side of a member is not a reference). */
function countRefs(node: unknown, name: string): number {
  if (Array.isArray(node)) return node.reduce((n: number, c) => n + countRefs(c, name), 0)
  if (node === null || typeof node !== 'object') return 0
  const n = node as AnyNode & { name?: string; computed?: boolean; property?: unknown }
  let total = n.type === 'Identifier' && n.name === name ? 1 : 0
  for (const [k, v] of Object.entries(n)) {
    if (k === 'property' && n.type === 'MemberExpression' && !n.computed) continue
    total += countRefs(v, name)
  }
  return total
}

/**
 * The handler body with its event-suppression statements removed, or `null`
 * when the event parameter is used for anything else (or is not a plain
 * identifier). Counting references after removal is what makes this total:
 * ANY other read of the parameter — `e.key`, passing it on, a nested closure —
 * leaves a reference behind and refuses.
 */
function stripEventSuppression(cb: AnyNode, params: AnyNode[]): AnyNode | null {
  const param = params[0] as (AnyNode & { name?: string }) | undefined
  if (params.length !== 1 || param?.type !== 'Identifier' || !param.name) return null
  const name = param.name
  const body = cb.body as AnyNode & { body?: AnyNode[] }
  // An expression body (`(e) => n.set(1)`) has no statements to strip, so it
  // lowers only when it never mentions the parameter at all.
  if (body.type !== 'BlockStatement') return countRefs(body, name) === 0 ? body : null
  const kept = (body.body ?? []).filter((st) => !isSuppressionStatement(st, name))
  if (countRefs(kept, name) > 0) return null
  return { ...body, body: kept } as AnyNode
}

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
