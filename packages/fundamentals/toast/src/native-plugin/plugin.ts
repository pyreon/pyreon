// How `@pyreon/toast` crosses to native. A toast is an imperative call, not a declaration: `toast("x")` (info) or
// a preset `toast.success("x")` / `.error` / `.warning` / `.info` / `.loading` pushes onto the process-global
// `PyreonToast` queue both runtimes ship, and `<Toaster />` renders that queue as a native overlay.
//
// The callee is whatever local name the file imported `toast` as (`import { toast as notify }`), so no registry
// can key it by name: the plugin's `scanModule` records the local names and its `callExprs` recognizer matches a
// call against them. The message is the first argument; a literal `duration` (ms) in the second-argument options
// object sets the auto-dismiss (0 = persistent); the other options (`onDismiss`, `description`, `icon`, `action`)
// are dropped in v1, and the preset method carries the type. `loading` has no distinct native variant, so it is
// an info toast.

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
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
export const TOAST_PLUGIN_NAME = '@pyreon/toast'

const NAMES_KEY = '@pyreon/toast:names'
const PRESETS: ReadonlySet<string> = new Set(['success', 'error', 'warning', 'info', 'loading'])
const REAL_UNLOWERED: ReadonlySet<string> = new Set(['update', 'dismiss', 'remove', 'promise'])

interface ToastPayload {
  readonly toastType: string
  readonly durationMillis?: number
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
  const opts = argNodes[1]
  if (opts?.type === 'ObjectExpression') {
    for (const prop of (opts.properties as AnyNode[] | undefined) ?? []) {
      if (hasDynamicKey(prop)) {
        ctx.warnDynamicKey(prop, 'toast() options')
        continue
      }
      const key = staticPropKey(prop)
      const val = prop.value as AnyNode | undefined
      if (key === 'duration' && (val?.type === 'Literal' || val?.type === 'NumericLiteral') && typeof val.value === 'number') {
        durationMillis = val.value
      }
    }
  }
  return {
    type: TOAST_EXPR,
    payload: durationMillis !== undefined ? { toastType, durationMillis } : { toastType },
    args: [message],
  }
}

const toastExpr: ExprEmitter = {
  // `toast("x")` → `PyreonToast.shared.add("x", type: "…")`; a literal duration (ms) is converted to seconds.
  swift(e, ctx) {
    const { toastType, durationMillis } = payloadOf(e)
    const duration = durationMillis !== undefined ? `, duration: ${durationMillis / 1000}` : ''
    return `PyreonToast.shared.add(${ctx.expr(e.args[0]!)}, type: ${ctx.stringLiteral(toastType)}${duration})`
  },
  // → `PyreonToast.add("x", "…")`; a literal duration is a `Long` of milliseconds.
  kotlin(e, ctx) {
    const { toastType, durationMillis } = payloadOf(e)
    const duration = durationMillis !== undefined ? `, ${durationMillis}L` : ''
    return `PyreonToast.add(${ctx.expr(e.args[0]!)}, ${ctx.stringLiteral(toastType)}${duration})`
  },
  // The node was a closed `toast-call` compiler kind before it moved here; the struct names the compiler derives
  // from an expression's shape hash it under that name, so emitted names did not move.
  legacyHash: (e) => ({ kind: TOAST_EXPR, message: e.args[0], ...payloadOf(e) }),
}

/**
 * `<Toaster />` → a native overlay over the reactive `PyreonToast` queue. Reading the queue subscribes the
 * view (an `@Observable` on SwiftUI, a `MutableState` on Compose), so it re-renders as toasts appear and expire.
 * v1: a vertical stack of the active messages, placed where the app puts it (typically the root); positioning,
 * per-type styling and enter/leave animation are a follow-up.
 */
const toasterElements: readonly ElementLowering[] = [
  {
    module: '@pyreon/toast',
    tags: ['Toaster'],
    emit: {
      swift(_el, ctx) {
        const p = ctx.pad(ctx.indent + 2)
        const pi = ctx.pad(ctx.indent + 4)
        return (
          `VStack(spacing: 8) {\n` +
          `${p}ForEach(PyreonToast.shared.toasts, id: \\.id) { __toast in\n` +
          `${pi}Text(__toast.message)\n` +
          `${p}}\n` +
          `${ctx.pad(ctx.indent)}}`
        )
      },
      kotlin(_el, ctx) {
        const p = ctx.pad(ctx.indent + 2)
        const pi = ctx.pad(ctx.indent + 4)
        return (
          `Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {\n` +
          `${p}PyreonToast.toasts.value.forEach { __toast ->\n` +
          `${pi}Text(text = __toast.message)\n` +
          `${p}}\n` +
          `${ctx.pad(ctx.indent)}}`
        )
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
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/toast'],
  scanModule: scanToast,
  callExprs: recognizeToast,
  exprs: { [TOAST_EXPR]: toastExpr },
  elements: toasterElements,
  stubs: toastStubs,
}
