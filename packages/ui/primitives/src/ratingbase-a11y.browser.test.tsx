/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for RatingBase (2026-07-21 audit, roadmap B12) —
 * WAI-ARIA radiogroup star rating.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { RatingBase, type RatingState } from './index'

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

function mountRating(extra: Record<string, unknown>, testid: string) {
  return mountInBrowser(
    h(RatingBase as never, {
      ...extra,
      children: (s: RatingState) =>
        h(
          'div',
          { ...s.rootProps(), 'data-testid': testid },
          // Static star render — accessor props stay live through the spread.
          ...Array.from({ length: s.max }, (_, i) => h('span', { ...s.getStarProps(i + 1) }, '★')),
        ),
    }),
  )
}

describe('RatingBase — WAI-ARIA radiogroup rating (real Chromium)', () => {
  it('renders a labeled radiogroup of max radios with STRING aria-checked', async () => {
    const { container, unmount } = mountRating({ defaultValue: 3 }, 'rt-1')
    await flush()
    const group = container.querySelector('[role="radiogroup"]')!
    expect(group.getAttribute('aria-label')).toBe('Rating')
    const stars = container.querySelectorAll('[role="radio"]')
    expect(stars.length).toBe(5)
    expect(stars[2]!.getAttribute('aria-checked')).toBe('true')
    expect(stars[0]!.getAttribute('aria-checked')).toBe('false')
    expect(stars[2]!.getAttribute('aria-label')).toBe('3 of 5 stars')
    unmount()
  })

  it('click sets the value and aria-checked MOVES; clicking the checked star clears', async () => {
    const { container, unmount } = mountRating({}, 'rt-2')
    await flush()
    const stars = container.querySelectorAll<HTMLElement>('[role="radio"]')
    stars[3]!.click()
    await flush()
    expect(stars[3]!.getAttribute('aria-checked'), 'clicked star becomes checked').toBe('true')
    stars[3]!.click()
    await flush()
    expect(stars[3]!.getAttribute('aria-checked'), 'clicking the checked star clears').toBe('false')
    unmount()
  })

  it('arrows adjust the value (value-adjust convention) + Home/End bounds', async () => {
    const { container, unmount } = mountRating({ defaultValue: 2 }, 'rt-3')
    await flush()
    const stars = container.querySelectorAll<HTMLElement>('[role="radio"]')
    key(stars[1]!, 'ArrowRight')
    await flush()
    expect(stars[2]!.getAttribute('aria-checked'), 'ArrowRight increases').toBe('true')
    key(stars[2]!, 'ArrowLeft')
    await flush()
    expect(stars[1]!.getAttribute('aria-checked'), 'ArrowLeft decreases').toBe('true')
    key(stars[1]!, 'End')
    await flush()
    expect(stars[4]!.getAttribute('aria-checked'), 'End jumps to max').toBe('true')
    unmount()
  })

  it('exactly ONE tab stop (checked star; star 1 when unrated)', async () => {
    const rated = mountRating({ defaultValue: 4 }, 'rt-4a')
    const unrated = mountRating({}, 'rt-4b')
    await flush()
    const stops = (c: HTMLElement) =>
      Array.from(c.querySelectorAll<HTMLElement>('[role="radio"]')).filter((e) => e.tabIndex === 0)
    expect(stops(rated.container).length).toBe(1)
    expect(stops(rated.container)[0]!.getAttribute('data-rating-value')).toBe('4')
    expect(stops(unrated.container).length).toBe(1)
    expect(stops(unrated.container)[0]!.getAttribute('data-rating-value')).toBe('1')
    rated.unmount()
    unrated.unmount()
  })

  it('readOnly ignores clicks + keys; custom labels reach the DOM', async () => {
    const { container, unmount } = mountRating(
      { defaultValue: 2, readOnly: true, labels: { group: 'Hodnocení', item: (v: number, m: number) => `${v} z ${m}` } },
      'rt-5',
    )
    await flush()
    const group = container.querySelector('[role="radiogroup"]')!
    expect(group.getAttribute('aria-label')).toBe('Hodnocení')
    const stars = container.querySelectorAll<HTMLElement>('[role="radio"]')
    expect(stars[0]!.getAttribute('aria-label')).toBe('1 z 5')
    stars[4]!.click()
    key(stars[1]!, 'ArrowRight')
    await flush()
    expect(stars[1]!.getAttribute('aria-checked'), 'readOnly keeps the value').toBe('true')
    expect(stars[4]!.getAttribute('aria-checked')).toBe('false')
    unmount()
  })
})
