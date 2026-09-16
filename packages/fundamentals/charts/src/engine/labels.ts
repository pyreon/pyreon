// Series labels — ECharts' `label`, including its rich text.
//
// A label is one string per datum. The option facade resolves the `{a}`/`{b}`/
// `{c}`/`{d}` template (it is the only layer that knows the series name, the
// category and the percentage), so what arrives here is the finished text plus
// a style. This module owns the rest: `\n` breaks a line, `{name|text}` takes
// a named rich style, and the whole block is anchored like a single label
// would be — so a two-line label still centres on the bar it belongs to.

import type { DrawCmd, Double, MeasureText, Pt } from './types'

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
): DrawCmd[] {
  const out: DrawCmd[] = []
  const lines = labelLines(text, rich, color, size)
  const plain = lines.length === 1 && lines[0]!.length <= 1
  if (plain) {
    const only = lines[0]!.length === 1 ? lines[0]![0]! : { text: '', color, fontSize: size }
    out.push({ kind: 'text', text: only.text, at, fill: only.color, size: only.fontSize, align: anchorX(align), baseline: anchorY(baseline) })
    return out
  }
  // The block's own height decides where the first line starts, so the whole
  // label sits where a one-line label would have.
  let total = 0.0
  for (const line of lines) total = total + lineHeight(line, size) * 1.25
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
      out.push({ kind: 'text', text: seg.text, at: { x, y }, fill: seg.color, size: seg.fontSize, align: 'start', baseline: 'top' })
      x = x + measure(seg.text, seg.fontSize)
    }
    y = y + h * 1.25
  }
  return out
}

function anchorX(align: string): 'start' | 'middle' | 'end' {
  return align === 'middle' ? 'middle' : align === 'end' ? 'end' : 'start'
}

function anchorY(baseline: string): 'top' | 'middle' | 'bottom' {
  return baseline === 'middle' ? 'middle' : baseline === 'bottom' ? 'bottom' : 'top'
}
