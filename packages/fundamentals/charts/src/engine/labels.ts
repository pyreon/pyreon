// Series labels — ECharts' `label`, including its rich text.
//
// A label is one string per datum. The option facade resolves the `{a}`/`{b}`/
// `{c}`/`{d}` template (it is the only layer that knows the series name, the
// category and the percentage), so what arrives here is the finished text plus
// a style. This module owns the rest: `\n` breaks a line, `{name|text}` takes
// a named rich style, and the whole block is anchored like a single label
// would be — so a two-line label still centres on the bar it belongs to.

import type { DrawCmd, Double, MeasureText, Pt, Rect } from './types'
import { hexDigit } from './palette'

/** A named style a label's `{name|text}` segment can take. */
export interface RichStyle {
  name: string
  /** '' = inherit the label's colour. */
  color: string
  /** 0 = inherit the label's size. */
  fontSize: Double
}

/** One styled run inside a label line. */
export interface LabelSegment {
  text: string
  color: string
  fontSize: Double
}

/**
 * Split a label into lines of styled segments.
 *
 * `{name|text}` takes the named style; an unknown name falls back to the
 * label's own colour and size rather than dropping the text, because a
 * mistyped style should still show what it says.
 */
export function labelLineSegments(line: string, rich: RichStyle[], color: string, size: Double): LabelSegment[] {
  const segments: LabelSegment[] = []
  let plain = ''
  // A character walk with an explicit tag state, and the flush written out at
  // each of its points: the native subset has no two-argument `indexOf` and
  // does not lower a zero-argument local closure's call. No array is ever
  // REASSIGNED either — the Kotlin emit makes an array local a `val`.
  let inTag = false
  let sawBar = false
  let tagName = ''
  let tagBody = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i)
    let handled = false
    if (inTag) {
      if (ch === '|' && !sawBar) {
        sawBar = true
        handled = true
      } else if (ch === '}' && sawBar) {
        if (plain !== '') segments.push({ text: plain, color, fontSize: size })
        plain = ''
        let segColor = color
        let segSize = size
        for (const r of rich) {
          if (r.name === tagName) {
            if (r.color !== '') segColor = r.color
            if (r.fontSize > 0.0) segSize = r.fontSize
          }
        }
        segments.push({ text: tagBody, color: segColor, fontSize: segSize })
        inTag = false
        sawBar = false
        tagName = ''
        tagBody = ''
        handled = true
      } else if (ch !== '{' && ch !== '}') {
        if (sawBar) tagBody = tagBody + ch
        else tagName = tagName + ch
        handled = true
      } else {
        // Not a tag after all — what was consumed is literal text, and `ch`
        // still has to be handled below.
        plain = plain + '{' + tagName + (sawBar ? '|' + tagBody : '')
        inTag = false
        sawBar = false
        tagName = ''
        tagBody = ''
      }
    }
    if (!handled) {
      if (ch === '{') inTag = true
      else plain = plain + ch
    }
  }
  // An unterminated tag reads as the literal text it was written as.
  if (inTag) plain = plain + '{' + tagName + (sawBar ? '|' + tagBody : '')
  if (plain !== '') segments.push({ text: plain, color, fontSize: size })
  return segments
}

/** Every line of a label, `\n`-separated, as styled segments. */
export function labelLines(text: string, rich: RichStyle[], color: string, size: Double): LabelSegment[][] {
  const lines: LabelSegment[][] = []
  for (const line of text.split('\n')) lines.push(labelLineSegments(line, rich, color, size))
  return lines
}

/** A line's width — the sum of its segments, each measured at its own size. */
export function lineWidth(line: LabelSegment[], measure: MeasureText): Double {
  let w = 0.0
  for (const seg of line) w = w + measure(seg.text, seg.fontSize)
  return w
}

/** The tallest segment on a line, which is what sets its height. */
export function lineHeight(line: LabelSegment[], size: Double): Double {
  let h = size
  for (const seg of line) if (seg.fontSize > h) h = seg.fontSize
  return h
}

/**
 * The commands a label draws at an anchor.
 *
 * A plain single-line label emits exactly ONE text command — byte-identical
 * to what the draw list carried before rich text existed — so nothing
 * regresses for the common case. Multi-line and rich labels emit one command
 * per segment, laid out left to right and top to bottom about the anchor.
 */
export function labelCommands(
  text: string,
  rich: RichStyle[],
  at: Pt,
  align: string,
  baseline: string,
  color: string,
  size: Double,
  measure: MeasureText,
  stroke?: string,
  strokeWidth?: Double,
): DrawCmd[] {
  const out: DrawCmd[] = []
  // A halo (ECharts' textBorder): absent unless a stroke colour is given.
  const halo = stroke ?? ''
  const haloStroke = halo === '' ? undefined : halo
  const haloWidth = halo === '' ? undefined : (strokeWidth ?? 2.0)
  const lines = labelLines(text, rich, color, size)
  const plain = lines.length === 1 && lines[0]!.length <= 1
  if (plain) {
    const only = lines[0]!.length === 1 ? lines[0]![0]! : { text: '', color, fontSize: size }
    out.push({ kind: 'text', text: only.text, at, fill: only.color, size: only.fontSize, align: anchorX(align), baseline: anchorY(baseline), stroke: haloStroke, strokeWidth: haloWidth })
    return out
  }
  // The block's own height decides where the first line starts, so the whole
  // label sits where a one-line label would have.
  let total = 0.0
  for (const line of lines) total = total + lineHeight(line, size)
  let y = at.y
  if (baseline === 'middle') y = at.y - total / 2.0
  else if (baseline === 'bottom') y = at.y - total
  for (const line of lines) {
    const h = lineHeight(line, size)
    const w = lineWidth(line, measure)
    let x = at.x
    if (align === 'middle') x = at.x - w / 2.0
    else if (align === 'end') x = at.x - w
    for (const seg of line) {
      out.push({ kind: 'text', text: seg.text, at: { x, y }, fill: seg.color, size: seg.fontSize, align: 'start', baseline: 'top', stroke: haloStroke, strokeWidth: haloWidth })
      x = x + measure(seg.text, seg.fontSize)
    }
    y = y + h
  }
  return out
}

function anchorX(align: string): 'start' | 'middle' | 'end' {
  return align === 'middle' ? 'middle' : align === 'end' ? 'end' : 'start'
}

function anchorY(baseline: string): 'top' | 'middle' | 'bottom' {
  return baseline === 'middle' ? 'middle' : baseline === 'bottom' ? 'bottom' : 'top'
}

/** Where a label sits against a shape's box: the anchor, its alignment, and whether it is inside. */
export interface LabelPlace {
  at: Pt
  align: string
  baseline: string
  inside: boolean
}

/**
 * zrender's `calculateTextPosition`: a named `position` against `r` (`top`,
 * `bottom`, `left`, `right`, `inside`, `insideTop`, `insideBottom`,
 * `insideLeft`, `insideRight` and the four inside corners), `distance` px
 * off the edge (ECharts' default 5). An unknown name sits `inside`.
 */
export function labelPlace(r: Rect, position: string, distance: Double): LabelPlace {
  const x0 = r.w < 0.0 ? r.x + r.w : r.x
  const y0 = r.h < 0.0 ? r.y + r.h : r.y
  const w = Math.abs(r.w)
  const h = Math.abs(r.h)
  const inside = position.indexOf('inside') >= 0 || (position !== 'top' && position !== 'bottom' && position !== 'left' && position !== 'right')
  if (position === 'left') return { at: { x: x0 - distance, y: y0 + h / 2.0 }, align: 'end', baseline: 'middle', inside }
  if (position === 'right') return { at: { x: x0 + w + distance, y: y0 + h / 2.0 }, align: 'start', baseline: 'middle', inside }
  if (position === 'top') return { at: { x: x0 + w / 2.0, y: y0 - distance }, align: 'middle', baseline: 'bottom', inside }
  if (position === 'bottom') return { at: { x: x0 + w / 2.0, y: y0 + h + distance }, align: 'middle', baseline: 'top', inside }
  if (position === 'insideLeft') return { at: { x: x0 + distance, y: y0 + h / 2.0 }, align: 'start', baseline: 'middle', inside }
  if (position === 'insideRight') return { at: { x: x0 + w - distance, y: y0 + h / 2.0 }, align: 'end', baseline: 'middle', inside }
  if (position === 'insideTop') return { at: { x: x0 + w / 2.0, y: y0 + distance }, align: 'middle', baseline: 'top', inside }
  if (position === 'insideBottom') return { at: { x: x0 + w / 2.0, y: y0 + h - distance }, align: 'middle', baseline: 'bottom', inside }
  if (position === 'insideTopLeft') return { at: { x: x0 + distance, y: y0 + distance }, align: 'start', baseline: 'top', inside }
  if (position === 'insideTopRight') return { at: { x: x0 + w - distance, y: y0 + distance }, align: 'end', baseline: 'top', inside }
  if (position === 'insideBottomLeft') return { at: { x: x0 + distance, y: y0 + h - distance }, align: 'start', baseline: 'bottom', inside }
  if (position === 'insideBottomRight') return { at: { x: x0 + w - distance, y: y0 + h - distance }, align: 'end', baseline: 'bottom', inside }
  return { at: { x: x0 + w / 2.0, y: y0 + h / 2.0 }, align: 'middle', baseline: 'middle', inside }
}

/**
 * zrender's `lum`: perceived lightness 0..1 of a `#rgb` / `#rrggbb` colour.
 * Anything else reads as mid (0.3), which picks the light label with a halo —
 * readable on any fill.
 */
export function colorLum(color: string): Double {
  if (color.length === 7 && color.charCodeAt(0) === 35.0) {
    const r = hexDigit(color.charCodeAt(1)) * 16.0 + hexDigit(color.charCodeAt(2))
    const g = hexDigit(color.charCodeAt(3)) * 16.0 + hexDigit(color.charCodeAt(4))
    const b = hexDigit(color.charCodeAt(5)) * 16.0 + hexDigit(color.charCodeAt(6))
    return (r * 0.299 + g * 0.587 + b * 0.114) / 255.0
  }
  if (color.length === 4 && color.charCodeAt(0) === 35.0) {
    const r = hexDigit(color.charCodeAt(1)) * 17.0
    const g = hexDigit(color.charCodeAt(2)) * 17.0
    const b = hexDigit(color.charCodeAt(3)) * 17.0
    return (r * 0.299 + g * 0.587 + b * 0.114) / 255.0
  }
  return 0.3
}

/** A label's automatic fill and halo (stroke), as zrender picks them. */
export interface AutoLabelStyle {
  textFill: string
  halo: string
}

/** A `#rgb` / `#rrggbb` colour — the forms `colorLum` reads. */
export function isHexColor(color: string): boolean {
  return (color.length === 7 || color.length === 4) && color.charCodeAt(0) === 35.0
}

/**
 * zrender's automatic label colours. Inside a shape: `#333` on a light fill,
 * `#eee` on a mid one, `#ccc` on a dark one, haloed in the shape's own colour
 * when the text's lightness matches the mode (a light label on a light
 * chart). Outside: `#333` (`#ccc` on a dark chart) haloed in the background,
 * white (black) when the chart has none.
 */
export function autoLabelStyle(inside: boolean, shapeFill: string, background: string): AutoLabelStyle {
  const dark = isHexColor(background) && colorLum(background) < 0.4
  if (!inside) return { textFill: dark ? '#ccc' : '#333', halo: isHexColor(background) ? background : dark ? '#000000' : '#ffffff' }
  const l = colorLum(shapeFill)
  const fill = l > 0.5 ? '#333' : l > 0.2 ? '#eee' : '#ccc'
  const darkLabel = colorLum(fill) < 0.4
  return { textFill: fill, halo: dark === darkLabel ? shapeFill : '' }
}
