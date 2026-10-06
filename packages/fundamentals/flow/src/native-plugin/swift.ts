/**
 * `@pyreon/flow` → SwiftUI. The plugin's Swift entry points: the claimed JSX
 * elements, the intrinsic tags a flow renderer uses, the `flow-state`
 * declaration, expressions rooted at a flow binding, and the flow helper
 * functions. Each installs the compiler's `ctx` in the Swift slot for exactly
 * the call (`swift-facade.ts`), so the moved emitters read it through `host`.
 */

import type {
  CallExprIR,
  DeclEmitter,
  ExprIR,
  FunctionLowering,
  IntrinsicLowering,
  JsxElementIR,
  MemberExprIR,
  MemberReadLowering,
  ReceiverLowering,
  SwiftEmitContext,
} from '@pyreon/native-compiler/plugin-api'
import { planEdgeText, VIEWPORT_PORTAL_WARNING } from './base-edge'
import { lowerFlowPlainElement } from './dom'
import { DOUBLE_FLOW_CONFIG_PROPERTIES, droppedNodeToolbarWarning } from './lowering'
import { FLOW_STATE_TYPE } from './names'
import { swiftIdent } from '@pyreon/native-compiler/plugin-api'
import {
  emitSwiftFlowBaseEdge,
  emitSwiftFlowCustomPath,
  emitSwiftFlowHost,
  emitSwiftFlowSvg,
  emitSwiftFlowWebView,
  emitSwiftStandaloneFlowControls,
} from './swift-hosts'
import { swiftFlowStateDecl } from './swift-decl'
import { lowerSwiftFlowCall, lowerSwiftFlowFunction, lowerSwiftFlowMember, lowerSwiftMarkerType } from './swift-exprs'
import { host, withSwiftContext } from './swift-facade'
import type { FlowStatePayload } from './types'

const warnBrowserCss = (e: JsxElementIR, tag: string, tail: string): void => {
  for (const name of ['style', 'class']) {
    if (e.attrs.some((a) => a.kind === 'attr' && a.name === name)) host.warn(`<${tag} ${name}> is browser CSS and is not applied natively; ${tail}`)
  }
}

/** `<FlowWebView>` (also claimed under an alias, so it is not dispatched on the tag name). */
export function emitSwiftFlowWebViewElement(e: JsxElementIR, ctx: SwiftEmitContext): string {
  return withSwiftContext(ctx, () => emitSwiftFlowWebView(e))
}

/** The element lowering: every other `@pyreon/flow` JSX tag the plugin claims, on Swift. */
export function emitSwiftFlowElement(e: JsxElementIR, ctx: SwiftEmitContext): string {
  const indent = ctx.indent
  return withSwiftContext(ctx, () => {
    switch (e.tag) {
      case 'Flow':
        return emitSwiftFlowHost(e)
      case 'Controls':
        return emitSwiftStandaloneFlowControls(e, indent)
      case 'Handle':
        warnBrowserCss(e, 'Handle', 'handle geometry and interaction still lower.')
        return 'EmptyView()'
      case 'NodeResizer':
        return 'EmptyView()'
      case 'NodeToolbar': {
        warnBrowserCss(e, 'NodeToolbar', 'toolbar placement and content still lower.')
        // A toolbar lowers ONLY through the up-front extraction, which needs a
        // registered NODE renderer AND a static child position; otherwise it
        // is dropped, and why decides the fix.
        const registered = host.flowFile().nodeRenderers.has(host.component().name)
        if (!registered || !host.flowFile().extractedToolbars.has(e)) host.warn(droppedNodeToolbarWarning(registered, host.component().name))
        return 'EmptyView()'
      }
      case 'BaseEdge':
        return emitSwiftFlowBaseEdge(e, indent)
      case 'EdgeText': {
        const plan = planEdgeText(e)
        for (const w of plan.warnings) host.warnOnce(w)
        if (!plan.text || !plan.x || !plan.y) return 'EmptyView()'
        return `PyreonFlowEdgeText(x: Double(${host.expr(plan.x, indent)}), y: Double(${host.expr(plan.y, indent)}), label: ${host.expr(plan.text, indent)})`
      }
      case 'ViewportPortal':
        host.warnOnce(VIEWPORT_PORTAL_WARNING)
        return 'EmptyView()'
      case 'EdgeLabelRenderer': {
        const content = e.children.map((child) => `  ${host.child(child, indent + 2)}`).join('\n')
        return `PyreonFlowEdgeLabelRenderer {\n${content}\n${' '.repeat(indent)}}`
      }
      default:
        throw new Error(`[Pyreon] @pyreon/flow claimed <${e.tag}> but has no Swift lowering for it.`)
    }
  })
}

/** DOM tags that mean something inside a flow renderer component: `<path>` always, `<div>`/`<p>`/`<span>`/`<svg>` inside one. */
export const flowIntrinsicsSwift: NonNullable<IntrinsicLowering['emit']['swift']> = (e, ctx) =>
  withSwiftContext(ctx, () => {
    if (e.tag === 'path') return emitSwiftFlowCustomPath(e, ctx.indent)
    if (e.tag === 'svg') return emitSwiftFlowSvg(e, ctx.indent)
    const lowered = lowerFlowPlainElement(e)
    return lowered === undefined ? undefined : ctx.emit(lowered)
  })

const declOf = (decl: { readonly name: string; readonly payload: object }): FlowStatePayload & { readonly name: string } => ({
  ...(decl.payload as unknown as FlowStatePayload),
  name: decl.name,
})

/** The `flow-state` declaration on Swift (`@State private var flow = PyreonFlowState<Row>(…)`). */
export const flowStateDeclSwift: DeclEmitter['swift'] = (decl, ctx) =>
  withSwiftContext(ctx as SwiftEmitContext, () => swiftFlowStateDecl(declOf(decl)))

/** Expressions rooted at a flow binding, and the value of an assignment to `flow.config.<x>`. */
export const flowReceiverSwift: NonNullable<ReceiverLowering['swift']> = {
  expr(site, ctx) {
    return withSwiftContext(ctx, () =>
      site.kind === 'call' ? lowerSwiftFlowCall(site.expr as CallExprIR, ctx.indent) : lowerSwiftFlowMember(site.expr as MemberExprIR, ctx.indent),
    )
  },
  assignValue(site) {
    // A Double-typed Flow config property takes a Double. A numeric literal
    // already infers as one; an Int EXPRESSION would not compile.
    const t = site.target
    const flowDouble =
      t.object.kind === 'member' &&
      t.object.property === 'config' &&
      t.object.object.kind === 'identifier' &&
      DOUBLE_FLOW_CONFIG_PROPERTIES.has(t.property) &&
      !(site.value.kind === 'literal' && typeof site.value.value === 'number')
    return flowDouble ? `Double(${site.emitted})` : undefined
  },
}

export const flowFunctionSwift = (name: string): NonNullable<FunctionLowering['swift']> => (site, ctx) =>
  withSwiftContext(ctx, () => lowerSwiftFlowFunction(name, site.args as readonly ExprIR[], ctx.indent))

export const flowMemberReadSwift: NonNullable<MemberReadLowering['swift']> = (e, ctx) => withSwiftContext(ctx, () => lowerSwiftMarkerType(e))

/** The Swift lifecycle of a `useFlow` binding: dispose its listeners when the view disappears. */
export const flowLifecycleSwift = (decl: { readonly name: string; readonly payload: object }): readonly string[] =>
  (decl.payload as unknown as FlowStatePayload).lifecycleOwned === true ? [`.onDisappear { ${swiftIdent(decl.name)}.dispose() }`] : []

export { FLOW_STATE_TYPE }
