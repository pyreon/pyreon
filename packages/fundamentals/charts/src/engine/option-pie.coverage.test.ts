/**
 * The option-pie readers on the key shapes the main suite leaves out: the
 * `edgeDistance` length forms, a nameless series, a formatter returning
 * nothing, every `rotate` spelling, and `arcSweep` past a whole turn.
 */
import { describe, expect, it } from 'vitest'
import { arcSweep, readPieArcs, readPieLabels } from './option-pie'

const TAU = Math.PI * 2
const rows = [
  { value: 1, name: 'a', color: '#a00' },
  { value: 3, name: 'b', color: undefined },
]

describe('readPieLabels — edgeDistance', () => {
  it("defaults to '25%' of the view's width", () => {
    const l = readPieLabels({}, rows, rows)!
    expect(l.edgePercent).toBeCloseTo(0.25, 9)
    expect(l.edgeDistance).toBe(0)
  })

  it('a percent string is a fraction of the width, resolved later', () => {
    const l = readPieLabels({ label: { edgeDistance: '10%' } }, rows, rows)!
    expect(l.edgePercent).toBeCloseTo(0.1, 9)
  })

  it('a number is pixels, and turns the percent off', () => {
    const l = readPieLabels({ label: { edgeDistance: 12 } }, rows, rows)!
    expect(l.edgeDistance).toBe(12)
    expect(l.edgePercent).toBe(-1)
  })

  it('a pixel string parses; an unparseable one is 0', () => {
    expect(readPieLabels({ label: { edgeDistance: '7px' } }, rows, rows)!.edgeDistance).toBe(7)
    expect(readPieLabels({ label: { edgeDistance: 'wide' } }, rows, rows)!.edgeDistance).toBe(0)
  })

  it('any other value is 0 pixels', () => {
    const l = readPieLabels({ label: { edgeDistance: true } }, rows, rows)!
    expect(l.edgeDistance).toBe(0)
    expect(l.edgePercent).toBe(-1)
  })
})

describe('readPieLabels — formatter params and results', () => {
  it("a series with no string name passes '' as seriesName, and the slice's colour", () => {
    const seen: Record<string, unknown>[] = []
    readPieLabels({ name: 42, label: { formatter: (p: Record<string, unknown>) => (seen.push(p), 'x') } }, rows, rows)
    expect(seen[0]).toMatchObject({ seriesName: '', color: '#a00' })
    expect(seen[1]!['color']).toBeUndefined()
  })

  it("a named series passes its name as seriesName", () => {
    const l = readPieLabels({ name: 'Sales', label: { formatter: (p: Record<string, unknown>) => String(p['seriesName']) } }, rows, rows)!
    expect(l.texts).toEqual(['Sales', 'Sales'])
  })

  it('a formatter returning null or undefined leaves that slice unlabelled', () => {
    const l = readPieLabels({ label: { formatter: (p: Record<string, unknown>) => (p['dataIndex'] === 0 ? null : undefined) } }, rows, rows)!
    expect(l.texts).toEqual(['', ''])
  })

  it('a formatter returning a number is stringified', () => {
    const l = readPieLabels({ label: { formatter: (p: Record<string, unknown>) => p['value'] } }, rows, rows)!
    expect(l.texts).toEqual(['1', '3'])
  })
})

describe('readPieLabels — rotate', () => {
  it.each([
    [undefined, '', 0],
    [30, 'fixed', 30],
    [true, 'radial', 0],
    ['radial', 'radial', 0],
    ['tangential', 'tangential', 0],
    ['tangential-noflip', 'tangential-noflip', 0],
    ['sideways', '', 0],
  ] as const)('rotate %s reads as %s', (rot, mode, deg) => {
    const l = readPieLabels({ label: { rotate: rot } }, rows, rows)!
    expect(l.rotate).toBe(mode)
    expect(l.rotateDegrees).toBe(deg)
  })
})

describe('readPieLabels — alignTo and bleedMargin', () => {
  it("keeps 'edge' and 'labelLine', maps anything else to 'none'", () => {
    expect(readPieLabels({ label: { alignTo: 'edge' } }, rows, rows)!.alignTo).toBe('edge')
    expect(readPieLabels({ label: { alignTo: 'labelLine' } }, rows, rows)!.alignTo).toBe('labelLine')
    expect(readPieLabels({ label: { alignTo: 'middle' } }, rows, rows)!.alignTo).toBe('none')
  })

  it('reads an explicit bleedMargin, else -1 (ECharts picks)', () => {
    expect(readPieLabels({ label: { bleedMargin: 4 } }, rows, rows)!.bleedMargin).toBe(4)
    expect(readPieLabels({}, rows, rows)!.bleedMargin).toBe(-1)
  })
})

describe('arcSweep past a whole turn', () => {
  it('clockwise, an end more than a turn on is clamped to one turn', () => {
    expect(arcSweep(0, 3 * Math.PI, true)).toBeCloseTo(TAU, 9)
  })

  it('counter-clockwise, an end more than a turn back is clamped to one turn', () => {
    expect(arcSweep(0, -3 * Math.PI, false)).toBeCloseTo(TAU, 9)
  })

  it('a negative start angle is normalised into the first turn', () => {
    const a = readPieArcs({ startAngle: 90, endAngle: -270 })
    expect(a.sweep).toBeCloseTo(TAU, 9)
  })
})
