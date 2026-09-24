/**
 * Native lowering of `@pyreon/flow`'s `BaseEdge` and `EdgeText` (React Flow's
 * edge building blocks), shared by both emitters.
 *
 * `BaseEdge` is a stroke plus an optional label. Its stroke follows the web
 * component: `style` when given, otherwise the flow palette's edge colour at
 * 1.5 wide with no fill; `PALETTE_STROKE` marks "the palette decides", which
 * the native `PyreonFlowBaseEdgePath` resolves from its environment exactly as
 * the web's CSS variable resolves per colour mode. Marker `url(#…)` references
 * and `class` name web-only things and are reported, not dropped silently.
 */
import { resolveFlowPathPaint, type FlowPathPaint } from './flow-path-paint'
import type { ExprIR } from './types'

type JsxElement = Extract<ExprIR, { kind: 'jsx-element' }>

export const PALETTE_STROKE = '\u0000palette'

export interface BaseEdgePlan {
  path: ExprIR | undefined
  paint: Omit<FlowPathPaint, 'warnings'>
  label: { text: ExprIR; x: ExprIR; y: ExprIR } | undefined
  warnings: string[]
}

const attr = (e: JsxElement, name: string): ExprIR | undefined => {
  const a = e.attrs.find((x) => x.kind === 'attr' && x.name === name)
  return a?.kind === 'attr' ? a.value : undefined
}

export function planBaseEdge(e: JsxElement): BaseEdgePlan {
  const warnings: string[] = []
  const path = attr(e, 'path')
  if (path === undefined) warnings.push('A native Flow <BaseEdge> needs a `path`; without one there is nothing to draw.')
  const style = attr(e, 'style')
  const styled: JsxElement = { kind: 'jsx-element', tag: 'BaseEdge', attrs: style ? [{ kind: 'attr', name: 'style', value: style }] : [], children: [] }
  // The web applies `style` INSTEAD of its default declaration, so a style that
  // sets no stroke leaves SVG's initial values (no stroke, width 1) — only an
  // absent style gets the palette stroke at 1.5.
  const resolved = resolveFlowPathPaint(
    styled,
    style
      ? { fill: { kind: 'none' }, stroke: { kind: 'none' }, width: { kind: 'literal', value: 1 } }
      : { fill: { kind: 'none' }, stroke: { kind: 'literal', value: PALETTE_STROKE }, width: { kind: 'literal', value: 1.5 } },
  )
  warnings.push(...resolved.warnings)
  for (const name of ['markerStart', 'markerEnd']) {
    if (attr(e, name) !== undefined) warnings.push(`<BaseEdge ${name}> is an SVG url(#…) reference with no native meaning; set \`${name}\` on the edge itself (a marker spec lowers natively).`)
  }
  if (attr(e, 'class') !== undefined) warnings.push('<BaseEdge class> is browser CSS and is not applied natively; use `style` for the stroke.')
  if (attr(e, 'labelStyle') !== undefined) warnings.push('<BaseEdge labelStyle> is browser CSS; the native label uses the flow palette.')
  const text = attr(e, 'label')
  const x = attr(e, 'labelX')
  const y = attr(e, 'labelY')
  const label = text !== undefined && x !== undefined && y !== undefined ? { text, x, y } : undefined
  if (text !== undefined && label === undefined) warnings.push('A native Flow <BaseEdge label> needs `labelX` and `labelY` to be drawn; it was dropped.')
  return { path, paint: { fill: resolved.fill, stroke: resolved.stroke, width: resolved.width }, label, warnings }
}

export function planEdgeText(e: JsxElement): { text?: ExprIR; x?: ExprIR; y?: ExprIR; warnings: string[] } {
  const warnings: string[] = []
  const text = attr(e, 'label')
  const x = attr(e, 'x')
  const y = attr(e, 'y')
  if (text === undefined || x === undefined || y === undefined) warnings.push('A native Flow <EdgeText> needs `x`, `y` and `label`; it was dropped.')
  if (attr(e, 'style') !== undefined) warnings.push('<EdgeText style> is browser CSS; the native label uses the flow palette.')
  return { ...(text ? { text } : {}), ...(x ? { x } : {}), ...(y ? { y } : {}), warnings }
}

export const VIEWPORT_PORTAL_WARNING =
  '<ViewportPortal> positions arbitrary content in flow coordinates with CSS, which has no native meaning, so it was dropped. ' +
  'Use <EdgeLabelRenderer> inside a custom edge, <NodeToolbar> or <Panel>, or host the diagram with <FlowWebView> from @pyreon/flow/webview.'
