// Default number display: thousands are grouped wherever a value is READ —
// axis ticks, tooltips, the spoken description and the accessible table —
// because that is what ECharts shows (`addCommas` in IntervalScale.getLabel
// and in its tooltip), and because an axis reading 60,000 beside a tooltip or
// a screen reader saying 60000 is one chart to one reader and another to the
// next. Series VALUE labels stay ungrouped: ECharts' `{c}` is the raw value.
import { describe, expect, it } from 'vitest'
import { chartTableRow, describeChart } from './a11y'
import { currency, groupThousands, plain } from './format'
import { makeTicks } from './scale'
import { logViewTicks } from './scale-extra'
import { tooltipLines } from './tooltip'

describe('grouped by default', () => {
  it('axis ticks', () => {
    const labels = makeTicks({ min: 0, max: 60000 }, 0, 300, 5).map((t) => t.label)
    expect(labels).toContain('60,000')
    expect(labels.every((l) => !/\d{4}/.test(l))).toBe(true)
  })

  it('log axis ticks', () => {
    expect(logViewTicks(1, 10000, 0, 300).map((t) => t.label)).toEqual(expect.arrayContaining(['1,000', '10,000']))
  })

  it('the tooltip', () => {
    const lines = tooltipLines({ title: 'May', rows: [{ label: 'Revenue', value: 60000, color: '#000' }] })
    expect(lines.join(' ')).toContain('60,000')
  })

  it('the description and the accessible table', () => {
    const input = { title: 'Revenue', categories: ['Apr', 'May'], series: [{ label: 'Revenue', values: [47000, 60000], kind: 'line' }] }
    expect(describeChart(input)).toContain('60,000')
    expect(chartTableRow(input, 1)).toContain('60,000')
  })

  it('an explicit format still wins', () => {
    expect(makeTicks({ min: 0, max: 60000 }, 0, 300, 5, plain).map((t) => t.label)).toContain('60000')
  })
})

describe('currency', () => {
  it('groups thousands', () => {
    expect(currency('$')(60000)).toBe('$60,000')
    expect(currency('€', 2)(1234.5)).toBe('€1,234.50')
    expect(currency('$')(-1200)).toBe('-$1,200')
    expect(currency('$')(5)).toBe('$5')
    expect(currency('$')(1234567)).toBe('$1,234,567')
  })
})
