/**
 * Lowers an inline `<svg>` inside a native Flow renderer.
 *
 * Every SVG shape becomes path data, which the runtimes already parse
 * (`PyreonFlowPathResult(svgPath:)` / `pyreonFlowPathResultFromSvg`), so one
 * draw routine covers them all. The shape-to-path rewrites use only relative
 * commands and the attribute values themselves, never arithmetic on them, so
 * a DYNAMIC attribute (`cx={props.x}`) lowers as easily as a literal: the
 * value is interpolated into the path string at runtime. The only exception
 * is a rounded `<rect>`, whose straight runs are `width - 2·rx`; that needs
 * literal numbers, and a dynamic one keeps square corners with a warning.
 *
 * Paint follows SVG inheritance: `fill`, `stroke` and `stroke-width` set on
 * the `<svg>` or a `<g>` apply to the shapes inside unless a shape sets its
 * own. What cannot lower (text, gradients, transforms, dynamic children) is
 * named in a warning rather than dropped silently.
 *
 * Shared by both emitters so iOS and Android lower the same shapes.
 */
import { resolveFlowPathPaint, SVG_INITIAL_PAINT, type FlowPathPaint } from './flow-path-paint'
import type { ExprIR } from './types'

type JsxElement = Extract<ExprIR, { kind: 'jsx-element' }>
export type FlowSvgNumber = { kind: 'literal'; value: number } | { kind: 'expr'; expr: ExprIR }
type Paint = Omit<FlowPathPaint, 'warnings'>

export interface FlowSvgShape {
  /** Path data: a string literal or a template the target interpolates. */
  d: ExprIR
  paint: Paint
}

export interface FlowSvgPlan {
  width: FlowSvgNumber | undefined
  height: FlowSvgNumber | undefined
  viewBox: [number, number, number, number] | undefined
  stretch: boolean
  shapes: FlowSvgShape[]
  warnings: string[]
}

/** Elements with nothing to paint: dropping them is the browser's result too. */
const NON_RENDERING = new Set(['title', 'desc', 'metadata'])

function attrValue(e: JsxElement, ...names: string[]): ExprIR | undefined {
  for (const name of names) {
    const a = e.attrs.find((x) => x.kind === 'attr' && x.name === name)
    if (a?.kind === 'attr') return a.value
  }
  return undefined
}

/** A number attribute: a literal (`24`, `"24"`, `"24px"`) or an expression. */
function numberAttr(e: JsxElement, name: string, warnings: string[]): FlowSvgNumber | undefined {
  const value = attrValue(e, name)
  if (value === undefined) return undefined
  if (value.kind === 'literal') {
    if (typeof value.value === 'number') return { kind: 'literal', value: value.value }
    if (typeof value.value === 'string') {
      const m = /^\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*(px)?\s*$/i.exec(value.value)
      if (m) return { kind: 'literal', value: Number(m[1]) }
      warnings.push(`<${e.tag} ${name}="${value.value}"> is not a plain number, which is all a native Flow <svg> lowers; the default was used.`)
      return undefined
    }
  }
  return { kind: 'expr', expr: value }
}

/** Path data built from literal text and interpolated values. */
class PathData {
  private quasis: string[] = ['']
  private exprs: ExprIR[] = []
  text(s: string): this {
    this.quasis[this.quasis.length - 1] += s
    return this
  }
  num(n: FlowSvgNumber, negate = false): this {
    if (n.kind === 'literal') return this.text(String(negate ? -n.value : n.value))
    if (negate) this.text('-')
    this.exprs.push(n.expr)
    this.quasis.push('')
    return this
  }
  expr(e: ExprIR): this {
    if (e.kind === 'literal' && typeof e.value === 'string') return this.text(e.value)
    this.exprs.push(e)
    this.quasis.push('')
    return this
  }
  build(): ExprIR {
    return this.exprs.length === 0 ? { kind: 'literal', value: this.quasis[0]! } : { kind: 'template', quasis: this.quasis, exprs: this.exprs }
  }
}

const zero: FlowSvgNumber = { kind: 'literal', value: 0 }

function shapePath(e: JsxElement, warnings: string[]): ExprIR | undefined {
  const n = (name: string) => numberAttr(e, name, warnings)
  switch (e.tag) {
    case 'path': {
      let d = attrValue(e, 'd')
      if (d?.kind === 'arrow' && d.params.length === 0) d = d.body
      if (d === undefined) {
        warnings.push('A native Flow <svg> <path> needs a `d` attribute; it was dropped.')
        return undefined
      }
      return new PathData().expr(d).build()
    }
    case 'line': {
      return new PathData().text('M ').num(n('x1') ?? zero).text(' ').num(n('y1') ?? zero).text(' L ').num(n('x2') ?? zero).text(' ').num(n('y2') ?? zero).build()
    }
    case 'polyline':
    case 'polygon': {
      const points = attrValue(e, 'points')
      if (points === undefined) return undefined
      const p = new PathData().text('M ').expr(points)
      return (e.tag === 'polygon' ? p.text(' Z') : p).build()
    }
    case 'circle':
    case 'ellipse': {
      const rx = e.tag === 'circle' ? n('r') : (n('rx') ?? n('ry'))
      const ry = e.tag === 'circle' ? rx : (n('ry') ?? n('rx'))
      if (rx === undefined || ry === undefined) return undefined
      // Four quarter arcs from the leftmost point, all relative, so no
      // coordinate is ever computed: each step is ±rx, ±ry.
      const p = new PathData().text('M ').num(n('cx') ?? zero).text(' ').num(n('cy') ?? zero).text(' m ').num(rx, true).text(' 0')
      const arc = (dxNeg: boolean, dyNeg: boolean) =>
        p.text(' a ').num(rx).text(' ').num(ry).text(' 0 0 0 ').num(rx, dxNeg).text(' ').num(ry, dyNeg)
      arc(false, false)
      arc(false, true)
      arc(true, true)
      arc(true, false)
      return p.text(' Z').build()
    }
    case 'rect': {
      const w = n('width')
      const h = n('height')
      if (w === undefined || h === undefined) return undefined
      const x = n('x') ?? zero
      const y = n('y') ?? zero
      let rx = n('rx')
      let ry = n('ry')
      if (rx !== undefined || ry !== undefined) {
        rx ??= ry
        ry ??= rx
        if (rx!.kind === 'literal' && ry!.kind === 'literal' && w.kind === 'literal' && h.kind === 'literal') {
          const cx = Math.min(Math.max(rx!.value, 0), w.value / 2)
          const cy = Math.min(Math.max(ry!.value, 0), h.value / 2)
          if (cx > 0 && cy > 0) {
            const a = (dx: number, dy: number) => ` a ${cx} ${cy} 0 0 1 ${dx} ${dy}`
            return new PathData()
              .text('M ').num(x).text(' ').num(y)
              .text(` m ${cx} 0 h ${w.value - 2 * cx}${a(cx, cy)} v ${h.value - 2 * cy}${a(-cx, cy)} h ${-(w.value - 2 * cx)}${a(-cx, -cy)} v ${-(h.value - 2 * cy)}${a(cx, -cy)} Z`)
              .build()
          }
        } else {
          warnings.push('A native Flow <svg> <rect> with a dynamic rx/ry, width or height keeps square corners: rounding needs literal numbers.')
        }
      }
      return new PathData().text('M ').num(x).text(' ').num(y).text(' h ').num(w).text(' v ').num(h).text(' h ').num(w, true).text(' Z').build()
    }
    default:
      return undefined
  }
}

const SHAPES = new Set(['path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect'])

function collect(children: JsxElement['children'], inherited: Paint, out: FlowSvgShape[], warnings: string[]): void {
  for (const child of children) {
    if (child.kind === 'text') {
      if (child.value.trim() !== '') warnings.push('Text directly inside a native Flow <svg> has no lowering; it was dropped.')
      continue
    }
    const el = child.expr
    if (el.kind === 'jsx-fragment') {
      collect(el.children, inherited, out, warnings)
      continue
    }
    if (el.kind !== 'jsx-element') {
      warnings.push('A dynamic child inside a native Flow <svg> (a `.map`, a conditional) has no lowering; only literal SVG elements are drawn, so it was dropped.')
      continue
    }
    if (NON_RENDERING.has(el.tag)) continue
    if (el.tag !== 'g' && !SHAPES.has(el.tag)) {
      warnings.push(`<${el.tag}> inside a native Flow <svg> has no lowering (shapes, <g> and <path> do); it was dropped. For full SVG, host the diagram with <FlowWebView>.`)
      continue
    }
    if (attrValue(el, 'transform') !== undefined) warnings.push(`A native Flow <svg> <${el.tag} transform> is not applied natively; the shape draws untransformed.`)
    const resolved = resolveFlowPathPaint(el, inherited)
    warnings.push(...resolved.warnings)
    const paint: Paint = { fill: resolved.fill, stroke: resolved.stroke, width: resolved.width }
    if (el.tag === 'g') {
      collect(el.children, paint, out, warnings)
      continue
    }
    const d = shapePath(el, warnings)
    if (d !== undefined) out.push({ d, paint })
  }
}

export function planFlowSvg(e: JsxElement): FlowSvgPlan {
  const warnings: string[] = []
  const width = numberAttr(e, 'width', warnings)
  const height = numberAttr(e, 'height', warnings)
  let viewBox: FlowSvgPlan['viewBox']
  const vb = attrValue(e, 'viewBox')
  if (vb?.kind === 'literal' && typeof vb.value === 'string') {
    const nums = vb.value.trim().split(/[\s,]+/).map(Number)
    if (nums.length === 4 && nums.every(Number.isFinite)) viewBox = nums as [number, number, number, number]
    else warnings.push(`<svg viewBox="${vb.value}"> is not four numbers; it was ignored.`)
  } else if (vb !== undefined) {
    warnings.push('A native Flow <svg viewBox={…}> must be a static string to lower; it was ignored.')
  }
  const par = attrValue(e, 'preserveAspectRatio')
  const stretch = par?.kind === 'literal' && par.value === 'none'
  if (par !== undefined && !stretch && !(par.kind === 'literal' && typeof par.value === 'string' && /^\s*xMidYMid(\s+meet)?\s*$/.test(par.value))) {
    warnings.push('A native Flow <svg preserveAspectRatio> lowers only the default (xMidYMid meet) and "none"; the default was used.')
  }
  if (width === undefined && height === undefined) {
    warnings.push('A native Flow <svg> with no width or height sizes itself from its container on the web but has no container size to use natively, so it draws at 300 wide. Set width and height.')
  }
  for (const name of ['class', 'className']) if (attrValue(e, name) !== undefined) warnings.push(`<svg ${name}> is browser CSS and is not applied natively; the shapes and their paint still lower.`)
  const root = resolveFlowPathPaint(e, SVG_INITIAL_PAINT)
  warnings.push(...root.warnings)
  const shapes: FlowSvgShape[] = []
  collect(e.children, { fill: root.fill, stroke: root.stroke, width: root.width }, shapes, warnings)
  return { width, height, viewBox, stretch, shapes, warnings }
}
