// The visualMap strip laid HORIZONTALLY (the default under a heatmap), and the
// shapes the vertical suite does not reach: end texts, a flat domain, pieces
// in a row, unbounded pieces, and where the strip is placed in a chart.
import { describe, expect, it } from 'vitest'
import { pieceContains, renderVisualStrip, visualColorFor, visualOutBands, visualStripHandleAt, visualStripPieceAt, visualStripPlace, visualStripSize, visualStripValueAt } from './visual-strip'
import type { VisualStrip } from './visual-strip'
import type { DrawCmd } from './types'

const strip: VisualStrip = {
  piecewise: false, stops: ['#000000', '#ffffff'], domain: { min: 0, max: 100 }, pieces: [], vertical: false,
  highText: '', lowText: '', fontSize: 10, labelColor: '#333333', itemSize: 16, itemLength: 100, calculable: true, outColor: '#cccccc',
}
const at = { x: 0, y: 0 }
// A horizontal bar starts one label width (3.2 × fontSize) plus a 4px gap in.
const BAR_X = 32 + 4
const texts = (cmds: DrawCmd[]) => cmds.filter((c): c is Extract<DrawCmd, { kind: 'text' }> => c.kind === 'text')

describe('horizontal continuous strip', () => {
  it('runs low to high left to right, the end labels beside it and the handles hanging below', () => {
    const cmds = renderVisualStrip(strip, at, { min: 25, max: 75 }, [])
    const rects = cmds.filter((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect')
    expect(rects).toHaveLength(24)
    expect(rects[0]!.rect.x).toBe(BAR_X)
    expect(rects[1]!.rect.x).toBeGreaterThan(rects[0]!.rect.x)
    // The first stripe (low end, below 25) is inactive; a middle one is not.
    expect(rects[0]!.fill).toBe('#cccccc')
    expect(rects[12]!.fill).not.toBe('#cccccc')
    const t = texts(cmds)
    expect(t.find((x) => x.text === '0')!.align).toBe('end')
    expect(t.find((x) => x.text === '100')!.align).toBe('start')
    // Handle values sit under their triangles.
    const low = t.find((x) => x.text === '25')!
    expect(low.at.x).toBeCloseTo(BAR_X + 25, 6)
    expect(low.baseline).toBe('top')
    expect(low.at.y).toBeGreaterThan(strip.itemSize)
  })

  it('custom end texts replace the domain ends; a non-calculable strip draws no handles', () => {
    const cmds = renderVisualStrip({ ...strip, calculable: false, lowText: 'cold', highText: 'hot' }, at, { min: 0, max: 100 }, [])
    expect(texts(cmds).map((x) => x.text)).toEqual(['cold', 'hot'])
    expect(cmds.some((c) => c.kind === 'polygon')).toBe(false)
  })

  it('hit-tests its handles and maps a pointer along the bar', () => {
    const range = { min: 25, max: 75 }
    expect(visualStripHandleAt(strip, at, range, BAR_X + 75, strip.itemSize + 4)).toBe(1)
    expect(visualStripHandleAt(strip, at, range, BAR_X + 25, strip.itemSize + 4)).toBe(0)
    expect(visualStripHandleAt({ ...strip, calculable: false }, at, range, BAR_X + 25, strip.itemSize + 4)).toBe(-1)
    expect(visualStripValueAt(strip, at, BAR_X + 40, 5)).toBeCloseTo(40, 9)
    expect(visualStripValueAt(strip, at, BAR_X + 500, 5)).toBe(100)
    // A zero-length bar still answers without dividing by zero.
    expect(visualStripValueAt({ ...strip, itemLength: 0 }, at, BAR_X - 10, 5)).toBe(0)
  })

  it('a flat domain puts every value at the high end', () => {
    const flat = { ...strip, domain: { min: 5, max: 5 } }
    expect(visualColorFor(flat, 5, { min: 0, max: 10 }, [])).toBe(visualColorFor(strip, 100, { min: 0, max: 100 }, []))
  })

  it('its size leaves room for both end labels and the hanging handles', () => {
    expect(visualStripSize(strip)).toEqual({ x: 32 * 2 + 4 * 2 + 100, y: 16 + 8 + 4 + 10 + 2 })
    expect(visualStripSize({ ...strip, calculable: false }).y).toBe(16)
  })
})

describe('horizontal piecewise strip', () => {
  const pieces: VisualStrip = {
    ...strip,
    piecewise: true,
    pieces: [
      { label: 'low', color: '#0000ff', max: 10 },
      { label: 'mid', color: '#00ff00', min: 10, max: 50 },
      { label: 'high', color: '#ff0000', min: 50 },
    ],
  }

  it('lays the swatches in a row, an unselected one in the inactive colour', () => {
    const cmds = renderVisualStrip(pieces, at, { min: 0, max: 100 }, [true, false, true])
    const swatches = cmds.filter((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect')
    expect(swatches.map((s) => s.fill)).toEqual(['#0000ff', '#cccccc', '#ff0000'])
    expect(swatches[1]!.rect.x).toBeGreaterThan(swatches[0]!.rect.x)
    expect(swatches.every((s) => s.rect.y === 0)).toBe(true)
  })

  it('hits the piece under a point along the row, and misses past it', () => {
    const size = visualStripSize(pieces)
    expect(size.y).toBe(16)
    expect(visualStripPieceAt(pieces, at, 1, 1)).toBe(0)
    const second = renderVisualStrip(pieces, at, { min: 0, max: 100 }, []).filter((c): c is Extract<DrawCmd, { kind: 'rect' }> => c.kind === 'rect')[1]!.rect
    expect(visualStripPieceAt(pieces, at, second.x + 1, 1)).toBe(1)
    expect(visualStripPieceAt(pieces, at, size.x + 50, 1)).toBe(-1)
    expect(visualStripPieceAt(strip, at, 1, 1)).toBe(-1)
  })

  it('an empty piece list is a zero-size strip', () => {
    expect(visualStripSize({ ...pieces, pieces: [] })).toEqual({ x: 0, y: 16 })
  })

  it('bounds are inclusive; an unbounded piece end reaches past the domain in the out bands', () => {
    expect(pieceContains(pieces.pieces[1]!, 10)).toBe(true)
    expect(pieceContains(pieces.pieces[1]!, 51)).toBe(false)
    expect(pieceContains(pieces.pieces[0]!, -1e9)).toBe(true)
    const bands = visualOutBands(pieces, [false, true, false])
    expect(bands[1]).toBe(10)
    expect(bands[0]).toBeLessThan(-1e6)
    expect(bands[2]).toBe(50)
    expect(bands[3]).toBeGreaterThan(1e6)
  })
})

describe('visualStripPlace', () => {
  it('a horizontal strip takes the bottom of the box and the chart keeps the rest', () => {
    const p = visualStripPlace(strip, 400, 300)
    const size = visualStripSize(strip)
    expect(p.at).toEqual({ x: 0, y: 300 - size.y })
    expect(p.chartW).toBe(400)
    expect(p.chartH).toBe(300 - size.y - 8)
  })

  it('a box too short for the strip leaves the chart no height rather than a negative one', () => {
    expect(visualStripPlace(strip, 400, 10).chartH).toBe(0)
  })
})
