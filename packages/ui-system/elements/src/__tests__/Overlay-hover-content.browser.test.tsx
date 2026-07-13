/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium regression lock: a hover overlay must STAY OPEN while the
 * pointer is over its CONTENT, and close once the pointer leaves it.
 *
 * BUG SHAPE (pre-fix): `setupListeners()` called `attachHoverListeners()` once
 * at mount, but a hover overlay's content renders only while OPEN — so
 * `contentEl` was null at that point and the content's mouseenter/mouseleave
 * listeners were NEVER attached. Moving the pointer trigger→content never
 * fired `onContentEnter`, so the pending hide timer wasn't cancelled and the
 * tooltip / dropdown closed out from under the pointer — its content was
 * unreachable.
 *
 * FIX: (re)bind the content-hover listeners to the live `contentEl` every time
 * `isContentLoaded` flips (the same signal the position-on-open subscription
 * rides). Needs a REAL browser — happy-dom does not fire hover / timing the
 * way the flow depends on.
 *
 * Bisect-verified: revert to the one-shot `attachHoverListeners()` (content
 * listeners never attached) → the keep-open spec fails (`expected null not to
 * be null` — the tooltip closed).
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { Overlay } from '../Overlay'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const enter = (el: Element) => el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
const leave = (el: Element) => el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))

function mountHoverTooltip() {
  return mountInBrowser(
    h(Overlay as never, {
      openOn: 'hover',
      closeOn: 'hover',
      type: 'tooltip',
      hoverDelay: 40,
      trigger: (p: Record<string, unknown>) =>
        h('button', { ref: p.ref, 'data-testid': 'trg' }, 'hover me'),
      children: (p: Record<string, unknown>) =>
        h('div', { ref: p.ref, 'data-testid': 'tip' }, 'tip body'),
    }),
  )
}

describe('Overlay — hover overlay content is reachable', () => {
  it('keeps the tooltip open while the pointer is over its content', async () => {
    const { container, unmount } = mountHoverTooltip()
    await flush()
    const trg = container.querySelector('[data-testid="trg"]') as HTMLElement

    enter(trg)
    await flush()
    await raf()
    const tip = document.querySelector('[data-testid="tip"]') as HTMLElement
    expect(tip, 'tooltip should open on trigger hover').not.toBeNull()

    // trigger→content: leave trigger (arms hide timer) then enter content
    // (must cancel it). Wait past hoverDelay.
    leave(trg)
    enter(tip)
    await sleep(80)
    await flush()
    expect(
      document.querySelector('[data-testid="tip"]'),
      'tooltip must stay open while the pointer is over its content',
    ).not.toBeNull()

    unmount()
  })

  it('closes the tooltip once the pointer leaves the content', async () => {
    const { container, unmount } = mountHoverTooltip()
    await flush()
    const trg = container.querySelector('[data-testid="trg"]') as HTMLElement

    enter(trg)
    await flush()
    await raf()
    const tip = document.querySelector('[data-testid="tip"]') as HTMLElement
    expect(tip).not.toBeNull()

    // Move into content, then leave it → hide timer fires → closes.
    leave(trg)
    enter(tip)
    await sleep(10)
    leave(tip)
    await sleep(90)
    await flush()
    expect(
      document.querySelector('[data-testid="tip"]'),
      'tooltip must close after the pointer leaves its content',
    ).toBeNull()

    unmount()
  })
})
