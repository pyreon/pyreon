import { describe, expect, it } from 'vitest'
import { readTooltipOption } from './option-tooltip'
import { compileOption } from './option'

const read = (raw: unknown) => {
  const warnings: string[] = []
  const spec = readTooltipOption(raw, (_c, path) => warnings.push(path))
  return { spec, warnings }
}

describe('readTooltipOption — the whole ECharts tooltip component', () => {
  it('no tooltip component, no tooltip (ECharts shows none)', () => {
    expect(read(undefined).spec).toBeNull()
  })
  it('defaults match ECharts', () => {
    const { spec, warnings } = read({})
    expect(warnings).toEqual([])
    expect(spec).toMatchObject({ show: true, showContent: true, trigger: 'item', triggerOn: 'mousemove', confine: false, order: 'seriesAsc', enterable: false, alwaysShowContent: false, showDelay: 0, hideDelay: 100, transitionDuration: 0.4 })
    expect(spec!.axisPointer.type).toBe('none')
    expect(spec!.position).toEqual({ kind: 'follow' })
  })
  it('an axis trigger defaults its pointer to a line; cross shows labels', () => {
    expect(read({ trigger: 'axis' }).spec!.axisPointer).toMatchObject({ type: 'line', label: false })
    expect(read({ trigger: 'axis', axisPointer: { type: 'cross' } }).spec!.axisPointer).toMatchObject({ type: 'cross', label: true })
    expect(read({ trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'red' } } }).spec!.axisPointer).toMatchObject({ type: 'shadow', shadowColor: 'red' })
  })
  it('reads formatters, position forms, and the look', () => {
    const fn = () => 'x'
    const { spec } = read({ formatter: '{a}', valueFormatter: fn, position: 'top', backgroundColor: '#000', borderColor: '#111', borderWidth: 2, padding: [4, 8], textStyle: { color: '#fff', fontSize: 14 }, extraCssText: 'opacity:0.9', className: 'tip' })
    expect(spec!.formatter).toBe('{a}')
    expect(spec!.valueFormatter).toBe(fn)
    expect(spec!.position).toEqual({ kind: 'side', side: 'top' })
    expect(spec!.css).toBe('background:#000;border-color:#111;border-width:2px;border-style:solid;padding:4px 8px;color:#fff;font-size:14px;opacity:0.9')
    expect(spec!.className).toBe('tip')
    expect(read({ position: [10, '50%'] }).spec!.position).toEqual({ kind: 'point', x: 10, y: '50%' })
    expect(read({ position: { right: 5, bottom: 6 } }).spec!.position).toEqual({ kind: 'point', x: 'r:5', y: 'b:6' })
    expect(read({ position: fn }).spec!.position.kind).toBe('fn')
  })
  it('names what it cannot honour instead of dropping it', () => {
    expect(read({ appendToBody: true, renderMode: 'richText', displayMode: 'multipleByCoordSys', wobble: 1, axisPointer: { type: 'line', status: 'show' } }).warnings.sort()).toEqual([
      'tooltip.appendToBody', 'tooltip.axisPointer.status', 'tooltip.displayMode', 'tooltip.renderMode', 'tooltip.wobble',
    ])
    expect(read({ position: 42 }).warnings).toEqual(['tooltip.position'])
  })
  it('compileOption carries the spec, and show:false turns the boolean off', () => {
    const base = { xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }
    expect(compileOption({ ...base, tooltip: { trigger: 'axis' } }).tooltipSpec!.trigger).toBe('axis')
    expect(compileOption({ ...base, tooltip: { show: false } }).tooltip).toBe(false)
    expect(compileOption(base).tooltipSpec).toBeNull()
  })
})
