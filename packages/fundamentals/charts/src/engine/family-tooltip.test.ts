import { describe, expect, it } from 'vitest'
import type { HostItem, TooltipView } from './canvas-host'
import { familyItemCursor, familyItemSilent, familyItemTooltip } from './family-tooltip'

const item = (over: Partial<HostItem> = {}): HostItem => ({ seriesIndex: 0, dataIndex: 1, name: 'b', value: 2, color: '#123456', ...over })
const tipFor = (option: Record<string, unknown>, opts: { kind?: string; prop?: boolean } = {}) =>
  familyItemTooltip({ option: () => option, kind: () => (opts.kind ?? 'pie') as never, tooltipProp: () => opts.prop, size: () => ({ w: 300, h: 200 }) })
const pie = (extra: Record<string, unknown> = {}) => ({ series: [{ type: 'pie', name: 'Share', data: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }], ...extra }] })
const view = (v: ReturnType<ReturnType<typeof tipFor>>): TooltipView => v as TooltipView

describe('familyItemTooltip', () => {
  it('no tooltip component: nothing, unless the prop keeps the family\'s own lines', () => {
    expect(tipFor(pie())(item(), ['b', '2'], false)).toBeNull()
    expect(tipFor(pie(), { prop: true })(item(), ['b', '2'], false)).toEqual(['b', '2'])
    expect(tipFor(pie(), { prop: true })(item(), [], false)).toBeNull()
  })
  it('the prop false turns a component\'s box off; show/showContent/trigger none do too', () => {
    expect(tipFor({ ...pie(), tooltip: {} }, { prop: false })(item(), ['b'], false)).toBeNull()
    expect(tipFor({ ...pie(), tooltip: { show: false } })(item(), ['b'], false)).toBeNull()
    expect(tipFor({ ...pie(), tooltip: { showContent: false } })(item(), ['b'], false)).toBeNull()
    expect(tipFor({ ...pie(), tooltip: { trigger: 'none' } })(item(), ['b'], false)).toBeNull()
  })
  it('triggerOn: click answers only a press; none never', () => {
    expect(tipFor({ ...pie(), tooltip: { triggerOn: 'click' } })(item(), ['b'], false)).toBeNull()
    expect(view(tipFor({ ...pie(), tooltip: { triggerOn: 'click' } })(item(), ['b'], true)).lines).toEqual(['b'])
    expect(tipFor({ ...pie(), tooltip: { triggerOn: 'none' } })(item(), ['b'], true)).toBeNull()
  })
  it('trigger axis: nothing on a pie, the family\'s lines on a polar or a river', () => {
    expect(tipFor({ ...pie(), tooltip: { trigger: 'axis' } })(item(), ['b'], false)).toBeNull()
    expect(view(tipFor({ ...pie(), tooltip: { trigger: 'axis' } }, { kind: 'polar' })(item(), ['b'], false)).lines).toEqual(['b'])
    expect(view(tipFor({ ...pie(), tooltip: { trigger: 'axis' } }, { kind: 'themeRiver' })(item(), ['b'], false)).lines).toEqual(['b'])
  })
  it('a series\' own tooltip refines the global one; a lone series tooltip works without a global one', () => {
    expect(view(tipFor({ ...pie({ tooltip: { formatter: 'own {b}' } }), tooltip: { formatter: 'global {b}' } })(item(), [], false)).html).toBe('own b')
    expect(view(tipFor(pie({ tooltip: { formatter: 'only {b}' } }))(item(), [], false)).html).toBe('only b')
  })
  it('a template formatter reads {a} {b} {c} {d} and {@[n]}', () => {
    expect(view(tipFor({ ...pie(), tooltip: { formatter: '{a}|{b}|{c}|{d}' } })(item({ percent: 66.67 }), [], false)).html).toBe('Share|b|2|66.67')
    expect(view(tipFor({ ...pie(), tooltip: { formatter: '{@[1]}' } })(item({ value: [3, 4.5] }), [], false)).html).toBe('4.5')
  })
  it('a function formatter gets ECharts params; a non-string return is stringified', () => {
    const seen: Record<string, unknown>[] = []
    const out = tipFor({ ...pie(), tooltip: { formatter: (p: Record<string, unknown>) => (seen.push(p), 7) } })(item({ percent: 66.67 }), [], false)
    expect(view(out).html).toBe('7')
    expect(seen[0]).toMatchObject({ componentType: 'series', seriesType: 'pie', seriesIndex: 0, seriesName: 'Share', name: 'b', dataIndex: 1, value: 2, percent: 66.67, data: { name: 'b', value: 2 }, color: '#123456' })
    expect(seen[0]!['dataType']).toBeUndefined()
    const nullish = tipFor({ ...pie(), tooltip: { formatter: () => null } })(item(), [], false)
    expect(view(nullish).html).toBe('')
  })
  it('graph-like families carry dataType and no data (their items are not the data array)', () => {
    const seen: Record<string, unknown>[] = []
    tipFor({ series: [{ type: 'sankey', data: [{ name: 'x' }] }], tooltip: { formatter: (p: Record<string, unknown>) => (seen.push(p), '') } }, { kind: 'sankey' })(item({ dataType: 'edge', seriesName: 'Flow' }), [], false)
    expect(seen[0]).toMatchObject({ dataType: 'edge', seriesName: 'Flow', data: undefined })
  })
  it('default content: the family\'s lines, or a name: value line when a valueFormatter re-shows the value', () => {
    expect(view(tipFor({ ...pie(), tooltip: {} })(item(), ['b', '2 (67%)'], false)).lines).toEqual(['b', '2 (67%)'])
    expect(view(tipFor({ ...pie(), tooltip: { valueFormatter: (v: unknown) => `${String(v)} kg` } })(item({ percent: 66.67 }), ['b'], false)).lines).toEqual(['Share', 'b: 2 kg (66.67%)'])
    expect(view(tipFor({ series: [{ type: 'treemap' }], tooltip: {} }, { kind: 'treemap' })(item({ value: [1, Number.NaN, 'x', null] }), [], false)).lines).toEqual(['b: 1, -, x, -'])
    expect(view(tipFor({ series: [{ type: 'treemap' }], tooltip: {} }, { kind: 'treemap' })(item({ value: undefined, color: undefined }), [], false)).lines).toEqual(['b: -'])
  })
  it('the view carries the option\'s placement and look', () => {
    const v = view(tipFor({ ...pie(), tooltip: { position: [5, 6], confine: true, className: 'c', enterable: true, hideDelay: 50, alwaysShowContent: true, transitionDuration: 0.2, backgroundColor: '#000' } })(item(), ['b'], false))
    expect(v.place!({ x: 0, y: 0 }, { w: 10, h: 10 }, { x: 0, y: 0, w: 300, h: 200 })).toEqual({ x: 5, y: 6 })
    expect(v).toMatchObject({ confine: true, className: 'c', enterable: true, hideDelay: 50, keepOnLeave: true, transition: 0.2 })
    expect(v.css).toContain('#000')
  })
})

describe('familyItemCursor / familyItemSilent', () => {
  it('pointer by default, the series\' own cursor when a string', () => {
    expect(familyItemCursor(() => pie())(item())).toBe('pointer')
    expect(familyItemCursor(() => pie({ cursor: 'move' }))(item())).toBe('move')
    expect(familyItemCursor(() => pie({ cursor: 3 }))(item())).toBe('pointer')
    expect(familyItemCursor(() => ({ series: 'bad' }))(item())).toBe('pointer')
  })
  it('silent only when the series says true', () => {
    expect(familyItemSilent(() => pie({ silent: true }))(item())).toBe(true)
    expect(familyItemSilent(() => pie())(item())).toBe(false)
    expect(familyItemSilent(() => ({}))(item({ seriesIndex: 3 }))).toBe(false)
  })
})
