// The axis half of the ECharts facade: a second x axis maps only as a second
// naming of the SAME bands; everything else is named. Two y axes placed on the
// same side cannot both be honoured, so the conflict is named rather than one
// axis quietly moving; a first axis placed right with a second on the left
// swaps sides, and series indices follow the swap.
import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import type { EChartsOption } from './option'

const bars = [{ type: 'bar', data: [1, 2, 3] }]
const compile = (o: Record<string, unknown>) => compileOption({ series: bars, ...o } as EChartsOption)
const warnsOn = (o: Record<string, unknown>, path: string) => compile(o).warnings.some((w) => w.path === path)

describe('a second x axis', () => {
  const cats = { type: 'category', data: ['a', 'b', 'c'] }

  it('maps when it names the same number of bands', () => {
    const c = compile({ xAxis: [cats, { type: 'category', data: ['p', 'q', 'r'] }], yAxis: {} })
    expect(c.spec.x2Labels).toEqual(['p', 'q', 'r'])
    expect(c.warnings.some((w) => w.path === 'xAxis')).toBe(false)
  })

  it('reads {value} objects in its data, and stringifies a missing value', () => {
    const c = compile({ xAxis: [cats, { data: [{ value: 'p' }, { value: 'q' }, {}] }], yAxis: {} })
    expect(c.spec.x2Labels).toEqual(['p', 'q', ''])
  })

  it('a different band count is NAMED and dropped', () => {
    const c = compile({ xAxis: [cats, { data: ['p'] }], yAxis: {} })
    expect(c.spec.x2Labels ?? []).toEqual([])
    expect(c.warnings.some((w) => w.path === 'xAxis')).toBe(true)
  })

  it('a second axis with no data, or a non-object second axis, is named', () => {
    expect(warnsOn({ xAxis: [cats, { type: 'value' }], yAxis: {} }, 'xAxis')).toBe(true)
    expect(warnsOn({ xAxis: [cats, 7], yAxis: {} }, 'xAxis')).toBe(true)
  })

  it('a THIRD x axis is always named', () => {
    expect(warnsOn({ xAxis: [cats, cats, cats], yAxis: {} }, 'xAxis')).toBe(true)
  })

  it('a first axis with no data cannot anchor a second', () => {
    expect(warnsOn({ xAxis: [{ type: 'category' }, { data: ['p'] }], yAxis: {} }, 'xAxis')).toBe(true)
  })

  it('first-axis category {value} objects are read the same way', () => {
    const c = compile({ xAxis: { type: 'category', data: [{ value: 'a' }, {}, 'c'] }, yAxis: {} })
    expect(c.spec.categories).toEqual(['a', '', 'c'])
  })
})

describe('y axis positions', () => {
  it('a lone y axis placed right is honoured without a warning', () => {
    expect(warnsOn({ xAxis: {}, yAxis: { position: 'right' } }, 'yAxis.position')).toBe(false)
  })

  it('first axis right and second left SWAP sides without a warning', () => {
    const c = compile({ xAxis: {}, yAxis: [{ position: 'right', name: 'R' }, { position: 'left', name: 'L' }] })
    expect(c.warnings.some((w) => w.path.startsWith('yAxis['))).toBe(false)
  })

  it('both axes on the SAME side cannot be honoured, and the conflict is named', () => {
    expect(warnsOn({ xAxis: {}, yAxis: [{ position: 'left' }, { position: 'left' }] }, 'yAxis[1].position')).toBe(true)
    expect(warnsOn({ xAxis: {}, yAxis: [{ position: 'right' }, { position: 'right' }] }, 'yAxis[0].position')).toBe(true)
  })

  it('non-object y axis entries are ignored rather than read', () => {
    expect(() => compile({ xAxis: {}, yAxis: [7, { position: 'left' }] })).not.toThrow()
  })
})

describe('third y axis side, and a lone axis with an unknown position', () => {
  it('a third y axis placed left maps to the LEFT side; anything else maps right', () => {
    const side = (position?: string) =>
      compile({ xAxis: {}, yAxis: [{}, {}, position === undefined ? {} : { position }] }).spec.extraYAxes?.[0]?.side
    expect(side('left')).toBe('left')
    expect(side('right')).toBe('right')
    expect(side()).toBe('right')
  })

  it('a LONE y axis with a position that is neither side is named at `yAxis.position`', () => {
    expect(warnsOn({ xAxis: {}, yAxis: { position: 'top' } }, 'yAxis.position')).toBe(true)
  })
})
