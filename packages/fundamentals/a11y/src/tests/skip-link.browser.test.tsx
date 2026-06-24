/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium proof of <SkipLink> — the WCAG 2.4.1 "skip to content" link.
 * Verifies the hide-until-focus behavior via real getComputedStyle (clipped by
 * default, revealed on focus, clipped again on blur) and that activation moves
 * real keyboard focus to the target landmark, adding a programmatic-focus
 * tabindex to a non-focusable target.
 *
 * Bisect: remove `moveFocusToTarget(href)` from onClick → the focus-move spec
 * fails (activeElement stays off the target, no tabindex added); drop the
 * focused-signal style toggle → the reveal/blur specs fail.
 */
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { SkipLink } from '../skip-link'

const nextFrame = (): Promise<void> =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

describe('SkipLink (real Chromium)', () => {
  it('renders an anchor that is clipped (hidden) but kept in the DOM + tab order', async () => {
    const { container, unmount } = mountInBrowser(<SkipLink href="#main">Skip to content</SkipLink>)
    await flush()
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a).not.toBeNull()
    expect(a.getAttribute('href')).toBe('#main')
    expect(a.textContent).toBe('Skip to content')
    const cs = getComputedStyle(a)
    expect(cs.position).toBe('absolute')
    expect(cs.width).toBe('1px')
    expect(cs.height).toBe('1px')
    expect(cs.display).not.toBe('none') // focusable — not removed from the tree
    unmount()
  })

  it('reveals on focus and clips again on blur', async () => {
    const { container, unmount } = mountInBrowser(<SkipLink href="#main">Skip</SkipLink>)
    await flush()
    const a = container.querySelector('a') as HTMLAnchorElement
    a.focus()
    await nextFrame()
    const revealed = getComputedStyle(a)
    expect(revealed.position).toBe('fixed') // pulled to the top, no longer clipped
    expect(revealed.width).not.toBe('1px')
    a.blur()
    await nextFrame()
    expect(getComputedStyle(a).position).toBe('absolute') // clipped again
    unmount()
  })

  it('moves keyboard focus to the target on activation (adds tabindex if needed)', async () => {
    const { container, unmount } = mountInBrowser(
      <div>
        <SkipLink href="#main">Skip</SkipLink>
        <main id="main">Main content</main>
      </div>,
    )
    await flush()
    const a = container.querySelector('a') as HTMLAnchorElement
    const main = container.querySelector('#main') as HTMLElement
    expect(main.hasAttribute('tabindex')).toBe(false)
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await nextFrame()
    expect(main.getAttribute('tabindex')).toBe('-1') // made programmatically focusable
    expect(document.activeElement).toBe(main) // focus actually moved
    unmount()
  })

  it('honours a custom href and children', async () => {
    const { container, unmount } = mountInBrowser(<SkipLink href="#content">Jump to content</SkipLink>)
    await flush()
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('#content')
    expect(a.textContent).toBe('Jump to content')
    unmount()
  })
})
