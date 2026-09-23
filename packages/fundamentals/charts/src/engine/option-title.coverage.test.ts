import { describe, expect, it } from 'vitest'
import { optionTitleCommands, readOptionTitle } from './option-title'
import type { ChartTheme } from './render'

// Complements option-title.test.ts: the reading edges (padding shapes,
// weights, empty strings, aliases), the pixel/percent parsing of positions,
// the background box under every alignment, and link boxes off-centre.
const t = { fontSize: 12, text: '#111111', label: '#666666' } as ChartTheme
const measure = (s: string, size: number): number => s.length * size * 0.5
type TextCmd = { kind: 'text'; text: string; at: { x: number; y: number }; align: string; baseline: string; weight?: string }
const run = (title: Record<string, unknown>, width = 400, height = 300) => optionTitleCommands(readOptionTitle(title)!, width, height, t, measure)
const first = (title: Record<string, unknown>): TextCmd => run(title).cmds.find((c) => c.kind === 'text') as TextCmd

describe('readOptionTitle — reading edges', () => {
  it('padding: one number, four numbers, and anything else falls back to 5 all round', () => {
    expect(readOptionTitle({ text: 'T', padding: 3 })!.padding).toEqual([3, 3, 3, 3])
    expect(readOptionTitle({ text: 'T', padding: [1, 2, 3, 4] })!.padding).toEqual([1, 2, 3, 4])
    expect(readOptionTitle({ text: 'T', padding: [1, 2, 3] })!.padding).toEqual([5, 5, 5, 5])
    expect(readOptionTitle({ text: 'T', padding: ['1', 2] })!.padding).toEqual([5, 5, 5, 5])
  })

  it('the padding moves a pixel-placed block by its own left / top side', () => {
    // left 30 + left padding 4; top 40 + top padding 1.
    expect(first({ text: 'T', left: 30, top: 40, padding: [1, 2, 3, 4] }).at).toEqual({ x: 34, y: 41 })
  })

  it('an empty subtext / link / sublink reads as none', () => {
    const r = readOptionTitle({ text: 'T', subtext: '', link: '', sublink: '' })!
    expect(r.subtext).toBeUndefined()
    expect(r.link).toBeUndefined()
    expect(r.sublink).toBeUndefined()
    expect(run({ text: 'T', subtext: '', link: '' }).links).toEqual([])
    expect(run({ text: 'T', subtext: '' }).cmds.filter((c) => c.kind === 'text')).toHaveLength(1)
  })

  it('target / subtarget: only "self" reads as self; anything else opens a new window', () => {
    const r = readOptionTitle({ text: 'T', link: 'a', target: 'self', sublink: 'b', subtarget: 'parent' })!
    expect(r.target).toBe('self')
    expect(r.subtarget).toBe('blank')
  })

  it('textBaseline is read as textVerticalAlign; unknown align words are ignored', () => {
    expect(readOptionTitle({ text: 'T', textBaseline: 'middle' })!.textVerticalAlign).toBe('middle')
    expect(readOptionTitle({ text: 'T', textVerticalAlign: 'top', textBaseline: 'bottom' })!.textVerticalAlign).toBe('top')
    expect(readOptionTitle({ text: 'T', textAlign: 'justify', textVerticalAlign: 'baseline' })).toMatchObject({ textAlign: undefined, textVerticalAlign: undefined })
  })

  it('fontWeight: "bolder" and >= 600 are bold, a lighter number is not; subtext defaults to regular', () => {
    expect(readOptionTitle({ text: 'T', textStyle: { fontWeight: 'bolder' } })!.bold).toBe(true)
    expect(readOptionTitle({ text: 'T', textStyle: { fontWeight: 500 } })!.bold).toBe(false)
    expect(readOptionTitle({ text: 'T', subtextStyle: { fontWeight: 'bold' } })!.subBold).toBe(true)
    expect(readOptionTitle({ text: 'T', subtextStyle: {} })!.subBold).toBe(false)
  })

  it('a fully transparent rgba background reads as none; an opaque one is kept', () => {
    expect(readOptionTitle({ text: 'T', backgroundColor: 'rgba(0, 0, 0, 0)' })!.background).toBeUndefined()
    expect(readOptionTitle({ text: 'T', backgroundColor: 'rgba(0,0,0,0.5)' })!.background).toBe('rgba(0,0,0,0.5)')
  })

  it('non-finite numbers and non-string positions are dropped', () => {
    const r = readOptionTitle({ text: 'T', left: Number.NaN, top: {}, itemGap: Number.POSITIVE_INFINITY, borderWidth: 'x' })!
    expect(r).toMatchObject({ left: undefined, top: undefined, itemGap: undefined, borderWidth: 0 })
  })
})

describe('optionTitleCommands — positions as strings', () => {
  it('a bare numeric string is pixels; a percent is of the chart; garbage falls back to the padding', () => {
    expect(first({ text: 'T', left: '30', top: '40' }).at).toEqual({ x: 35, y: 45 })
    expect(first({ text: 'T', top: '10%' }).at.y).toBe(30 + 5)
    // An unparseable percent or word places the block at the padding.
    expect(first({ text: 'T', left: 'abc%', top: 'nope' }).at).toEqual({ x: 5, y: 5 })
  })

  it('right / bottom as percents place the far edge', () => {
    // 'T' at 18px is 9 wide: 400 - 40 - 9 - 5.
    expect(first({ text: 'T', right: '10%' }).at.x).toBe(346)
    // bottom 10% of 300 = 30: 300 - 30 - 18 - 5.
    expect(first({ text: 'T', bottom: '10%' }).at.y).toBe(247)
  })

  it('a keyword on the far side that is not a placement falls back to the padding', () => {
    expect(first({ text: 'T', right: 'nowhere' }).at.x).toBe(5)
    expect(first({ text: 'T', bottom: 'nowhere' }).at.y).toBe(5)
  })

  it('top "center" centres vertically like "middle" and reserves no height', () => {
    expect(first({ text: 'T', top: 'center' })).toMatchObject({ at: { y: 150 }, baseline: 'middle' })
    expect(run({ text: 'T', top: 'center' }).height).toBe(0)
  })

  it('left "right" / top "bottom" with an explicit alignment keeps the anchor at the block edge', () => {
    // No keyword shift: the block's left edge (400 - 9 - 5) with the text left-aligned.
    expect(first({ text: 'T', left: 'right', textAlign: 'left' })).toMatchObject({ at: { x: 386 }, align: 'start' })
    expect(first({ text: 'T', top: 'bottom', textVerticalAlign: 'top' })).toMatchObject({ at: { y: 277 }, baseline: 'top' })
  })
})

describe('optionTitleCommands — the box round the block', () => {
  const box = (title: Record<string, unknown>) => run(title).cmds.find((c) => c.kind === 'rect') as { rect: { x: number; y: number; w: number; h: number }; fill: string }

  it('centred (the default): the box is centred on the text anchor', () => {
    // 'T' is 9 × 18; the anchor is x 200, y 20; padding 5.
    expect(box({ text: 'T', backgroundColor: '#eee' })).toMatchObject({ fill: '#eee', rect: { x: 190.5, y: 15, w: 19, h: 28 } })
  })

  it('right-aligned: the box ends at the anchor plus the right padding', () => {
    const b = box({ text: 'T', left: 'right', backgroundColor: '#eee' })
    expect(b.rect).toEqual({ x: 381, y: 15, w: 19, h: 28 })
    expect(b.rect.x + b.rect.w).toBe(400)
  })

  it('middle and bottom: the box encloses the single text line', () => {
    expect(box({ text: 'T', top: 'middle', backgroundColor: '#eee' }).rect).toEqual({ x: 190.5, y: 136, w: 19, h: 28 })
    const b = box({ text: 'T', top: 'bottom', backgroundColor: '#eee' }).rect
    expect(b).toEqual({ x: 190.5, y: 272, w: 19, h: 28 })
    expect(b.y + b.h).toBe(300)
  })

  it('a border alone draws a closed outline in the theme text colour, with no fill', () => {
    const cmds = run({ text: 'T', borderWidth: 2 }).cmds
    expect(cmds.some((c) => c.kind === 'rect')).toBe(false)
    const line = cmds.find((c) => c.kind === 'polyline') as { points: { x: number; y: number }[]; stroke: string; width: number }
    expect(line).toMatchObject({ stroke: '#111111', width: 2 })
    expect(line.points).toHaveLength(5)
    expect(line.points[0]).toEqual(line.points[4])
    expect(line.points[0]).toEqual({ x: 190.5, y: 15 })
  })
})

describe('optionTitleCommands — link boxes follow the drawn text', () => {
  it('right-aligned: each link box ends at the anchor', () => {
    const { links } = run({ text: 'T', subtext: 'Sub', left: 'right', link: 'u', target: 'self', sublink: 'v' })
    // blockW = max(9, 18) = 18; anchor 400 - 5 = 395.
    expect(links).toEqual([
      { rect: { x: 386, y: 20, w: 9, h: 18 }, url: 'u', target: '_self' },
      { rect: { x: 377, y: 48, w: 18, h: 12 }, url: 'v', target: '_blank' },
    ])
  })

  it('middle: a link box is centred on its line; bottom: it sits above its baseline', () => {
    const mid = run({ text: 'T', top: 'middle', link: 'u' })
    expect(mid.links[0]!.rect).toEqual({ x: 195.5, y: 141, w: 9, h: 18 })
    const bot = run({ text: 'T', top: 'bottom', link: 'u' })
    const drawn = bot.cmds.find((c) => c.kind === 'text') as TextCmd
    expect(bot.links[0]!.rect).toEqual({ x: 195.5, y: drawn.at.y - 18, w: 9, h: 18 })
  })

  it('left-aligned: each link box starts at the anchor', () => {
    const { links } = run({ text: 'T', subtext: 'Sub', left: 30, link: 'u', sublink: 'v' })
    expect(links.map((l) => l.rect)).toEqual([
      { x: 35, y: 20, w: 9, h: 18 },
      { x: 35, y: 48, w: 18, h: 12 },
    ])
  })

  it('a sublink with no subtext draws no link', () => {
    expect(run({ text: 'T', sublink: 'v' }).links).toEqual([])
  })
})
