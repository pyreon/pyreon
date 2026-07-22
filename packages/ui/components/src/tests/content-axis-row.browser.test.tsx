/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for the EF-4 content-axis sweep: on a SIMPLE (slot-less)
 * Element the slot-axis `direction`/`alignX`/`alignY` attrs are INERT —
 * children follow the CONTENT axis, which defaults to `rows` (column). So a
 * component declaring only `direction: 'inline'` stacked its multi-child
 * content VERTICALLY (the NavLink icon+label latent bug). The sweep pairs
 * every slot-axis declaration with contentDirection/contentAlignX/
 * contentAlignY so multi-child rows actually render as rows.
 *
 * Computed-style assertions are real-Chromium-only — gated on
 * __vitest_browser__ (happy-dom re-runs this file with no layout engine).
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__
import Button from '../components/Button'
import NavLink from '../components/NavLink'

describe('content-axis sweep — multi-child rows render as ROWS (real Chromium)', () => {
  it.skipIf(!isBrowser)('NavLink icon + label sit side by side, vertically centered', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          NavLink as never,
          { href: '#', 'data-testid': 'nl' },
          h('span', { 'data-testid': 'nl-icon' }, '★'),
          h('span', { 'data-testid': 'nl-label' }, 'Dashboard'),
        ),
      ),
    )
    await flush()
    const icon = container.querySelector('[data-testid="nl-icon"]') as HTMLElement
    const label = container.querySelector('[data-testid="nl-label"]') as HTMLElement
    // The layout box wrapping the children must be a flex ROW (pre-sweep:
    // content axis defaulted to `rows` → column → label rendered BELOW icon).
    const box = icon.parentElement as HTMLElement
    const cs = getComputedStyle(box)
    expect(cs.display, 'children box is flex').toContain('flex')
    expect(cs.flexDirection, 'row, not the inert-direction column').toBe('row')
    expect(cs.alignItems, 'contentAlignY center').toBe('center')
    const ir = icon.getBoundingClientRect()
    const lr = label.getBoundingClientRect()
    expect(lr.left, 'label sits to the RIGHT of the icon').toBeGreaterThan(ir.right - 1)
    unmount()
  })

  it.skipIf(!isBrowser)('Button children (icon + text) render inline-centered', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          Button as never,
          { 'data-testid': 'bt' },
          h('span', { 'data-testid': 'bt-icon' }, '＋'),
          h('span', { 'data-testid': 'bt-label' }, 'Add item'),
        ),
      ),
    )
    await flush()
    const icon = container.querySelector('[data-testid="bt-icon"]') as HTMLElement
    const label = container.querySelector('[data-testid="bt-label"]') as HTMLElement
    const cs = getComputedStyle(icon.parentElement as HTMLElement)
    expect(cs.flexDirection).toBe('row')
    expect(cs.justifyContent, 'contentAlignX center').toBe('center')
    expect(label.getBoundingClientRect().left).toBeGreaterThan(
      icon.getBoundingClientRect().right - 1,
    )
    unmount()
  })
})
