/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for ScrollArea + RingProgress (2026-07-21 audit,
 * roadmap B15 + B16).
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__
import RingProgress from '../components/RingProgress'
import ScrollArea from '../components/ScrollArea'

describe('ScrollArea (real Chromium)', () => {
  it.skipIf(!isBrowser)('overflowing content scrolls; region is focusable + named', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          ScrollArea as never,
          { 'data-testid': 'sa', style: 'max-height: 60px' },
          // Content-driven height (50 lines) — an explicit-height child gets
          // its height re-laid by the flex Element context in this harness,
          // so line content is the robust overflow source.
          h('div', {}, ...Array.from({ length: 50 }, (_, i) => h('p', {}, `line ${i}`))),
        ),
      ),
    )
    await flush()
    const sa = container.querySelector('[data-testid="sa"]') as HTMLElement
    expect(sa.scrollHeight, 'content overflows').toBeGreaterThan(sa.clientHeight)
    expect(getComputedStyle(sa).overflowY).toMatch(/auto|scroll/)
    expect(sa.tabIndex, 'keyboard-focusable scrollable region').toBe(0)
    expect(sa.getAttribute('role')).toBe('region')
    expect(sa.getAttribute('aria-label')).toBe('Scrollable content')
    unmount()
  })
})

describe('RingProgress (real Chromium)', () => {
  it('progressbar a11y contract + value-dependent arc', async () => {
    const a = mountInBrowser(h(PyreonUI, { theme }, h(RingProgress as never, { value: 25, 'data-testid': 'rp-25' })))
    const b = mountInBrowser(h(PyreonUI, { theme }, h(RingProgress as never, { value: 75, 'data-testid': 'rp-75' })))
    await flush()
    const q = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`)!
    const p25 = q(a.container, 'rp-25')
    expect(p25.getAttribute('role')).toBe('progressbar')
    expect(p25.getAttribute('aria-valuenow')).toBe('25')
    expect(p25.getAttribute('aria-label')).toBe('Progress')
    const off25 = q(a.container, 'rp-25').querySelectorAll('circle')[1]!.getAttribute('stroke-dashoffset')
    const off75 = q(b.container, 'rp-75').querySelectorAll('circle')[1]!.getAttribute('stroke-dashoffset')
    expect(Number.parseFloat(off25!), 'larger value = smaller offset').toBeGreaterThan(
      Number.parseFloat(off75!),
    )
    a.unmount()
    b.unmount()
  })

  it('a signal-driven value moves aria-valuenow AND the arc LIVE', async () => {
    const v = signal(10)
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(RingProgress as never, { value: () => v(), 'data-testid': 'rp-live' })),
    )
    await flush()
    const el = container.querySelector('[data-testid="rp-live"]')!
    const arc = el.querySelectorAll('circle')[1]!
    expect(el.getAttribute('aria-valuenow')).toBe('10')
    const before = Number.parseFloat(arc.getAttribute('stroke-dashoffset')!)

    v.set(90)
    await flush()
    expect(el.getAttribute('aria-valuenow'), 'announcement tracks the signal').toBe('90')
    expect(
      Number.parseFloat(arc.getAttribute('stroke-dashoffset')!),
      'arc tracks the signal',
    ).toBeLessThan(before)
    unmount()
  })
})
