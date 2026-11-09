// Hardware-keyboard bindings, shared by every library whose authoring API is "run this when that key is pressed":
// `useHotkey` (@pyreon/hotkeys) and `useKeyboard` (@pyreon/hooks). A plugin only loads when its package is imported, so
// two packages cannot reach each other's lowering; what they share lives here, in the compiler they both depend on.
//
//   - the key-name -> platform-constant maps (a hotkey and a keyboard binding must agree on what "escape" is);
//   - the event-suppression rule (the browser-only `e.preventDefault()` has nothing to suppress natively);
//   - the lifecycle/root emitters, parameterized only by the label used in warnings and the Compose focus variable.
import type { AstNode, DeclEmitter } from './call-lowering'
import { swiftStr } from './string-literals'
import type { ExtDecl, StatementIR } from './types'

export function swiftKeyEquivalent(key: string): string | null {
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

export function kotlinKeyConstant(key: string): string | null {
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

type AnyNode = AstNode & { body?: AnyNode; params?: AnyNode[] }
/** A `BlockStatement`: unlike a function node, its `body` is the statement LIST. */
type BlockNode = AstNode & { body?: AnyNode[] }
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
export function stripEventSuppression(cb: AnyNode, params: AnyNode[]): AstNode | null {
  const param = params[0] as (AnyNode & { name?: string }) | undefined
  if (params.length !== 1 || param?.type !== 'Identifier' || !param.name) return null
  const name = param.name
  // `AnyNode` types `body` as one node (right for a function), so a block needs
  // the explicit reinterpretation to reach its statement list.
  const body = cb.body as unknown as BlockNode
  // An expression body (`(e) => n.set(1)`) has no statements to strip, so it
  // lowers only when it never mentions the parameter at all.
  if (body.type !== 'BlockStatement') return countRefs(body, name) === 0 ? body : null
  const kept = (body.body ?? []).filter((st) => !isSuppressionStatement(st, name))
  if (countRefs(kept, name) > 0) return null
  return { ...body, body: kept }
}

/** One resolved binding: what the emitters need, independent of which library wrote it. */
export interface KeyBinding {
  /** Lower-case key token (`escape`, `enter`, `a`, ` `, `arrowup`). */
  readonly key: string
  /** SwiftUI `EventModifiers` literal, e.g. `[.command]` or `[]`. */
  readonly swiftModifiers: string
  /** Boolean Kotlin expression over the key event `e` asserting the modifier state. */
  readonly kotlinModifierPredicate: string
  readonly body: StatementIR[]
}

export interface KeyBindingDeclOptions {
  /** The decl kind (the synthesized-name tag). */
  readonly legacyKind: string
  /** The authoring call named in warnings (`useHotkey`, `useKeyboard`). */
  readonly label: string
  /** The Compose focus requester's variable name; distinct per label so two wrappers in one component cannot collide. */
  readonly focusVar: string
  /** Reads the resolved binding off the declaration's payload. */
  readonly read: (decl: ExtDecl) => KeyBinding
}

const NAMED_KEYS =
  'escape / enter / delete / tab / space / arrow{up,down,left,right} / home / end / pageup / pagedown'

/**
 * A key binding as a lifecycle-only declaration. SwiftUI: a zero-size hidden `Button` carrying `.keyboardShortcut`.
 * Compose: one focusable `Box` around the component with an `onPreviewKeyEvent` that matches every binding of this
 * label (so several bindings share one wrapper rather than nesting).
 */
export function keyBindingDecl(options: KeyBindingDeclOptions): DeclEmitter {
  const { legacyKind, label, focusVar, read } = options
  const dropped = (key: string, platform: string, what: string): string =>
    `${label}: '${key}' has no ${what} — the ${label === 'useHotkey' ? 'hotkey' : 'key binding'} is DROPPED on ${platform}. Use a single printable character or one of the named keys that map on both targets (${NAMED_KEYS}), or handle this shortcut inside a <NativeIOS> / <NativeAndroid> branch.`
  return {
    legacyKind,
    legacyName: false,
    lifecycleOnly: true,
    swift: () => '',
    kotlin: () => '',
    lifecycle: {
      stableHost: true,
      midOrder: 0,
      swift: (decl, ctx) => {
        const d = read(decl)
        const keyEq = swiftKeyEquivalent(d.key)
        if (keyEq === null) {
          ctx.warn(dropped(d.key, 'iOS', 'SwiftUI KeyEquivalent'))
          return []
        }
        return [
          '.background(',
          '  Button("") {',
          ...ctx.statements(d.body, 10).map((line) => `    ${line}`),
          '  }',
          `  .keyboardShortcut(${keyEq}, modifiers: ${d.swiftModifiers})`,
          '  .frame(width: 0, height: 0)',
          '  .opacity(0)',
          ')',
        ]
      },
    },
    root: {
      kotlin: (decls, ctx, next) => {
        const usable = decls.map(read).filter((d) => {
          if (kotlinKeyConstant(d.key) !== null) return true
          ctx.warn(dropped(d.key, 'Android', 'Compose Key constant'))
          return false
        })
        if (usable.length === 0) return next(ctx.indent)
        const branches = usable
          .map((d) =>
            [
              `      if (e.key == ${kotlinKeyConstant(d.key)} && ${d.kotlinModifierPredicate}) {`,
              ...ctx.statements(d.body, 8).map((line) => `        ${line}`),
              '        return@onPreviewKeyEvent true',
              '      }',
            ].join('\n'),
          )
          .join('\n')
        return [
          `  val ${focusVar} = remember { FocusRequester() }`,
          `  LaunchedEffect(Unit) { ${focusVar}.requestFocus() }`,
          '  Box(',
          '    modifier = Modifier',
          `      .focusRequester(${focusVar})`,
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
}
