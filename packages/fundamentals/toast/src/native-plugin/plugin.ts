// How `@pyreon/toast` crosses to native. A toast is an imperative call, not a declaration: `toast("x")` (info) or
// a preset `toast.success("x")` / `.error` / `.warning` / `.info` / `.loading` pushes onto the process-global
// `PyreonToast` queue both runtimes ship, and `<Toaster />` renders that queue as a native overlay.
//
// The callee is whatever local name the file imported `toast` as (`import { toast as notify }`), so no registry
// can key it by name: the plugin's `scanModule` records the local names and its `callExprs` recognizer matches a
// call against them. The message is the first argument; in the second-argument options object a literal `duration`
// (ms) sets the auto-dismiss (0 = persistent), a literal `dismissible: false` hides the card's dismiss button, a
// text `description` becomes the card's second line, `action: { label, onClick }` adds an action button (its
// `onClick` may take the `{ id, dismiss }` context), an inline `onDismiss: () => …` runs once when the toast leaves
// (dismissed, expired, cleared or evicted — the web contract), and `toast.dismiss(id)` / `toast.dismiss()` lower.
// `icon` and a JSX description do not lower yet — each is WARNED by name rather than silently dropped. The preset method carries the type. `loading` has no distinct native variant, so it is
// an info toast.

import {
  hasDynamicKey,
  staticPropKey,
  type CallExprRecognizer,
  type CompilerPlugin,
  type ElementLowering,
  type ExprEmitter,
  type ExtExprIR,
  type ModuleScanner,
} from '@pyreon/native-compiler/plugin-api'
import { toastStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

const TOAST_EXPR = 'toast-call'
const TOAST_DISMISS_EXPR = 'toast-dismiss'
export const TOAST_PLUGIN_NAME = '@pyreon/toast'

const NAMES_KEY = '@pyreon/toast:names'
const PRESETS: ReadonlySet<string> = new Set(['success', 'error', 'warning', 'info', 'loading'])
const REAL_UNLOWERED: ReadonlySet<string> = new Set(['update', 'remove', 'promise'])

interface ToastPayload {
  readonly toastType: string
  readonly durationMillis?: number
  /** Only ever `false` — true is the runtime default and is not emitted. */
  readonly dismissible?: false
  /** The description is `args[1]` when present. */
  readonly hasDescription?: true
  /** The action's label and handler follow the description (or the message) in `args`. */
  readonly hasAction?: true
  /** The action handler takes the `{ id, dismiss }` context (→ `onActionContext`). */
  readonly actionContext?: true
  /** The `onDismiss` handler is the LAST of `args`. */
  readonly hasOnDismiss?: true
}

const payloadOf = (e: ExtExprIR): ToastPayload => e.payload as unknown as ToastPayload

/** The local names the file bound the imperative `toast` import to (`import { toast as notify }` → `notify`). */
const toastNames = (source: { fileState<T>(key: string, init: () => T): T }): Set<string> =>
  source.fileState<Set<string>>(NAMES_KEY, () => new Set())

const scanToast: ModuleScanner = (scan) => {
  const names = toastNames(scan)
  for (const node of scan.body as readonly AnyNode[]) {
    if (node.type !== 'ImportDeclaration' || node.source?.value !== '@pyreon/toast') continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type === 'ImportSpecifier' && spec.imported?.name === 'toast') {
        const local = spec.local?.name
        if (typeof local === 'string') names.add(local)
      }
    }
  }
}

const recognizeToast: CallExprRecognizer = (site, ctx) => {
  const names = toastNames(ctx)
  if (names.size === 0) return undefined
  const c = site.callee as AnyNode
  let toastType: string | undefined
  if (c?.type === 'Identifier' && names.has(c.name)) {
    toastType = 'info'
  } else if (
    c?.type === 'MemberExpression' &&
    c.object?.type === 'Identifier' &&
    names.has(c.object.name) &&
    c.property?.type === 'Identifier' &&
    PRESETS.has(c.property.name)
  ) {
    // `loading` has no distinct native variant in v1 → treat as info.
    toastType = c.property.name === 'loading' ? 'info' : c.property.name
  } else if (
    c?.type === 'MemberExpression' &&
    c.object?.type === 'Identifier' &&
    names.has(c.object.name) &&
    c.computed !== true &&
    c.property?.name === 'dismiss'
  ) {
    // `toast.dismiss(id)` → dismiss that toast; `toast.dismiss()` → all of them
    // (the web's no-argument form), which on native is `clear()`.
    const arg = (site.args as readonly AnyNode[])[0]
    return {
      type: TOAST_DISMISS_EXPR,
      payload: arg === undefined ? { all: true } : {},
      args: arg === undefined ? [] : [ctx.expr(arg)],
    }
  } else if (c?.type === 'MemberExpression' && c.object?.type === 'Identifier' && names.has(c.object.name)) {
    // Any OTHER member call on the toast binding would pass through VERBATIM (`toast.bogus("q")` → a Swift/Kotlin
    // call on a name that does not exist), with no warning. Name it: a real-but-unlowered method gets the
    // follow-up hint, anything else is not a toast API.
    const method = c.computed !== true && c.property?.type === 'Identifier' ? (c.property.name as string) : undefined
    return ctx.unsupported(
      site.node,
      method !== undefined ? `\`${c.object.name}.${method}(…)\`` : `a computed \`${c.object.name}[…]\` call`,
      method !== undefined && REAL_UNLOWERED.has(method)
        ? `\`toast.${method}\` has no native lowering yet (only \`toast(msg)\` and the \`success\` / \`error\` / \`warning\` / \`info\` / \`loading\` presets lower) — the call is DROPPED on iOS/Android.`
        : `@pyreon/toast has no such method; the native lowering covers \`toast(msg)\` and the \`success\` / \`error\` / \`warning\` / \`info\` / \`loading\` presets. The call is DROPPED on iOS/Android.`,
    )
  }
  if (toastType === undefined) return undefined

  const argNodes = site.args as readonly AnyNode[]
  const message = argNodes[0] ? ctx.expr(argNodes[0]) : ({ kind: 'literal', value: '' } as const)
  // A literal `duration` (ms) in the options object → auto-dismiss.
  let durationMillis: number | undefined
  let dismissible: false | undefined
  let description: ReturnType<typeof ctx.expr> | undefined
  let action: ReturnType<typeof readAction>
  let onDismiss: ReturnType<typeof ctx.expr> | undefined
  const opts = argNodes[1]
  if (opts?.type === 'ObjectExpression') {
    for (const prop of (opts.properties as AnyNode[] | undefined) ?? []) {
      if (hasDynamicKey(prop)) {
        ctx.warnDynamicKey(prop, 'toast() options')
        continue
      }
      const key = staticPropKey(prop)
      const val = prop.value as AnyNode | undefined
      const isLiteral = val?.type === 'Literal' || val?.type === 'NumericLiteral' || val?.type === 'BooleanLiteral'
      if (key === 'duration') {
        if (isLiteral && typeof val.value === 'number') durationMillis = val.value
        else ctx.report(`toast() \`duration\` must be a literal number of milliseconds to lower natively — the toast uses the default auto-dismiss on iOS/Android.`)
      } else if (key === 'dismissible') {
        if (isLiteral && typeof val.value === 'boolean') {
          if (val.value === false) dismissible = false
        } else {
          ctx.report(`toast() \`dismissible\` must be a literal boolean to lower natively — the toast keeps its dismiss button on iOS/Android.`)
        }
      } else if (key === 'description') {
        if (val?.type === 'JSXElement' || val?.type === 'JSXFragment') {
          ctx.report(`toast() \`description\` given as JSX does not lower natively — only text does; the description is DROPPED on iOS/Android.`)
        } else if (val !== undefined) {
          description = ctx.expr(val)
        }
      } else if (key === 'action') {
        action = readAction(val, ctx, c?.type === 'Identifier' ? (c.name as string) : (c.object.name as string))
      } else if (key === 'onDismiss') {
        onDismiss = readOnDismiss(prop, ctx)
      } else if (key === 'icon') {
        ctx.report(`toast() \`icon\` has no native lowering yet — it is DROPPED on iOS/Android (the toast itself still shows).`)
      }
    }
  }
  return {
    type: TOAST_EXPR,
    payload: {
      toastType,
      ...(durationMillis !== undefined ? { durationMillis } : {}),
      ...(dismissible === false ? { dismissible } : {}),
      ...(description !== undefined ? { hasDescription: true as const } : {}),
      ...(action !== undefined ? { hasAction: true as const } : {}),
      ...(action?.context === true ? { actionContext: true as const } : {}),
      ...(onDismiss !== undefined ? { hasOnDismiss: true as const } : {}),
    },
    args: [
      message,
      ...(description !== undefined ? [description] : []),
      ...(action !== undefined ? [action.label, action.handler] : []),
      ...(onDismiss !== undefined ? [onDismiss] : []),
    ],
  }
}

/**
 * `action: { label, onClick }` → the native action button. Like the web, a tap
 * runs `onClick` and leaves the toast up.
 *
 * `onClick` may take the web's `{ id, dismiss }` context, destructured
 * (`({ dismiss }) => …`) or as one parameter used only through `.id` /
 * `.dismiss` (`(t) => t.dismiss()`). It is rewritten to a two-parameter closure
 * `(id, dismiss) => …` and lowered to the runtime's `onActionContext`, which
 * hands it this toast's id and a dismiss bound to it. A context used any other
 * way — passed on whole, spread, a key other than `id` / `dismiss` — has no
 * native shape and is warned by name.
 */
function readAction(
  val: AnyNode | undefined,
  ctx: Parameters<CallExprRecognizer>[1],
  toastName: string,
): { label: ReturnType<typeof ctx.expr>; handler: ReturnType<typeof ctx.expr>; context: boolean } | undefined {
  const drop = (why: string): undefined => {
    ctx.report(`toast() \`action\` ${why} — the action button is DROPPED on iOS/Android (the toast itself still shows).`)
    return undefined
  }
  if (val?.type !== 'ObjectExpression') return drop('must be an object literal `{ label, onClick }`')
  let label: AnyNode | undefined
  let onClick: AnyNode | undefined
  for (const prop of (val.properties as AnyNode[] | undefined) ?? []) {
    const key = hasDynamicKey(prop) ? undefined : staticPropKey(prop)
    if (key === 'label') label = prop.value
    else if (key === 'onClick') onClick = prop.method === true ? prop : prop.value
  }
  if (label === undefined || label.type === 'JSXElement' || label.type === 'JSXFragment') {
    return drop('needs a text `label`')
  }
  const isFn = onClick?.type === 'ArrowFunctionExpression' || onClick?.type === 'FunctionExpression' || onClick?.type === 'Property'
  if (onClick === undefined || !isFn) return drop('needs an inline `onClick` function')
  const fn = onClick.type === 'Property' ? onClick.value : onClick
  const params = fn?.params as AnyNode[] | undefined
  if ((params?.length ?? 0) === 0) return { label: ctx.expr(label), handler: ctx.expr(fn), context: false }
  const withContext = contextHandler(fn, toastName)
  if (typeof withContext === 'string') return drop(withContext)
  return { label: ctx.expr(label), handler: ctx.expr(withContext), context: true }
}

const CONTEXT_ID = '__pyToastId'

/**
 * `({ id, dismiss }) => body` / `(t) => body` → a ONE-parameter arrow
 * `(id) => body'`, or the reason it can't. In `body'` a `dismiss()` (or
 * `t.dismiss()`) is `toast.dismiss(id)` and `t.id` is `id`, so the body then
 * lowers through the ordinary expression path — `toast.dismiss` included.
 * Only the AST is rewritten.
 */
function contextHandler(fn: AnyNode, toastName: string): AnyNode | string {
  const params = fn.params as AnyNode[]
  if (params.length > 1) return '`onClick` takes one `{ id, dismiss }` context, not several parameters'
  const param = params[0]
  const at = (node: AnyNode, extra: AnyNode): AnyNode => ({ start: node.start, end: node.end, ...extra })
  const ident = (node: AnyNode, name: string): AnyNode => at(node, { type: 'Identifier', name })
  // `<toast>.dismiss(<idName>)`
  const dismissCall = (node: AnyNode, idName: string): AnyNode =>
    at(node, {
      type: 'CallExpression',
      optional: false,
      arguments: [ident(node, idName)],
      callee: at(node, {
        type: 'MemberExpression',
        computed: false,
        optional: false,
        object: ident(node, toastName),
        property: ident(node, 'dismiss'),
      }),
    })

  // `isDismiss(callee)` / `isId(node)` say which nodes are the context's members;
  // any other reference to a context name leaks it, which has no native value.
  const rewriteBody = (
    body: AnyNode,
    idName: string,
    isDismiss: (callee: AnyNode) => boolean,
    isId: (node: AnyNode) => boolean,
    names: ReadonlySet<string>,
  ): AnyNode | string => {
    let leaked: string | undefined
    const walk = (node: AnyNode): AnyNode => {
      if (node === null || typeof node !== 'object') return node
      if (Array.isArray(node)) return node.map(walk)
      if (node.type === 'CallExpression' && isDismiss(node.callee)) {
        if (((node.arguments as AnyNode[]) ?? []).length > 0) leaked = 'dismiss'
        return dismissCall(node, idName)
      }
      if (isId(node)) return ident(node, idName)
      if (node.type === 'Identifier' && names.has(node.name as string)) leaked = node.name as string
      const out: AnyNode = {}
      for (const [k, v] of Object.entries(node)) out[k] = k === 'parent' ? v : walk(v)
      return out
    }
    const rewritten = walk(body)
    if (leaked !== undefined) {
      return `\`onClick\` uses its context's \`${leaked}\` other than as a no-argument \`dismiss()\` call or an \`id\` read — only those lower natively`
    }
    return rewritten
  }
  const arrow = (idName: string, body: AnyNode): AnyNode => ({
    ...fn,
    type: 'ArrowFunctionExpression',
    params: [ident(fn, idName)],
    body,
    expression: body?.type !== 'BlockStatement',
  })

  if (param?.type === 'ObjectPattern') {
    let idName: string | undefined
    let dismissName: string | undefined
    for (const p of (param.properties as AnyNode[]) ?? []) {
      const key = p.type === 'RestElement' ? undefined : staticPropKey(p)
      const local = p.value?.type === 'Identifier' ? (p.value.name as string) : undefined
      if (local === undefined || (key !== 'id' && key !== 'dismiss')) {
        return '`onClick`\'s context pattern may only take `id` and `dismiss` by name — anything else has no native value'
      }
      if (key === 'id') idName = local
      else dismissName = local
    }
    const resolvedId = idName ?? CONTEXT_ID
    const body = rewriteBody(
      fn.body,
      resolvedId,
      (callee) => dismissName !== undefined && callee?.type === 'Identifier' && callee.name === dismissName,
      () => false,
      new Set(dismissName !== undefined ? [dismissName] : []),
    )
    return typeof body === 'string' ? body : arrow(resolvedId, body)
  }
  if (param?.type === 'Identifier') {
    const name = param.name as string
    const member = (node: AnyNode, prop: string): boolean =>
      node?.type === 'MemberExpression' &&
      node.computed !== true &&
      node.object?.type === 'Identifier' &&
      node.object.name === name &&
      node.property?.name === prop
    const body = rewriteBody(
      fn.body,
      CONTEXT_ID,
      (callee) => member(callee, 'dismiss'),
      (node) => member(node, 'id'),
      new Set([name]),
    )
    return typeof body === 'string' ? body : arrow(CONTEXT_ID, body)
  }
  return '`onClick`\'s parameter must be the `{ id, dismiss }` context, destructured or as one name'
}

/**
 * `onDismiss` → a native closure the runtime fires once when the toast leaves
 * the queue by any path. The web type is `() => void`, so the handler must be an
 * inline function with no parameters; anything else is warned by name and the
 * callback is dropped (the toast still shows).
 */
function readOnDismiss(prop: AnyNode, ctx: Parameters<CallExprRecognizer>[1]): ReturnType<typeof ctx.expr> | undefined {
  const fn = prop.method === true ? prop.value : (prop.value as AnyNode | undefined)
  const isFn = fn?.type === 'ArrowFunctionExpression' || fn?.type === 'FunctionExpression'
  if (!isFn || ((fn.params as AnyNode[] | undefined)?.length ?? 0) > 0) {
    ctx.report(
      `toast() \`onDismiss\` must be an inline function with no parameters (\`onDismiss: () => …\`) to lower natively — the callback is DROPPED on iOS/Android (the toast itself still shows).`,
    )
    return undefined
  }
  return ctx.expr(fn)
}

const toastExpr: ExprEmitter = {
  // `toast("x")` → `PyreonToast.shared.add("x", type: "…")`; a literal duration (ms) is converted to seconds.
  swift(e, ctx) {
    const { toastType, durationMillis, dismissible, hasDescription, hasAction, actionContext, hasOnDismiss } = payloadOf(e)
    const duration = durationMillis !== undefined ? `, duration: ${durationMillis / 1000}` : ''
    const closeButton = dismissible === false ? ', dismissible: false' : ''
    const detail = hasDescription === true ? `, description: ${ctx.expr(e.args[1]!)}` : ''
    const at = hasDescription === true ? 2 : 1
    const act =
      hasAction === true
        ? `, actionLabel: ${ctx.expr(e.args[at]!)}, ${actionContext === true ? `onActionContext: ${swiftContextClosure(e.args[at + 1]!, ctx)}` : `onAction: ${ctx.action(e.args[at + 1]!, 0)}`}`
        : ''
    const gone = hasOnDismiss === true ? `, onDismiss: ${ctx.action(e.args[e.args.length - 1]!, 0)}` : ''
    return `PyreonToast.shared.add(${ctx.expr(e.args[0]!)}, type: ${ctx.stringLiteral(toastType)}${duration}${closeButton}${detail}${act}${gone})`
  },
  // → `PyreonToast.add("x", "…")`; a literal duration is a `Long` of milliseconds.
  kotlin(e, ctx) {
    const { toastType, durationMillis, dismissible, hasDescription, hasAction, actionContext, hasOnDismiss } = payloadOf(e)
    const duration = durationMillis !== undefined ? `, ${durationMillis}L` : ''
    const closeButton = dismissible === false ? ', dismissible = false' : ''
    const detail = hasDescription === true ? `, description = ${ctx.expr(e.args[1]!)}` : ''
    const at = hasDescription === true ? 2 : 1
    const act =
      hasAction === true
        ? `, actionLabel = ${ctx.expr(e.args[at]!)}, ${actionContext === true ? 'onActionContext' : 'onAction'} = ${ctx.action(e.args[at + 1]!, 0)}`
        : ''
    const gone = hasOnDismiss === true ? `, onDismiss = ${ctx.action(e.args[e.args.length - 1]!, 0)}` : ''
    return `PyreonToast.add(${ctx.expr(e.args[0]!)}, ${ctx.stringLiteral(toastType)}${duration}${closeButton}${detail}${act}${gone})`
  },
  // The node was a closed `toast-call` compiler kind before it moved here; the struct names the compiler derives
  // from an expression's shape hash it under that name, so emitted names did not move.
  legacyHash: (e) => ({ kind: TOAST_EXPR, message: e.args[0], ...payloadOf(e) }),
}

/**
 * The Swift action emit ignores an arrow's parameters (an action slot is
 * `() -> Void`), so the context handler's one parameter is spliced in as the
 * closure's argument list — the same move `<Press onLongPress>` makes for its
 * `(Bool) -> Void` slot.
 */
function swiftContextClosure(handler: ExtExprIR['args'][number], ctx: Parameters<ExprEmitter['swift']>[1]): string {
  const param = handler.kind === 'arrow' ? handler.params[0] : undefined
  return ctx.action(handler, 0).replace(/^\{/, `{ ${param ?? '_'} in`)
}

/** `toast.dismiss(id)` → dismiss one toast; `toast.dismiss()` → clear them all. */
const toastDismissExpr: ExprEmitter = {
  swift: (e, ctx) =>
    (e.payload as { all?: true }).all === true
      ? 'PyreonToast.shared.clear()'
      : `PyreonToast.shared.dismiss(${ctx.expr(e.args[0]!)})`,
  kotlin: (e, ctx) =>
    (e.payload as { all?: true }).all === true
      ? 'PyreonToast.clear()'
      : `PyreonToast.dismiss(${ctx.expr(e.args[0]!)})`,
}

/** The web `ToastPosition` values, the only ones the native toaster understands. */
const TOAST_POSITIONS: ReadonlySet<string> = new Set([
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
])

/** `<Toaster>`'s props, as literal values. Absent props keep the runtime default. */
interface ToasterArgs {
  position?: string
  max?: number
  gap?: number
  offset?: number
  duration?: number
}

/** The element a lowering receives (not exported by the plugin API by name). */
type JsxElementIR = Parameters<NonNullable<NonNullable<ElementLowering['emit']>['swift']>>[0]

type StaticReader = {
  staticAttr(el: JsxElementIR, name: string): string | number | boolean | undefined
  warn(message: string): void
}

/**
 * Read `<Toaster>`'s props. Each must be a literal (or a const resolving to one):
 * the overlay is configured once, so a dynamic or invalid value is warned BY NAME
 * and that prop keeps its default, rather than vanishing silently.
 */
function toasterArgs(el: JsxElementIR, ctx: StaticReader): ToasterArgs {
  const out: ToasterArgs = {}
  const present = new Set(
    el.attrs.flatMap((a) => (a.kind === 'attr' ? [a.name] : [])),
  )
  const bad = (name: string, why: string): void =>
    ctx.warn(`[pyreon-native] <Toaster ${name}> ${why} — the native toaster keeps its default ${name}.`)
  if (present.has('position')) {
    const v = ctx.staticAttr(el, 'position')
    if (typeof v === 'string' && TOAST_POSITIONS.has(v)) out.position = v
    else bad('position', v === undefined ? 'is not a literal' : `must be one of ${[...TOAST_POSITIONS].join(' / ')}`)
  }
  for (const name of ['max', 'gap', 'offset', 'duration'] as const) {
    if (!present.has(name)) continue
    const v = ctx.staticAttr(el, name)
    if (typeof v !== 'number') {
      bad(name, 'is not a literal number')
      continue
    }
    const integral = name === 'max' || name === 'duration'
    // The web treats a non-finite or negative duration as persistent (0).
    if (name === 'duration' && (!Number.isFinite(v) || v < 0)) {
      out.duration = 0
      continue
    }
    if (!Number.isFinite(v) || v < 0 || (integral && !Number.isInteger(v))) {
      bad(name, integral ? 'must be a non-negative integer' : 'must be a non-negative number')
      continue
    }
    out[name] = v
  }
  for (const a of el.attrs) {
    if (a.kind !== 'attr') ctx.warn('[pyreon-native] a spread on <Toaster> is not lowered — only literal position / max / gap / offset / duration props configure the native toaster.')
  }
  return out
}

/** A Kotlin `Double` literal (`8` would be an `Int` and fail to typecheck). */
const kotlinDouble = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n))

/**
 * `<Toaster />` → the runtime's screen-anchored overlay. On the web the Toaster
 * is a `position: fixed` portal: no layout space, a screen corner, stays put
 * across navigation. It used to lower to an inline `VStack` / `Column` of
 * `Text`s, which pushed the layout, sat wherever the tag was written, and on
 * iOS vanished on every pushed screen (the tag sits in the NavigationStack's
 * root). `PyreonToaster` is an overlay window on iOS and a window-anchored
 * `Popup` on Android, styled after the web stylesheet. Arguments keep the
 * runtime's parameter order, which Swift's labelled arguments require.
 */
const toasterElements: readonly ElementLowering[] = [
  {
    module: '@pyreon/toast',
    tags: ['Toaster'],
    emit: {
      swift(el, ctx) {
        const a = toasterArgs(el, ctx)
        const args: string[] = []
        if (a.position !== undefined) args.push(`position: ${ctx.stringLiteral(a.position)}`)
        if (a.max !== undefined) args.push(`max: ${a.max}`)
        if (a.gap !== undefined) args.push(`gap: ${a.gap}`)
        if (a.offset !== undefined) args.push(`offset: ${a.offset}`)
        if (a.duration !== undefined) args.push(`duration: ${a.duration}`)
        return `PyreonToaster(${args.join(', ')})`
      },
      kotlin(el, ctx) {
        const a = toasterArgs(el, ctx)
        const args: string[] = []
        if (a.position !== undefined) args.push(`position = ${ctx.stringLiteral(a.position)}`)
        if (a.max !== undefined) args.push(`max = ${a.max}L`)
        if (a.gap !== undefined) args.push(`gap = ${kotlinDouble(a.gap)}`)
        if (a.offset !== undefined) args.push(`offset = ${kotlinDouble(a.offset)}`)
        if (a.duration !== undefined) args.push(`duration = ${a.duration}L`)
        return `PyreonToaster(${args.join(', ')})`
      },
    },
  },
]

/**
 * The `@pyreon/toast` native plugin. Shipped by `@pyreon/toast` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const toastPlugin: CompilerPlugin = {
  name: TOAST_PLUGIN_NAME,
  apiVersion: 2,
  modules: ['@pyreon/toast'],
  scanModule: scanToast,
  callExprs: recognizeToast,
  exprs: { [TOAST_EXPR]: toastExpr, [TOAST_DISMISS_EXPR]: toastDismissExpr },
  elements: toasterElements,
  stubs: toastStubs,
}
