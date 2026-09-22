import { patternImageCells, patternMarks } from './pattern'
import { svgPathRings, unitPolygons } from './svg-path'

describe('svgPathRings', () => {
  it('reads absolute and relative line commands into closed rings', () => {
    expect(svgPathRings('M0 0L10 0L10 10Z')).toEqual([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]])
    expect(svgPathRings('m1,1 h4 v4 h-4 z')).toEqual([[{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 5 }, { x: 1, y: 5 }]])
  })

  it('reads compact numbers: signs as separators, exponents, leading dots', () => {
    expect(svgPathRings('M0-1L2e1,.5L-3 4Z')).toEqual([[{ x: 0, y: -1 }, { x: 20, y: 0.5 }, { x: -3, y: 4 }]])
  })

  it('samples curves, so a curved symbol keeps its curve', () => {
    const [ring] = svgPathRings('M0 0Q5 10 10 0Z')
    expect(ring!.length).toBe(9)
    expect(ring![4]!.y).toBeCloseTo(5, 5)
  })

  it('keeps separate subpaths as separate rings and fits them into a unit box', () => {
    const u = unitPolygons('M0 0L2 0L2 2ZM4 0L6 0L6 2Z')
    expect(u.length).toBe(2)
    expect(u[0]![0]!.x).toBeCloseTo(-0.5, 9)
    expect(u[0]![0]!.y).toBeCloseTo(-1 / 6, 9)
  })
})

describe('path decal marks', () => {
  it('tiles the shape scaled by width', () => {
    const marks = patternMarks({ kind: 'symbols', symbol: 'path', color: '#000', spacing: 10, width: 4, shape: [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0, y: 0.5 }], shapeRings: [3] }, { x: 0, y: 0, w: 10, h: 10 })
    expect(marks.length).toBeGreaterThan(0)
    const first = marks[0]!
    expect(first.kind).toBe('polygon')
    if (first.kind === 'polygon') expect(first.points[1]!.x - first.points[0]!.x).toBeCloseTo(4, 5)
  })
})

describe('patternImageCells', () => {
  const box = { x: 5, y: 5, w: 20, h: 12 }
  const p = (repeat: string) => ({ kind: 'image' as const, color: '', spacing: 0, width: 0, image: 'x', repeat })

  it('repeat tiles at natural size from the canvas origin, covering the box', () => {
    const cells = patternImageCells(p('repeat'), box, 10, 10)
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(cells.length).toBe(6)
  })

  it('repeat-x, repeat-y and no-repeat tile along one axis or none', () => {
    expect(patternImageCells(p('repeat-x'), box, 10, 10).map((c) => c.y)).toEqual([0, 0, 0])
    expect(patternImageCells(p('repeat-y'), box, 10, 10).map((c) => c.x)).toEqual([0, 0])
    expect(patternImageCells(p('no-repeat'), box, 10, 10)).toEqual([{ x: 0, y: 0, w: 10, h: 10 }])
  })

  it('an image decal grid centres the symbol in each cell, aspect kept', () => {
    const cells = patternImageCells({ kind: 'image', color: '', spacing: 10, spacingY: 10, width: 6, image: 'x', repeat: 'grid' }, { x: 0, y: 0, w: 10, h: 10 }, 20, 10)
    expect(cells).toEqual([{ x: 2, y: 3.5, w: 6, h: 3 }])
  })

  it('nothing to tile before the image has a size', () => {
    expect(patternImageCells(p('repeat'), box, 0, 0)).toEqual([])
  })
})
