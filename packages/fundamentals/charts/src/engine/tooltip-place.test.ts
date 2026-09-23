import { describe, expect, it } from 'vitest'
import { readTooltipOption } from './option-tooltip'
import { tooltipPlace } from './tooltip-place'

const specOf = (position: unknown) => readTooltipOption({ position }, () => undefined)!
const view = { w: 400, h: 200 }
const size = { w: 40, h: 20 }
const at = { x: 100, y: 50 }
const bounds = { x: 0, y: 0, w: 400, h: 200 }

describe('tooltipPlace — ECharts\' tooltip.position', () => {
  it('no position follows the pointer', () => {
    expect(tooltipPlace(specOf(undefined), null, {}, view)).toBeUndefined()
  })
  it('a fixed point: pixels and percents of the view', () => {
    expect(tooltipPlace(specOf([10, '50%']), null, {}, view)!(at, size, bounds)).toEqual({ x: 10, y: 100 })
  })
  it('a side sits against the anchor, else against the pointer', () => {
    const anchor = { x: 200, y: 100, w: 20, h: 10 }
    expect(tooltipPlace(specOf('top'), anchor, {}, view)!(at, size, bounds)).toEqual({ x: 190, y: 70 })
    expect(tooltipPlace(specOf('bottom'), anchor, {}, view)!(at, size, bounds)).toEqual({ x: 190, y: 120 })
    expect(tooltipPlace(specOf('left'), anchor, {}, view)!(at, size, bounds)).toEqual({ x: 150, y: 95 })
    expect(tooltipPlace(specOf('right'), anchor, {}, view)!(at, size, bounds)).toEqual({ x: 230, y: 95 })
    expect(tooltipPlace(specOf('inside'), null, {}, view)!(at, size, bounds)).toEqual({ x: 80, y: 40 })
  })
  it('a function may return a side, a point with r:/b: offsets, an edge object, or anything else (the pointer)', () => {
    const params = { name: 'x' }
    const seen: unknown[] = []
    const place = (out: unknown) =>
      tooltipPlace(
        specOf((...args: unknown[]) => {
          seen.push(args)
          return out
        }),
        { x: 10, y: 10, w: 4, h: 4 },
        params,
        view,
      )!(at, size, bounds)
    expect(place('bottom')).toEqual({ x: -8, y: 24 })
    expect(place(['r:5', 'b:5'])).toEqual({ x: 355, y: 175 })
    expect(place(['bogus', 7])).toEqual({ x: 0, y: 7 })
    expect(place({ right: 10, bottom: 20 })).toEqual({ x: 350, y: 160 })
    expect(place({ left: '25%', top: 3 })).toEqual({ x: 100, y: 3 })
    expect(place({})).toEqual(at)
    expect(place(42)).toEqual(at)
    expect(seen[0]).toEqual([[100, 50], params, null, { x: 10, y: 10, width: 4, height: 4 }, { contentSize: [40, 20], viewSize: [400, 200] }])
    const noAnchor: unknown[] = []
    tooltipPlace(specOf((...a: unknown[]) => (noAnchor.push(a), 'top')), null, params, view)!(at, size, bounds)
    expect((noAnchor[0] as unknown[])[3]).toBeUndefined()
  })
})
