/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for RangeSliderBase (2026-07-21 audit, roadmap B11) —
 * WAI-ARIA multi-thumb slider.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { RangeSliderBase, type RangeSliderState } from './index'

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

function mountRange(extra: Record<string, unknown>, testid: string) {
  let api: RangeSliderState | null = null
  const mounted = mountInBrowser(
    h(RangeSliderBase as never, {
      ...extra,
      children: (s: RangeSliderState) => {
        api = s
        return h(
          'div',
          { ...s.rootProps(), 'data-testid': testid },
          h(
            'div',
            { ...s.trackProps(), style: 'width:200px;height:4px' },
            h('span', { ...s.startThumbProps() }),
            h('span', { ...s.endThumbProps() }),
          ),
        )
      },
    }),
  )
  return { ...mounted, api: () => api! }
}

describe('RangeSliderBase — WAI-ARIA multi-thumb slider (real Chromium)', () => {
  it('two labeled role=slider thumbs; each min/max reflects the OTHER thumb', async () => {
    const { container, unmount } = mountRange({ defaultValue: [20, 80] as [number, number] }, 'rs-1')
    await flush()
    const thumbs = container.querySelectorAll('[role="slider"]')
    expect(thumbs.length).toBe(2)
    const [start, end] = [thumbs[0]!, thumbs[1]!]
    expect(start.getAttribute('aria-label')).toBe('Minimum value')
    expect(end.getAttribute('aria-label')).toBe('Maximum value')
    expect(start.getAttribute('aria-valuenow')).toBe('20')
    expect(end.getAttribute('aria-valuenow')).toBe('80')
    // APG multi-thumb: the start thumb's max is the end thumb's value.
    expect(start.getAttribute('aria-valuemax')).toBe('80')
    expect(end.getAttribute('aria-valuemin')).toBe('20')
    unmount()
  })

  it('per-thumb keyboard: arrows ±step LIVE; Home/End to bounds', async () => {
    const { container, unmount } = mountRange(
      { defaultValue: [20, 80] as [number, number], step: 5 },
      'rs-2',
    )
    await flush()
    const start = container.querySelector('[data-range-thumb="start"]')!
    key(start, 'ArrowRight')
    await flush()
    expect(start.getAttribute('aria-valuenow'), 'ArrowRight moves by step').toBe('25')
    key(start, 'Home')
    await flush()
    expect(start.getAttribute('aria-valuenow')).toBe('0')
    unmount()
  })

  it('thumbs CANNOT cross (minRange gap enforced)', async () => {
    const { api, unmount } = mountRange(
      { defaultValue: [40, 60] as [number, number], minRange: 10 },
      'rs-3',
    )
    await flush()
    api().setStart(95) // above end → clamps to hi − minRange
    await flush()
    expect(api().value()).toEqual([50, 60])
    api().setEnd(10) // below start → clamps to lo + minRange
    await flush()
    expect(api().value()).toEqual([50, 60])
    unmount()
  })

  it('track click moves the NEAREST thumb', async () => {
    const { container, api, unmount } = mountRange(
      { defaultValue: [20, 80] as [number, number] },
      'rs-4',
    )
    await flush()
    const track = container.querySelector('[data-range-track]') as HTMLElement
    const rect = track.getBoundingClientRect()
    // Click at ~90% — nearest is the END thumb.
    track.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: rect.left + rect.width * 0.9, bubbles: true }),
    )
    await flush()
    expect(api().value()[1], 'end thumb moved toward the click').toBe(90)
    expect(api().value()[0], 'start thumb untouched').toBe(20)
    unmount()
  })

  it('localizable labels + valuetext reach the DOM', async () => {
    const { container, unmount } = mountRange(
      {
        defaultValue: [1, 3] as [number, number],
        labels: { start: 'Od', end: 'Do', startValue: (v: number) => `${v} Kč` },
      },
      'rs-5',
    )
    await flush()
    const start = container.querySelector('[data-range-thumb="start"]')!
    expect(start.getAttribute('aria-label')).toBe('Od')
    expect(start.getAttribute('aria-valuetext')).toBe('1 Kč')
    expect(container.querySelector('[data-range-thumb="end"]')!.getAttribute('aria-label')).toBe(
      'Do',
    )
    unmount()
  })
})
