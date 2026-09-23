/**
 * The paint of a native Flow `<path>`, resolved like the browser resolves it.
 *
 * A `<path>` in a custom edge or connection line gets no stylesheet defaults
 * on the web (the flow's CSS styles only its own edge class), so plain SVG
 * rules apply: fill is black, stroke is none, stroke-width is 1. A value
 * comes from the attribute (`fill`, `stroke`, `stroke-width` / `strokeWidth`)
 * or from a static `style` string, and `style` wins over the attribute, as a
 * CSS declaration beats a presentation attribute. `none` and `transparent`
 * mean "do not paint".
 *
 * Shared by both emitters so the two targets resolve the same paint.
 */
import type { ExprIR } from './types'

export type FlowPathPaintValue = { kind: 'none' } | { kind: 'literal'; value: string } | { kind: 'expr'; expr: ExprIR }

export interface FlowPathPaint {
  fill: FlowPathPaintValue
  stroke: FlowPathPaintValue
  width: { kind: 'literal'; value: number } | { kind: 'expr'; expr: ExprIR }
  warnings: string[]
}

type JsxElement = Extract<ExprIR, { kind: 'jsx-element' }>

function styleDeclarations(style: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of style.split(';')) {
    const colon = part.indexOf(':')
    if (colon < 0) continue
    out.set(part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim())
  }
  return out
}

function paintOf(value: string): FlowPathPaintValue {
  const v = value.trim()
  return v === 'none' || v === 'transparent' ? { kind: 'none' } : { kind: 'literal', value: v }
}

/** What an element inherits when it sets nothing: the SVG initial values. */
export const SVG_INITIAL_PAINT: Omit<FlowPathPaint, 'warnings'> = {
  fill: { kind: 'literal', value: '#000000' },
  stroke: { kind: 'none' },
  width: { kind: 'literal', value: 1 },
}

/**
 * `inherited` is the parent's resolved paint. `fill`, `stroke` and
 * `stroke-width` are inherited properties in SVG, so a shape inside a `<g>`
 * or `<svg>` that sets them takes the ancestor's value, not the initial one.
 */
export function resolveFlowPathPaint(e: JsxElement, inherited: Omit<FlowPathPaint, 'warnings'> = SVG_INITIAL_PAINT): FlowPathPaint {
  const warnings: string[] = []
  const attr = (...names: string[]) => {
    for (const name of names) {
      const a = e.attrs.find((x) => x.kind === 'attr' && x.name === name)
      if (a?.kind === 'attr' && a.value !== undefined) return a.value
    }
    return undefined
  }
  const literal = (expr: ExprIR | undefined): string | number | undefined =>
    expr?.kind === 'literal' && (typeof expr.value === 'string' || typeof expr.value === 'number') ? expr.value : undefined

  const styleExpr = attr('style')
  let style = new Map<string, string>()
  if (styleExpr !== undefined) {
    const text = literal(styleExpr)
    if (typeof text === 'string') style = styleDeclarations(text)
    else warnings.push(`A native Flow <${e.tag} style={…}> must be a static string to lower; its fill, stroke and stroke-width attributes still apply.`)
  }

  const paint = (styleKey: string, ...attrNames: string[]): FlowPathPaintValue | undefined => {
    const fromStyle = style.get(styleKey)
    if (fromStyle !== undefined) return paintOf(fromStyle)
    const expr = attr(...attrNames)
    if (expr === undefined) return undefined
    const text = literal(expr)
    return typeof text === 'string' ? paintOf(text) : { kind: 'expr', expr }
  }

  const fill = paint('fill', 'fill') ?? inherited.fill
  const stroke = paint('stroke', 'stroke') ?? inherited.stroke

  let width: FlowPathPaint['width'] = inherited.width
  const styleWidth = style.get('stroke-width')
  if (styleWidth !== undefined && Number.isFinite(Number.parseFloat(styleWidth))) {
    width = { kind: 'literal', value: Number.parseFloat(styleWidth) }
  } else {
    const expr = attr('stroke-width', 'strokeWidth')
    const text = literal(expr)
    if (typeof text === 'number') width = { kind: 'literal', value: text }
    else if (typeof text === 'string' && Number.isFinite(Number.parseFloat(text))) width = { kind: 'literal', value: Number.parseFloat(text) }
    else if (expr !== undefined) width = { kind: 'expr', expr }
  }
  return { fill, stroke, width, warnings }
}
