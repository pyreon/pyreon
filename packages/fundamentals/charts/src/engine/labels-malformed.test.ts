// The rich-label tag parser on input that is NOT a well-formed `{style|text}`.
// A chart label is author-supplied text, so every malformed spelling is
// reachable in practice, and the parser's contract is that it degrades to the
// LITERAL text the author wrote rather than swallowing it — a dropped label is
// invisible, which is the worst failure available to a label.
import { describe, expect, it } from 'vitest'
import { labelCommands, labelLineSegments, labelLines, lineHeight, lineWidth } from './labels'
import type { RichStyle } from './labels'
import type { DrawCmd, MeasureText } from './types'

const RICH: RichStyle[] = [
  { name: 'a', color: '#ff0000', fontSize: 20 },
  { name: 'b', color: '#00ff00', fontSize: 10 },
]
const seg = (line: string) => labelLineSegments(line, RICH, '#000', 12)
const texts = (line: string) => seg(line).map((s) => s.text)
const measure: MeasureText = (text, size) => text.length * size * 0.6

describe('labelLineSegments — well-formed tags', () => {
  it('splits a tagged run out of the surrounding text and styles it', () => {
    const out = seg('before{a|red}after')
    expect(out.map((s) => s.text)).toEqual(['before', 'red', 'after'])
    expect(out[1]!.color).toBe('#ff0000')
    expect(out[1]!.fontSize).toBe(20)
    // The untagged runs keep the caller's colour and size.
    expect(out[0]!.color).toBe('#000')
    expect(out[0]!.fontSize).toBe(12)
  })

  it('an UNKNOWN style name still emits the text, at the default style', () => {
    const out = seg('{nope|text}')
    expect(out.map((s) => s.text)).toEqual(['text'])
    expect(out[0]!.color).toBe('#000')
  })
})

describe('labelLineSegments — malformed input degrades to literal text', () => {
  it('an UNTERMINATED tag reads as the text it was written as', () => {
    expect(texts('{a|open')).toEqual(['{a|open'])
    // Unterminated with no bar yet.
    expect(texts('{a')).toEqual(['{a'])
    expect(texts('{')).toEqual(['{'])
  })

  it('a `{` that never becomes a tag is literal, and the character after it is still handled', () => {
    // `{}` is not a tag: the closing brace arrives with no bar.
    expect(texts('x{}y').join('')).toContain('x')
    expect(texts('x{}y').join('')).toContain('y')
  })

  it('a NESTED `{` ends the candidate tag and both are literal', () => {
    const out = texts('{a{b|inner}').join('')
    expect(out).toContain('{a')
    expect(out).toContain('inner')
  })

  it('an empty string produces no segments at all', () => {
    expect(seg('')).toEqual([])
  })

  it('a bar with no style name still emits its body', () => {
    expect(texts('{|body}')).toEqual(['body'])
  })

  it('a tag with an EMPTY body keeps its (empty) run rather than dropping the tag', () => {
    // The run is preserved so the segment count still mirrors the authored
    // tags; it renders as a zero-width command, not as missing text.
    expect(texts('a{a|}b')).toEqual(['a', '', 'b'])
  })
})

describe('labelLines — newlines', () => {
  it('splits on newlines, each line parsed independently', () => {
    const lines = labelLines('one\n{a|two}', RICH, '#000', 12)
    expect(lines).toHaveLength(2)
    expect(lines[0]!.map((s) => s.text)).toEqual(['one'])
    expect(lines[1]![0]!.color).toBe('#ff0000')
  })

  it('an empty line stays as a line rather than collapsing', () => {
    expect(labelLines('a\n\nb', RICH, '#000', 12)).toHaveLength(3)
  })
})

describe('lineWidth / lineHeight', () => {
  it('width sums the segments at their OWN sizes', () => {
    const line = seg('ab{a|cd}')
    expect(lineWidth(line, measure)).toBeCloseTo(2 * 12 * 0.6 + 2 * 20 * 0.6, 5)
  })

  it('height is the tallest segment, and the default size when the line is empty', () => {
    expect(lineHeight(seg('x{a|y}'), 12)).toBe(20)
    expect(lineHeight([], 12)).toBe(12)
  })
})

describe('labelCommands — one command for a plain label, several for a rich one', () => {
  const at = { x: 50, y: 50 }
  const cmds = (text: string, baseline: 'top' | 'middle' | 'bottom' = 'middle'): DrawCmd[] =>
    labelCommands(text, RICH, at, 'center', baseline, '#000', 12, measure)

  it('a single plain line is exactly one text command at the anchor', () => {
    const out = cmds('plain')
    expect(out).toHaveLength(1)
    expect(out[0]!.kind === 'text' && out[0]!.at).toEqual(at)
  })

  it('an EMPTY label still emits one command rather than nothing', () => {
    // The host positions by the returned command; emitting none would silently
    // drop the slot rather than render an empty label.
    const out = cmds('')
    expect(out).toHaveLength(1)
    expect(out[0]!.kind === 'text' && out[0]!.text).toBe('')
  })

  it('a multi-segment line emits one command per segment', () => {
    expect(cmds('a{a|b}c').length).toBeGreaterThan(1)
  })

  it('the baseline decides where the block starts, and every line lands inside it', () => {
    const top = cmds('l1\nl2', 'top').filter((c) => c.kind === 'text')
    const mid = cmds('l1\nl2', 'middle').filter((c) => c.kind === 'text')
    const bot = cmds('l1\nl2', 'bottom').filter((c) => c.kind === 'text')
    const firstY = (list: DrawCmd[]) => (list[0]!.kind === 'text' ? list[0]!.at.y : Number.NaN)
    // A bottom-anchored block starts highest, a top-anchored one lowest.
    expect(firstY(bot)).toBeLessThan(firstY(mid))
    expect(firstY(mid)).toBeLessThan(firstY(top))
  })
})
