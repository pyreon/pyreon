/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for the ELEMENT-FIRST COMPOSITION pilot (2026-07-21
 * architecture decision): the styled Rating renders its OWN Element markup
 * (batteries-included — `<Rating defaultValue={3} />` just works), layout
 * comes from Element props (zero hand-written `display` CSS), the fill is
 * static CSS on the base's accessor'd `data-filled` attribute, and the
 * consumer render-prop remains as the escape hatch.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import type { RatingState } from '@pyreon/ui-primitives'
import { describe, expect, it } from 'vitest'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__
import Rating from '../components/Rating'

const filled = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[role="radio"]')).filter(
    (s) => s.getAttribute('data-filled') === 'true',
  ).length

describe('Rating — Element-first batteries-included composition (real Chromium)', () => {
  it('renders a complete accessible star row OUT OF THE BOX', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Rating as never, { defaultValue: 3, 'data-testid': 'r1' })),
    )
    await flush()
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement
    expect(group, 'zero-config Rating renders its own markup').not.toBeNull()
    expect(group.getAttribute('aria-label')).toBe('Rating')
    expect(container.querySelectorAll('[role="radio"]').length).toBe(5)
    expect(filled(container), 'value=3 fills three stars').toBe(3)
    unmount()
  })

  it('click updates value + fill LIVE (accessor data-filled through Element)', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Rating as never, { defaultValue: 2 })),
    )
    await flush()
    const stars = container.querySelectorAll<HTMLElement>('[role="radio"]')
    stars[4]!.click()
    await flush()
    expect(filled(container), 'clicking star 5 fills all five').toBe(5)
    expect(stars[4]!.getAttribute('aria-checked')).toBe('true')
    unmount()
  })

  it.skipIf(!isBrowser)('layout comes from Element PROPS — flex row with zero display CSS of our own', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Rating as never, { defaultValue: 1 })),
    )
    await flush()
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement
    // Element's direction='inline' + alignY='center' produce the flex row —
    // the Rating theme itself declares NO display property (grep-locked by
    // the source; this asserts the rendered result).
    expect(getComputedStyle(group).display).toContain('flex')
    expect(getComputedStyle(group).alignItems).toBe('center')
    unmount()
  })

  it('the consumer render-prop escape hatch overrides the built-in markup', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Rating as never, {
          defaultValue: 1,
          children: (s: RatingState) =>
            h('div', { 'data-testid': 'custom', 'data-max': s.max }, 'custom UI'),
        }),
      ),
    )
    await flush()
    expect(container.querySelector('[data-testid="custom"]')).not.toBeNull()
    expect(container.querySelector('[role="radiogroup"]'), 'built-in markup replaced').toBeNull()
    unmount()
  })
})
