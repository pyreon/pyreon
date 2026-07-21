/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for the B18 sub-components batch (2026-07-21 audit):
 * PaginationItem/Prev/Next/Ellipsis (aria-current="page"), Stepper ol/li +
 * aria-current="step", Card sections (full-bleed + dividers), TimelineItem.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__
import Card, { CardHeader, CardSection } from '../components/Card'
import Pagination, {
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrev,
} from '../components/Pagination'
import Stepper, { Step } from '../components/Stepper'
import Timeline, { TimelineItem } from '../components/Timeline'

describe('B18 sub-components (real Chromium)', () => {
  it('PaginationItem active carries aria-current="page"; Prev/Next labeled; Ellipsis hidden', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          Pagination as never,
          {},
          h(PaginationPrev as never, { 'data-testid': 'pg-prev' }, '‹'),
          h(PaginationItem as never, { 'data-testid': 'pg-1' }, '1'),
          h(PaginationItem as never, { state: 'active', 'data-testid': 'pg-2' }, '2'),
          h(PaginationEllipsis as never, { 'data-testid': 'pg-e' }, '…'),
          h(PaginationNext as never, { 'data-testid': 'pg-next' }, '›'),
        ),
      ),
    )
    await flush()
    const q = (id: string) => container.querySelector(`[data-testid="${id}"]`)!
    expect(q('pg-2').getAttribute('aria-current')).toBe('page')
    expect(q('pg-1').getAttribute('aria-current')).toBeNull()
    expect(q('pg-1').getAttribute('type'), 'never submits forms').toBe('button')
    expect(q('pg-prev').getAttribute('aria-label')).toBe('Previous page')
    expect(q('pg-next').getAttribute('aria-label')).toBe('Next page')
    expect(q('pg-e').getAttribute('aria-hidden')).toBe('true')
    expect((q('pg-e') as HTMLElement).tabIndex).toBeLessThan(0)
    unmount()
  })

  it('Stepper renders ol > li; the active Step announces aria-current="step"', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          Stepper as never,
          { 'data-testid': 'st' },
          h(Step as never, { state: 'completed', 'data-testid': 'st-1' }, 'Account'),
          h(Step as never, { state: 'active', 'data-testid': 'st-2' }, 'Payment'),
          h(Step as never, { 'data-testid': 'st-3' }, 'Review'),
        ),
      ),
    )
    await flush()
    const root = container.querySelector('[data-testid="st"]') as HTMLElement
    expect(root.tagName, 'steps are an ordered list').toBe('OL')
    const active = container.querySelector('[data-testid="st-2"]') as HTMLElement
    expect(active.tagName).toBe('LI')
    expect(active.getAttribute('aria-current')).toBe('step')
    expect(
      container.querySelector('[data-testid="st-1"]')!.getAttribute('aria-current'),
    ).toBeNull()
    unmount()
  })

  it.skipIf(!isBrowser)('CardSection full-bleeds past Card padding; CardHeader draws its divider', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          Card as never,
          { 'data-testid': 'cd' },
          h(CardHeader as never, { 'data-testid': 'cd-h' }, 'Title'),
          h(CardSection as never, { 'data-testid': 'cd-s' }, 'bleed'),
          h('div', { 'data-testid': 'cd-c' }, 'content'),
        ),
      ),
    )
    await flush()
    const card = container.querySelector('[data-testid="cd"]')!.getBoundingClientRect()
    const section = container.querySelector('[data-testid="cd-s"]')!.getBoundingClientRect()
    const content = container.querySelector('[data-testid="cd-c"]')!.getBoundingClientRect()
    expect(section.left, 'section bleeds to the card edge').toBeLessThan(content.left)
    expect(Math.round(section.left), 'flush with the card box').toBe(Math.round(card.left))
    const header = container.querySelector('[data-testid="cd-h"]') as Element
    expect(
      Number.parseFloat(getComputedStyle(header).borderBottomWidth),
      'header divider',
    ).toBeGreaterThan(0)
    unmount()
  })

  it.skipIf(!isBrowser)('TimelineItem renders its marker on the rail; completed uses a ✓ glyph', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          Timeline as never,
          {},
          h(TimelineItem as never, { 'data-testid': 'tl-1' }, 'Created'),
          h(TimelineItem as never, { state: 'completed', 'data-testid': 'tl-2' }, 'Shipped'),
        ),
      ),
    )
    await flush()
    const plain = container.querySelector('[data-testid="tl-1"]') as Element
    const done = container.querySelector('[data-testid="tl-2"]') as Element
    expect(getComputedStyle(plain, '::before').content, 'marker dot exists').toBe('""')
    expect(
      getComputedStyle(done, '::before').content,
      'completed marker is a NON-COLOR ✓ signal (WCAG 1.4.1)',
    ).toBe('"✓"')
    unmount()
  })
})
