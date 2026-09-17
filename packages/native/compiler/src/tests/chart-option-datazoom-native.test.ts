import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * An ECharts `dataZoom` on a cartesian OptionChart lowers onto the plot host's
 * own zoom: inside → pinch / pan, slider → the navigator, start / end → the
 * opening window, zoomLock / minSpan / maxSpan → the limits every gesture is
 * held to, and filterMode none pins the y extent — read through the web's own
 * `readDataZoom`, so both targets open on the same rows as the web.
 */
describe.each(['swift', 'kotlin'] as const)('OptionChart dataZoom on %s', (target) => {
  const check = (code: string) => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(code)).toMatchObject({ ok: true })
  }
  const app = (dataZoom: string) => `
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }, yAxis: {}, dataZoom: ${dataZoom}, series: [{ type: 'bar', data: [1, 2, 3, 4, 5, 6, 7, 80] }] }} height={260} />
}`

  it('inside + slider with an opening window and limits', () => {
    const r = transform(app(`[{ type: 'inside', start: 25, end: 75, zoomLock: true }, { type: 'slider', minSpan: 20 }]`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('navigatorDrag(')
    expect(r.code).toContain('limitZoomWindow(')
    expect(r.code).toContain(target === 'swift' ? 'ZoomWindow(start: 0.25, end: 0.75)' : 'ZoomWindow(start = 0.25, end = 0.75)')
    check(r.code)
  })

  it("an opening window alone slices the rows; filterMode 'none' pins the y extent", () => {
    const r = transform(app(`{ type: 'slider', show: false, start: 0, end: 50, filterMode: 'none' }`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('sliceRange(pyreonZoom')
    expect(r.code).not.toContain('navigatorDrag(')
    expect(r.code).toMatch(/max ?[:=] ?(8[0-9]|9[0-9]|100)\.0/)
    check(r.code)
  })

  it('names a y-axis zoom', () => {
    const r = transform(app(`[{ type: 'inside', yAxisIndex: 0 }]`), { target })
    expect(r.warnings).toEqual([expect.stringContaining('<OptionChart option.dataZoom[0]>: Only a zoom over the category x axis')])
  })
})
