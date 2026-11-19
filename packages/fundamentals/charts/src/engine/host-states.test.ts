// `withItemStates`: hover emphasis and selection as a wrapper over a host spec. The wiring into a live canvas is
// measured in real Chromium (geo-states.browser.test.tsx); this file drives the wrapper's own logic through the same
// hooks the host calls (tooltip / leave / select / pick / track / render / a11y / describe) with a plain spec.
import { effect } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { describeChart } from './a11y'
import type { A11yInput } from './a11y'
import { withItemStates } from './host-states'
import type { ItemStates, StatefulHostSpec } from './host-states'
import { defaultTheme } from './render'
import type { DrawCmd, Rect } from './types'

/** Three items laid out left to right, 10 units wide each; an x past 30 is empty ground. */
interface Strip {
  names: string[]
}

const LAYOUT: Strip = { names: ['North', 'South', 'East'] }
const measure = (text: string, fontSize: number): number => text.length * fontSize * 0.5
const box: Rect = { x: 0, y: 0, w: 30, h: 10 }

function makeSpec(props: StatefulHostSpec<Strip>['props'], over: Partial<StatefulHostSpec<Strip>> = {}) {
  const seen: ItemStates[] = []
  const raw: StatefulHostSpec<Strip> = {
    props,
    defaultHeight: 10,
    track: vi.fn(),
    layout: () => LAYOUT,
    render: (...args: Parameters<StatefulHostSpec<Strip>['render']>) => {
      seen.push(args[5])
      return [] as DrawCmd[]
    },
    states: {
      at: (layout, px) => (px >= 0 && px < layout.names.length * 10 ? Math.floor(px / 10) : -1),
      label: (layout, i) => layout.names[i] ?? '',
    },
    a11y: (layout): A11yInput => ({ title: 'Regions', categories: layout.names, series: [] }),
    caption: 'Regions',
    ...over,
  }
  const host = withItemStates(raw)
  const paint = (): ItemStates => {
    host.render(LAYOUT, measure, defaultTheme, 1, 0)
    return seen[seen.length - 1]!
  }

  return { raw, host, paint }
}

describe('withItemStates — hover', () => {
  it('the item under the pointer is the hover state, and leaving clears it', () => {
    const leave = vi.fn()
    const { host, paint } = makeSpec({}, { leave })
    expect(paint().hover).toBe(-1)
    host.tooltip!(LAYOUT, 15, 5, defaultTheme, false)
    expect(paint().hover).toBe(1)
    host.tooltip!(LAYOUT, 99, 5, defaultTheme, false)
    expect(paint().hover).toBe(-1)
    host.tooltip!(LAYOUT, 25, 5, defaultTheme, false)
    host.leave!()
    expect(paint().hover).toBe(-1)
    expect(leave).toHaveBeenCalledTimes(1)
  })

  it('emphasis: false paints no hover, though the pointer still moves it', () => {
    const { host, paint } = makeSpec({ emphasis: false })
    host.tooltip!(LAYOUT, 5, 5, defaultTheme, false)
    expect(paint().hover).toBe(-1)
  })

  it('answers the family tooltip only when the app turned the tooltip on', () => {
    const tooltip = vi.fn(() => ['North: 3'])
    const off = makeSpec({}, { tooltip })
    expect(off.host.tooltip!(LAYOUT, 5, 5, defaultTheme, false)).toBeNull()
    expect(tooltip).not.toHaveBeenCalled()
    const on = makeSpec({ tooltip: true }, { tooltip })
    expect(on.host.tooltip!(LAYOUT, 5, 5, defaultTheme, true)).toEqual(['North: 3'])
    expect(tooltip).toHaveBeenCalledWith(LAYOUT, 5, 5, defaultTheme, true)
    // A tooltip asked for, but a family without one, is still no box.
    expect(makeSpec({ tooltip: true }).host.tooltip!(LAYOUT, 5, 5, defaultTheme, false)).toBeNull()
  })
})

describe('withItemStates — selection', () => {
  it('is off by default: a click selects nothing and reports nothing', () => {
    const onSelectionChange = vi.fn()
    const select = vi.fn()
    const { host, paint } = makeSpec({ onSelectionChange }, { select })
    host.select!(LAYOUT, 5, 5)
    expect(paint().selected).toEqual([])
    expect(onSelectionChange).not.toHaveBeenCalled()
    // The family's own click hook still runs.
    expect(select).toHaveBeenCalledWith(LAYOUT, 5, 5)
  })

  it("'single' replaces the selection, and a second click on the same item clears it", () => {
    const onSelectionChange = vi.fn()
    const { host, paint } = makeSpec({ selectedMode: 'single', onSelectionChange })
    host.select!(LAYOUT, 5, 5)
    expect(paint().selected).toEqual([0])
    host.select!(LAYOUT, 25, 5)
    expect(paint().selected).toEqual([2])
    host.select!(LAYOUT, 25, 5)
    expect(paint().selected).toEqual([])
    expect(onSelectionChange.mock.calls).toEqual([[[0]], [[2]], [[]]])
  })

  it("'multiple' toggles items in selection order, by click and by keyboard pick alike", () => {
    const pick = vi.fn()
    const { host, paint } = makeSpec({ selectedMode: 'multiple' }, { pick })
    host.select!(LAYOUT, 25, 5)
    host.pick!(LAYOUT, 0)
    expect(paint().selected).toEqual([2, 0])
    host.pick!(LAYOUT, 2)
    expect(paint().selected).toEqual([0])
    expect(pick).toHaveBeenCalledTimes(2)
  })

  it('ignores a click on empty ground and an index outside the items', () => {
    const onSelectionChange = vi.fn()
    const { host, paint } = makeSpec({ selectedMode: 'multiple', onSelectionChange })
    host.select!(LAYOUT, 99, 5)
    host.pick!(LAYOUT, 3)
    host.pick!(LAYOUT, -1)
    expect(paint().selected).toEqual([])
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('hands the app a copy, so mutating it cannot change the chart', () => {
    let got: number[] = []
    const { host, paint } = makeSpec({ selectedMode: 'multiple', onSelectionChange: (s) => (got = s) })
    host.pick!(LAYOUT, 1)
    got.push(2)
    expect(paint().selected).toEqual([1])
  })
})

describe('withItemStates — what the host reads', () => {
  it('the host always gets the pointer hooks, and a repaint caused by a state change snaps', () => {
    const { host } = makeSpec({ selectedMode: 'single', updateAnimation: true, width: 300 })
    expect(host.props.tooltip).toBe(true)
    expect(host.props.width).toBe(300)
    // A data repaint keeps the app's update animation.
    host.track()
    expect(host.props.updateAnimation).toBe(true)
    // The repaint that follows a hover or a selection does not tween.
    host.tooltip!(LAYOUT, 5, 5, defaultTheme, false)
    host.track()
    expect(host.props.updateAnimation).toBe(false)
    // ...and the next one, with no new state, animates again.
    host.track()
    expect(host.props.updateAnimation).toBe(true)
    host.pick!(LAYOUT, 1)
    host.track()
    expect(host.props.updateAnimation).toBe(false)
  })

  it('a hover that does not change the item is not a state change', () => {
    const { host } = makeSpec({ updateAnimation: true })
    host.tooltip!(LAYOUT, 5, 5, defaultTheme, false)
    host.track()
    host.tooltip!(LAYOUT, 7, 5, defaultTheme, false)
    host.track()
    expect(host.props.updateAnimation).toBe(true)
  })

  it('track reads the family inputs and both states, so a hover or a selection repaints', () => {
    const { raw, host } = makeSpec({ selectedMode: 'single' })
    let runs = 0
    const stop = effect(() => {
      host.track()
      runs++
    })
    expect(runs).toBe(1)
    host.tooltip!(LAYOUT, 15, 5, defaultTheme, false)
    expect(runs).toBe(2)
    host.select!(LAYOUT, 15, 5)
    expect(runs).toBe(3)
    expect(raw.track).toHaveBeenCalledTimes(3)
    stop.dispose()
  })

  it('names the selected rows in the accessible table and the description', () => {
    const { host } = makeSpec({ selectedMode: 'multiple' })
    const plain = describeChart({ title: 'Regions', categories: LAYOUT.names, series: [] })
    expect(host.a11y(LAYOUT).categories).toEqual(['North', 'South', 'East'])
    expect(host.describe!(LAYOUT)).toBe(plain)
    host.pick!(LAYOUT, 2)
    host.pick!(LAYOUT, 0)
    expect(host.a11y(LAYOUT).categories).toEqual(['North (selected)', 'South', 'East (selected)'])
    expect(host.describe!(LAYOUT)).toBe(`${plain} Selected: East, North.`)
  })

  it("builds on the family's own description when it has one", () => {
    const { host } = makeSpec({ selectedMode: 'single' }, { describe: () => 'A map of three regions.' })
    expect(host.describe!(LAYOUT)).toBe('A map of three regions.')
    host.pick!(LAYOUT, 1)
    expect(host.describe!(LAYOUT)).toBe('A map of three regions. Selected: South.')
  })

  it('keeps the rest of the spec as it was', () => {
    const { raw, host } = makeSpec({})
    expect(host.layout).toBe(raw.layout)
    expect(host.caption).toBe('Regions')
    expect(host.layout(box, measure, defaultTheme)).toBe(LAYOUT)
  })
})
