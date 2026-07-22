/**
 * State-machine coverage for `RangeSliderBase` — the headless dual-thumb range
 * slider. Drives the `RangeSliderState` object directly: setStart/setEnd
 * clamping (stepped, minRange gap so thumbs never cross), per-thumb keyboard
 * (arrows ±step, PageUp/Down ±largeStep, Home/End), aria-value* on each thumb,
 * and the track pointer-down bail. Pure signal logic → happy-dom + Chromium.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { RangeSliderBase, type RangeSliderState } from './index'

const mount = (props: Record<string, unknown> = {}): RangeSliderState => {
  let s: RangeSliderState | undefined
  mountInBrowser(
    h(RangeSliderBase as never, {
      min: 0,
      max: 100,
      step: 1,
      defaultValue: [20, 80],
      ...props,
      children: (st: RangeSliderState) => ((s = st), h('div', null)),
    }),
  )
  if (!s) throw new Error('no state')
  return s
}

const kd = (key: string) => ({ key, preventDefault() {} }) as unknown as KeyboardEvent
const now = (v: unknown) => (v as () => number)()

describe('RangeSliderBase — setStart / setEnd clamping', () => {
  it('setStart/setEnd move the bounds; onChange fires with the tuple', () => {
    const calls: [number, number][] = []
    const s = mount({ onChange: (v: [number, number]) => calls.push(v) })
    expect(s.value()).toEqual([20, 80])
    s.setStart(30)
    expect(s.value()).toEqual([30, 80])
    s.setEnd(70)
    expect(s.value()).toEqual([30, 70])
    expect(calls[calls.length - 1]).toEqual([30, 70])
  })

  it('thumbs never cross (minRange gap enforced) and clamp to min/max', () => {
    const s = mount({ minRange: 10 })
    s.setStart(200) // clamps to hi(80) − minRange(10) = 70
    expect(s.value()[0]).toBe(70)
    s.setEnd(-50) // clamps to lo(70) + minRange(10) = 80
    expect(s.value()[1]).toBe(80)
  })

  it('values snap to the step', () => {
    const s = mount({ step: 5, defaultValue: [0, 100] })
    s.setStart(13) // snaps to nearest 5 → 15
    expect(s.value()[0] % 5).toBe(0)
  })
})

describe('RangeSliderBase — per-thumb keyboard', () => {
  it('start thumb: arrows ±step, PageUp/Down ±largeStep, Home→min, End→hi−minRange', () => {
    const s = mount({ minRange: 0 })
    const onKey = s.startThumbProps().onKeyDown as (e: KeyboardEvent) => void
    onKey(kd('ArrowRight'))
    expect(s.value()[0]).toBe(21)
    onKey(kd('ArrowLeft'))
    expect(s.value()[0]).toBe(20)
    onKey(kd('PageUp'))
    expect(s.value()[0]).toBe(30) // +largeStep (10)
    onKey(kd('PageDown'))
    expect(s.value()[0]).toBe(20)
    onKey(kd('Home'))
    expect(s.value()[0]).toBe(0) // → min
    onKey(kd('End'))
    expect(s.value()[0]).toBe(80) // → hi (minRange 0)
    onKey(kd('x')) // no-op
    expect(s.value()[0]).toBe(80)
  })

  it('end thumb: Home→lo+minRange, End→max', () => {
    const s = mount({ minRange: 0 })
    const onKey = s.endThumbProps().onKeyDown as (e: KeyboardEvent) => void
    onKey(kd('End'))
    expect(s.value()[1]).toBe(100) // → max
    onKey(kd('Home'))
    expect(s.value()[1]).toBe(20) // → lo (minRange 0)
    onKey(kd('ArrowUp'))
    expect(s.value()[1]).toBe(21)
  })

  it('disabled: keyboard is a no-op', () => {
    const s = mount({ disabled: true })
    ;(s.startThumbProps().onKeyDown as (e: KeyboardEvent) => void)(kd('ArrowRight'))
    expect(s.value()).toEqual([20, 80])
  })
})

describe('RangeSliderBase — thumb ARIA + track', () => {
  it('each thumb exposes role=slider with aria-valuenow/min/max + tabIndex', () => {
    const s = mount()
    const start = s.startThumbProps()
    expect(start.role).toBe('slider')
    expect(now(start['aria-valuenow'])).toBe(20)
    expect(start.tabIndex).toBe(0)
    const end = s.endThumbProps()
    expect(now(end['aria-valuenow'])).toBe(80)
  })

  it('trackProps pointerdown bails without layout (rect width 0) — no throw', () => {
    const s = mount()
    const onDown = s.trackProps().onPointerDown as (e: PointerEvent) => void
    expect(() =>
      onDown({
        currentTarget: { getBoundingClientRect: () => ({ width: 0, left: 0 }) },
        clientX: 50,
      } as unknown as PointerEvent),
    ).not.toThrow()
    expect(s.value()).toEqual([20, 80]) // unchanged
  })

  it('renders null (no throw) when children is not a render function', () => {
    expect(() => mountInBrowser(h(RangeSliderBase as never, {}))).not.toThrow()
  })
})
