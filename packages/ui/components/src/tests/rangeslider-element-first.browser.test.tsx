/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for the RangeSlider Element-first conversion (rollout
 * #3): batteries-included markup with the FULL a11y + hotkeys + i18n surface
 * wired out of the box.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__
import RangeSlider from '../components/RangeSlider'

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

describe('RangeSlider — Element-first batteries-included (real Chromium)', () => {
  it('A11Y out of the box: two labeled announced thumbs + track + fill render zero-config', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(RangeSlider as never, { defaultValue: [20, 80] as [number, number] })),
    )
    await flush()
    const thumbs = container.querySelectorAll('[role="slider"]')
    expect(thumbs.length, 'both thumbs render').toBe(2)
    expect(thumbs[0]!.getAttribute('aria-label')).toBe('Minimum value')
    expect(thumbs[0]!.getAttribute('aria-valuenow')).toBe('20')
    expect(container.querySelector('[data-range-track]')).not.toBeNull()
    expect(container.querySelector('[data-range-fill]')).not.toBeNull()
    unmount()
  })

  it.skipIf(!isBrowser)('HOTKEYS out of the box: arrows move the thumb AND its rendered position', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(RangeSlider as never, { defaultValue: [20, 80] as [number, number], step: 10 }),
      ),
    )
    await flush()
    const start = container.querySelector('[data-range-thumb="start"]') as HTMLElement
    const before = start.style.left
    key(start, 'ArrowRight')
    await flush()
    expect(start.getAttribute('aria-valuenow'), 'announced value moves').toBe('30')
    expect(start.style.left, 'rendered position moves with it').not.toBe(before)
    expect(start.style.left).toBe('30%')
    unmount()
  })

  it('I18N out of the box: the labels prop reaches the rendered thumbs', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(RangeSlider as never, {
          defaultValue: [1, 5] as [number, number],
          labels: { start: 'Od', end: 'Do', startValue: (v: number) => `${v} Kč` },
        }),
      ),
    )
    await flush()
    const start = container.querySelector('[data-range-thumb="start"]')!
    expect(start.getAttribute('aria-label')).toBe('Od')
    expect(start.getAttribute('aria-valuetext')).toBe('1 Kč')
    unmount()
  })

  it('render-prop escape hatch overrides the built-in markup', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(RangeSlider as never, {
          defaultValue: [0, 1] as [number, number],
          children: () => h('div', { 'data-testid': 'custom-range' }, 'custom'),
        }),
      ),
    )
    await flush()
    expect(container.querySelector('[data-testid="custom-range"]')).not.toBeNull()
    expect(container.querySelector('[data-range-track]'), 'built-in replaced').toBeNull()
    unmount()
  })
})
