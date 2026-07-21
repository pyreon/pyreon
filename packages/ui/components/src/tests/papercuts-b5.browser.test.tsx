/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for the B5 paper-cuts batch (2026-07-21 audit):
 * - NavLink `state="active"` announces `aria-current="page"` (was visual-only)
 *   and `state="disabled"` leaves the tab order (was a keyboard-focusable,
 *   Enter-activatable "disabled" anchor) — both via the .attrs() callback.
 * - MenuItem `small` + NavLink meet the touch-target floor (minHeight 32px —
 *   the MultiSelect compact-padding pattern).
 * - Box/Center (empty `.theme()` removed) still render + carry their Element
 *   layout attrs.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__
import Box from '../components/Box'
import Center from '../components/Center'
import { MenuItem } from '../components/Menu'
import NavLink from '../components/NavLink'

describe('B5 paper-cuts (real Chromium)', () => {
  it('NavLink state="active" carries aria-current="page"; plain NavLink does not', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(NavLink as never, { href: '#', state: 'active', 'data-testid': 'nl-a' }, 'Home'),
        h(NavLink as never, { href: '#', 'data-testid': 'nl-p' }, 'Docs'),
      ),
    )
    await flush()
    expect(
      container.querySelector('[data-testid="nl-a"]')!.getAttribute('aria-current'),
    ).toBe('page')
    expect(container.querySelector('[data-testid="nl-p"]')!.getAttribute('aria-current')).toBeNull()
    unmount()
  })

  it('NavLink state="disabled" leaves the tab order + announces aria-disabled', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(NavLink as never, { href: '#', state: 'disabled', 'data-testid': 'nl-d' }, 'Admin'),
      ),
    )
    await flush()
    const el = container.querySelector('[data-testid="nl-d"]') as HTMLElement
    expect(el.getAttribute('aria-disabled')).toBe('true')
    expect(el.tabIndex, 'disabled anchor must not be keyboard-focusable').toBe(-1)
    unmount()
  })

  // Layout measurement is real-Chromium-only — happy-dom (which re-runs this
  // file under the node config) has no layout engine, so getBoundingClientRect
  // is 0 there. Same __vitest_browser__ gating as the trusted-input specs.
  it.skipIf(!isBrowser)('MenuItem small + NavLink meet the 32px touch-target floor', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(MenuItem as never, { size: 'small', 'data-testid': 'mi-s' }, 'Rename'),
        h(NavLink as never, { href: '#', 'data-testid': 'nl-t' }, 'Home'),
      ),
    )
    await flush()
    const mi = container.querySelector('[data-testid="mi-s"]') as HTMLElement
    const nl = container.querySelector('[data-testid="nl-t"]') as HTMLElement
    expect(
      mi.getBoundingClientRect().height,
      'small MenuItem must reach the touch floor',
    ).toBeGreaterThanOrEqual(32)
    expect(
      nl.getBoundingClientRect().height,
      'NavLink must reach the touch floor',
    ).toBeGreaterThanOrEqual(32)
    unmount()
  })

  it('Box/Center render fine without the removed empty .theme() chains', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Box as never, { 'data-testid': 'bx' }, 'in a box'),
        h(Center as never, { 'data-testid': 'ct' }, 'centered'),
      ),
    )
    await flush()
    const bx = container.querySelector('[data-testid="bx"]') as HTMLElement
    const ct = container.querySelector('[data-testid="ct"]') as HTMLElement
    expect(bx.textContent).toBe('in a box')
    // Center's layout comes from Element attrs (alignX/alignY/block), not the
    // removed empty theme — flex centering must still be live.
    expect(getComputedStyle(ct).display).toContain('flex')
    expect(getComputedStyle(ct).justifyContent).toBe('center')
    unmount()
  })
})
