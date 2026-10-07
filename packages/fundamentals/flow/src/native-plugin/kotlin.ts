/**
 * `@pyreon/flow` → Jetpack Compose. The plugin's Kotlin entry points — the
 * mirror of `swift.ts`; each installs the compiler's `ctx` in the Kotlin slot for
 * exactly the call (`kotlin-facade.ts`).
 */

import type {
  CallExprIR,
  DeclEmitter,
  ExprIR,
  FunctionLowering,
  IntrinsicLowering,
  JsxElementIR,
  KotlinEmitContext,
  MemberExprIR,
  MemberReadLowering,
  ReceiverLowering,
} from '@pyreon/native-compiler/plugin-api'
import { kotlinIdent } from '@pyreon/native-compiler/plugin-api'
import { planEdgeText, VIEWPORT_PORTAL_WARNING } from './base-edge'
import { lowerFlowPlainElement } from './dom'
import { DOUBLE_FLOW_CONFIG_PROPERTIES, droppedNodeToolbarWarning } from './lowering'
import {
  emitKotlinFlowBaseEdge,
  emitKotlinFlowCustomPath,
  emitKotlinFlowHost,
  emitKotlinFlowSvg,
  emitKotlinFlowWebView,
  emitKotlinStandaloneFlowControls,
} from './kotlin-hosts'
import { kotlinFlowStateDecl } from './kotlin-decl'
import { lowerKotlinEdgeDataRead, lowerKotlinFlowCall, lowerKotlinFlowFunction, lowerKotlinFlowMember, lowerKotlinMarkerType } from './kotlin-exprs'
import { host, withKotlinContext } from './kotlin-facade'
import type { FlowStatePayload } from './types'

const warnBrowserCss = (e: JsxElementIR, tag: string, tail: string): void => {
  for (const name of ['style', 'class']) {
    if (e.attrs.some((a) => a.kind === 'attr' && a.name === name)) host.warn(`<${tag} ${name}> is browser CSS and is not applied natively; ${tail}`)
  }
}

/** `<FlowWebView>` (also claimed under an alias, so it is not dispatched on the tag name). */
export function emitKotlinFlowWebViewElement(e: JsxElementIR, ctx: KotlinEmitContext): string {
  return withKotlinContext(ctx, () => emitKotlinFlowWebView(e))
}

/** The element lowering: every other `@pyreon/flow` JSX tag the plugin claims, on Kotlin. */
export function emitKotlinFlowElement(e: JsxElementIR, ctx: KotlinEmitContext): string {
  const indent = ctx.indent
  return withKotlinContext(ctx, () => {
    switch (e.tag) {
      case 'Flow':
        return emitKotlinFlowHost(e)
      case 'Controls':
        return emitKotlinStandaloneFlowControls(e, indent)
      case 'Handle':
        warnBrowserCss(e, 'Handle', 'handle geometry and interaction still lower.')
        return 'Box {}'
      case 'NodeResizer':
        return 'Box {}'
      case 'NodeToolbar': {
        warnBrowserCss(e, 'NodeToolbar', 'toolbar placement and content still lower.')
        // A toolbar lowers ONLY through the up-front extraction, which needs a
        // registered NODE renderer AND a static child position; otherwise it
        // is dropped, and why decides the fix.
        const registered = host.flowFile().nodeRenderers.has(host.component().name)
        if (!registered || !host.flowFile().extractedToolbars.has(e)) host.warn(droppedNodeToolbarWarning(registered, host.component().name))
        return 'Box {}'
      }
      case 'BaseEdge':
        return emitKotlinFlowBaseEdge(e, indent)
      case 'EdgeText': {
        const plan = planEdgeText(e)
        for (const w of plan.warnings) host.warnOnce(w)
        if (!plan.text || !plan.x || !plan.y) return 'Box {}'
        return `PyreonFlowEdgeText(x = (${host.expr(plan.x, indent)}).toDouble(), y = (${host.expr(plan.y, indent)}).toDouble(), label = ${host.expr(plan.text, indent)})`
      }
      case 'ViewportPortal':
        host.warnOnce(VIEWPORT_PORTAL_WARNING)
        return 'Box {}'
      case 'EdgeLabelRenderer': {
        const content = e.children.map((child) => `  ${host.child(child, indent + 2)}`).join('\n')
        return `PyreonFlowEdgeLabelRenderer {\n${content}\n${' '.repeat(indent)}}`
      }
      default:
        throw new Error(`[Pyreon] @pyreon/flow claimed <${e.tag}> but has no Kotlin lowering for it.`)
    }
  })
}

/** DOM tags that mean something inside a flow renderer component: `<path>` always, `<div>`/`<p>`/`<span>`/`<svg>` inside one. */
export const flowIntrinsicsKotlin: NonNullable<IntrinsicLowering['emit']['kotlin']> = (e, ctx) =>
  withKotlinContext(ctx, () => {
    if (e.tag === 'path') return emitKotlinFlowCustomPath(e, ctx.indent)
    if (e.tag === 'svg') return emitKotlinFlowSvg(e, ctx.indent)
    const lowered = lowerFlowPlainElement(e)
    return lowered === undefined ? undefined : ctx.emit(lowered)
  })

const declOf = (decl: { readonly name: string; readonly payload: object }): FlowStatePayload & { readonly name: string } => ({
  ...(decl.payload as unknown as FlowStatePayload),
  name: decl.name,
})

/** The `flow-state` declaration on Kotlin (`val flow = remember { PyreonFlowState<Row>(…) }`). */
export const flowStateDeclKotlin: DeclEmitter['kotlin'] = (decl, ctx) =>
  withKotlinContext(ctx as KotlinEmitContext, () => kotlinFlowStateDecl(declOf(decl)))

/** Expressions rooted at a flow binding, and the value of an assignment to `flow.config.<x>`. */
export const flowReceiverKotlin: NonNullable<ReceiverLowering['kotlin']> = {
  expr(site, ctx) {
    return withKotlinContext(ctx, () =>
      site.kind === 'call' ? lowerKotlinFlowCall(site.expr as CallExprIR, ctx.indent) : lowerKotlinFlowMember(site.expr as MemberExprIR, ctx.indent),
    )
  },
  assignValue(site) {
    // A Double-typed Flow config property takes a Double: a whole-number
    // literal or an Int expression would not compile.
    const t = site.target
    const flowDouble =
      t.object.kind === 'member' &&
      t.object.property === 'config' &&
      t.object.object.kind === 'identifier' &&
      DOUBLE_FLOW_CONFIG_PROPERTIES.has(t.property)
    if (!flowDouble) return undefined
    return site.value.kind === 'literal' && typeof site.value.value === 'number'
      ? Number.isInteger(site.value.value)
        ? `${site.value.value}.0`
        : `${site.value.value}`
      : `(${site.emitted}).toDouble()`
  },
}

export const flowFunctionKotlin = (name: string): NonNullable<FunctionLowering['kotlin']> => (site, ctx) =>
  withKotlinContext(ctx, () => lowerKotlinFlowFunction(name, site.args as readonly ExprIR[], ctx.indent))

/** `MarkerType.*` and the Kotlin-only `props.edge.data.x` read (a map on Compose). */
export const flowMemberReadKotlin: NonNullable<MemberReadLowering['kotlin']> = (e, ctx) =>
  withKotlinContext(ctx, () => lowerKotlinEdgeDataRead(e, ctx.indent) ?? lowerKotlinMarkerType(e))

/** The Compose lifecycle of a `useFlow` binding: dispose its listeners when the composable leaves composition. */
export const flowLifecycleKotlin = (decl: { readonly name: string; readonly payload: object }): readonly string[] => {
  if ((decl.payload as unknown as FlowStatePayload).lifecycleOwned !== true) return []
  const name = kotlinIdent(decl.name)
  return [`DisposableEffect(${name}) { onDispose { ${name}.dispose() } }`]
}
