import { describe, expect, it } from 'vitest'
import { formatTooltipTemplate, orderTooltipEntries, tooltipBreaks, tooltipMarker, tooltipPercent } from './tooltip-format'
import type { TooltipEntry } from './tooltip-format'

const e = (seriesName: string, name: string, value: string, extra: Partial<TooltipEntry> = {}): TooltipEntry => ({ seriesName, name, value, percent: '', values: [], color: '#f00', ...extra })

describe('ECharts tooltip template', () => {
  it('fills {a} {b} {c} {d} from the first entry', () => {
    expect(formatTooltipTemplate('{a}: {b} = {c} ({d}%)', [e('Sales', 'Mon', '12', { percent: '40' })])).toBe('Sales: Mon = 12 (40%)')
  })
  it('indexes placeholders by entry for an axis tooltip', () => {
    const entries = [e('A', 'Mon', '1'), e('B', 'Mon', '2')]
    expect(formatTooltipTemplate('{b0}<br/>{a0}: {c0}<br/>{a1}: {c1}', entries)).toBe('Mon<br/>A: 1<br/>B: 2')
  })
  it('an index past the entries is empty; an unknown placeholder is left as written', () => {
    expect(formatTooltipTemplate('[{c5}] {x} {@name} {', [e('A', 'b', '1')])).toBe('[] {x} {@name} {')
  })
  it('reads {@[n]} from an array datum', () => {
    expect(formatTooltipTemplate('{@[1]} / {@[0]}', [e('A', 'b', '1', { values: ['10', '20'] })])).toBe('20 / 10')
  })
  it('breaks lines at ECharts\' <br> spellings', () => {
    expect(tooltipBreaks('a<br/>b<br>c<br />d')).toBe('a\nb\nc\nd')
  })
  it('the marker is ECharts\' own inline dot', () => {
    expect(tooltipMarker('#123456')).toContain('background-color:#123456')
    expect(tooltipMarker('#123456')).toContain('border-radius:10px')
  })
  it('percent: two decimals, empty for a zero total', () => {
    expect(tooltipPercent(1, 3)).toBe('33.33')
    expect(tooltipPercent(1, 0)).toBe('')
  })
  it('orders an axis tooltip by series or by value', () => {
    const entries = [e('A', 'x', '1'), e('B', 'x', '3'), e('C', 'x', '2')]
    const nums = [1, 3, 2]
    expect(orderTooltipEntries(entries, 'seriesAsc', nums).map((x) => x.seriesName)).toEqual(['A', 'B', 'C'])
    expect(orderTooltipEntries(entries, 'seriesDesc', nums).map((x) => x.seriesName)).toEqual(['C', 'B', 'A'])
    expect(orderTooltipEntries(entries, 'valueAsc', nums).map((x) => x.seriesName)).toEqual(['A', 'C', 'B'])
    expect(orderTooltipEntries(entries, 'valueDesc', nums).map((x) => x.seriesName)).toEqual(['B', 'C', 'A'])
  })
})
