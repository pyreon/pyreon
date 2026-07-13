/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium regression lock: the Overlay CONTENT subtree must NOT remount
 * when the resolved align flips at the viewport edge, and it must still read
 * the flipped `alignX` / `alignY` reactively IN PLACE.
 *
 * BUG SHAPE (pre-fix): the content-mount accessor read `align()` / `alignX()`
 * / `alignY()` as VALUES, so it subscribed to those signals. A viewport-edge
 * flip (`useOverlay` writes `innerAlignY` 'bottom'→'top' during the position
 * pass) re-ran the accessor → the whole Portal/content subtree REMOUNTED.
 * That double-fired the content's `onMount` and dropped any internal state
 * (an input the user was typing in a popover).
 *
 * FIX: pass `align` / `alignX` / `alignY` as `_rp()`-branded accessors (the
 * same shape the trigger's `aria-expanded` already uses) so `makeReactiveProps`
 * converts them to live getters — the content re-styles on flip with NO
 * remount. Needs a REAL browser: happy-dom has no layout, so the flip (driven
 * by getBoundingClientRect vs window.innerHeight) never happens.
 *
 * Bisect-verified: revert `align`/`alignX`/`alignY` to plain `align()` value
 * reads in Overlay/component.tsx → BOTH specs fail (`expected 2 to be 1` on
 * the mount count; the identity spec sees the content node replaced).
 */
import { h, onMount } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { Overlay } from '../Overlay'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

describe('Overlay — content is stable + reactive across a viewport flip', () => {
  it('content mounts once (no remount) yet reads the flipped alignY reactively', async () => {
    let mountCount = 0
    const { container, unmount } = mountInBrowser(
      h(Overlay as never, {
        openOn: 'manual',
        closeOn: 'manual',
        type: 'dropdown',
        align: 'bottom',
        isOpen: false,
        // Trigger pinned near the viewport BOTTOM so a 200px-tall dropdown
        // cannot fit below → useOverlay flips resolvedAlignY 'bottom'→'top'.
        trigger: (p: Record<string, unknown>) =>
          h(
            'button',
            {
              ref: p.ref,
              'data-testid': 'trg',
              style: 'position: fixed; bottom: 4px; left: 20px;',
              onClick: () => (p.showContent as () => void)(),
            },
            'open',
          ),
        children: (p: Record<string, unknown>) => {
          onMount(() => {
            mountCount++
          })
          return h(
            'div',
            {
              ref: p.ref,
              'data-testid': 'menu',
              style: 'width: 160px; height: 200px; background: #eee;',
              // The compiler wraps a bare read in a reactive accessor — mirror
              // that so `p.alignY` (an `_rp()` getter after makeReactiveProps)
              // binds reactively: it reads 'bottom' at mount, then 'top' after
              // the position pass flips it — WITHOUT a remount.
              'data-resolved-aligny': () => p.alignY,
            },
            'menu body',
          )
        },
      }),
    )
    await flush()
    const trg = container.querySelector('[data-testid="trg"]') as HTMLButtonElement
    trg.click()
    await flush()
    await raf()
    await raf()
    await raf()

    const menu = document.querySelector('[data-testid="menu"]') as HTMLElement
    expect(menu).not.toBeNull()
    // (1) No remount — the content lifecycle ran exactly once.
    expect(mountCount, 'content should mount once, not remount on flip').toBe(1)
    // (2) The reactive align prop is LIVE — it flipped to 'top' in place.
    expect(menu.getAttribute('data-resolved-aligny')).toBe('top')
    unmount()
  })
})
