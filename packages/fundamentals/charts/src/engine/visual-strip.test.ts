import { renderVisualStrip, visualColorFor, visualInRange, visualOutBands, visualStripDrag, visualStripHandleAt, visualStripPieceAt, visualStripSize, visualStripToggle, visualStripValueAt } from './visual-strip'
import type { VisualStrip } from './visual-strip'
import { visualOutside } from './heat'

const base: VisualStrip = {
  piecewise: false, stops: ['#000000', '#ffffff'], domain: { min: 0, max: 100 }, pieces: [], vertical: true,
  highText: '', lowText: '', fontSize: 10, labelColor: '#333333', itemSize: 16, itemLength: 100, calculable: true, outColor: '#cccccc',
}
const at = { x: 0, y: 0 }

describe('continuous calculable strip', () => {
  it('draws the out-of-range stripes in the inactive colour and two handles with their values', () => {
    const cmds = renderVisualStrip(base, at, { min: 25, max: 75 }, [])
    const rects = cmds.filter((c) => c.kind === 'rect')
    expect(rects.length).toBe(24)
    // Vertical runs top-down: the first stripe is the high end, outside 75.
    expect(rects[0]!.kind === 'rect' && rects[0]!.fill).toBe('#cccccc')
    expect(rects[12]!.kind === 'rect' && rects[12]!.fill).not.toBe('#cccccc')
    expect(cmds.filter((c) => c.kind === 'polygon').length).toBe(2)
    expect(cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))).toEqual(['100', '0', '25', '75'])
  })

  it('hit-tests the handle under the pointer and maps a pointer to a value along the bar', () => {
    const range = { min: 25, max: 75 }
    // Bar top is at fontSize + gap = 14; value 75 sits 25% down a 100px bar.
    expect(visualStripHandleAt(base, at, range, 20, 14 + 25)).toBe(1)
    expect(visualStripHandleAt(base, at, range, 20, 14 + 75)).toBe(0)
    expect(visualStripHandleAt(base, at, range, 200, 200)).toBe(-1)
    expect(visualStripValueAt(base, at, 5, 14 + 40)).toBeCloseTo(60, 9)
    expect(visualStripValueAt(base, at, 5, -50)).toBe(100)
  })

  it('a dragged end follows the value and never crosses the other', () => {
    expect(visualStripDrag(base, { min: 25, max: 75 }, 0, 40)).toEqual({ min: 40, max: 75 })
    expect(visualStripDrag(base, { min: 25, max: 75 }, 0, 90)).toEqual({ min: 75, max: 75 })
    expect(visualStripDrag(base, { min: 25, max: 75 }, 1, 10)).toEqual({ min: 25, max: 25 })
  })

  it('colours values by the ramp inside the range and the inactive colour outside', () => {
    expect(visualColorFor(base, 90, { min: 25, max: 75 }, [])).toBe('#cccccc')
    expect(visualColorFor(base, 50, { min: 25, max: 75 }, [])).not.toBe('#cccccc')
    expect(visualOutside(90, { min: 25, max: 75 }, undefined)).toBe(true)
    expect(visualOutside(50, { min: 25, max: 75 }, undefined)).toBe(false)
  })

  it('reserves room for the handle labels', () => {
    expect(visualStripSize(base).x).toBeGreaterThan(visualStripSize({ ...base, calculable: false }).x)
  })
})

describe('piecewise strip', () => {
  const pw: VisualStrip = { ...base, piecewise: true, calculable: false, pieces: [{ label: 'high', color: '#ff0000', min: 50 }, { label: 'low', color: '#0000ff', max: 50 }] }

  it('a click on a swatch or its label toggles that piece', () => {
    expect(visualStripPieceAt(pw, at, 5, 5)).toBe(0)
    expect(visualStripPieceAt(pw, at, 5, 16 + 4 + 5)).toBe(1)
    expect(visualStripPieceAt(pw, at, 500, 5)).toBe(-1)
    expect(visualStripToggle(pw, [], 1)).toEqual([true, false])
  })

  it('an unselected piece greys its swatch and becomes an out band; an unbounded end reaches past the domain', () => {
    const cmds = renderVisualStrip(pw, at, { min: 0, max: 100 }, [true, false])
    expect(cmds.filter((c) => c.kind === 'rect').map((c) => (c.kind === 'rect' ? c.fill : ''))).toEqual(['#ff0000', '#cccccc'])
    const bands = visualOutBands(pw, [true, false])
    expect(bands[1]).toBe(50)
    expect(bands[0]).toBeLessThan(0)
    expect(visualInRange(pw, 20, { min: 0, max: 100 }, [true, false])).toBe(false)
    expect(visualInRange(pw, 80, { min: 0, max: 100 }, [true, false])).toBe(true)
    expect(visualOutside(20, undefined, bands)).toBe(true)
    expect(visualColorFor(pw, 80, { min: 0, max: 100 }, [true, false])).toBe('#ff0000')
  })
})
