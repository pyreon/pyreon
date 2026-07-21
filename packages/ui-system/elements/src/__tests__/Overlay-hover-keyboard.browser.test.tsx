/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium regression lock: a HOVER overlay must be operable by KEYBOARD
 * (APG tooltip/hover-card + WCAG 1.4.13) — focusing the trigger opens it,
 * Tab-ing into the content keeps it open, and focus leaving both closes it.
 *
 * BUG SHAPE (pre-fix, 2026-07-21 audit): the hover mode bound ONLY
 * mouseenter/mouseleave — keyboard/AT users could NEVER open a Tooltip or
 * HoverCard (the trigger focus did nothing). Fix: focusin/focusout mirror the
 * mouse handlers 1:1 on both trigger and content.
 *
 * Uses real DOM focus() (focusin dispatches synchronously in Chromium) — this
 * flow is exactly the "wrong-transform/happy-dom masks it" class, so it's a
 * browser spec.
 *
 * Also locks the aria-haspopup accuracy fix: popover → 'dialog' (was the
 * blanket 'menu' — telling AT to expect menuitem semantics that never exist);
 * custom → omitted.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { Overlay } from '../Overlay'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function mountHoverTip(testids: { trg: string; tip: string }) {
  return mountInBrowser(
    h(
      'div',
      {},
      h(Overlay as never, {
        openOn: 'hover',
        closeOn: 'hover',
        type: 'tooltip',
        hoverDelay: 40,
        trigger: (p: Record<string, unknown>) =>
          h('button', { ref: p.ref, 'data-testid': testids.trg }, 'focus me'),
        children: (p: Record<string, unknown>) =>
          h(
            'div',
            { ref: p.ref, 'data-testid': testids.tip },
            h('a', { href: '#', 'data-testid': `${testids.tip}-link` }, 'more'),
          ),
      }),
      // An unrelated focusable OUTSIDE the overlay — the keyboard-close flow
      // is moving focus PAST the widget (focus returning to the TRIGGER
      // legitimately re-shows a tooltip per APG, so trigger-restore is not a
      // "close" flow).
      h('button', { 'data-testid': `${testids.trg}-outside` }, 'after'),
    ),
  )
}

describe('Overlay — hover overlays are keyboard-operable (real Chromium)', () => {
  it('opens on trigger FOCUS, stays open while focus is inside the content, closes after focus leaves', async () => {
    const { container, unmount } = mountHoverTip({ trg: 'kb-trg', tip: 'kb-tip' })
    await flush()
    const trg = container.querySelector('[data-testid="kb-trg"]') as HTMLElement

    // Keyboard-open: real focus (no mouse events at all).
    trg.focus()
    await flush()
    await raf()
    const tip = document.querySelector('[data-testid="kb-tip"]') as HTMLElement
    expect(tip, 'tooltip should open when the trigger receives focus').not.toBeNull()

    // Tab into the content: focus leaving the trigger arms the hide timer;
    // focus entering the content must cancel it (same as the pointer flow).
    const link = document.querySelector('[data-testid="kb-tip-link"]') as HTMLElement
    link.focus()
    await sleep(90) // > hoverDelay — the cancelled timer must NOT have fired
    expect(
      document.querySelector('[data-testid="kb-tip"]'),
      'tooltip must stay open while focus is inside its content',
    ).not.toBeNull()

    // Focus moves PAST the widget (an unrelated outside control) → the
    // delayed hide runs; the focus-restore guard must NOT yank focus back to
    // the trigger (focus is outside the closing overlay), so it stays closed.
    const outside = container.querySelector('[data-testid="kb-trg-outside"]') as HTMLElement
    outside.focus()
    await sleep(90)
    await flush()
    expect(
      document.querySelector('[data-testid="kb-tip"]'),
      'tooltip should close after focus moves past trigger + content',
    ).toBeNull()

    unmount()
  })
})

describe('Overlay — aria-haspopup accuracy (real Chromium)', () => {
  const mountType = (type: string, trg: string) =>
    mountInBrowser(
      h(Overlay as never, {
        openOn: 'click',
        type,
        trigger: (p: Record<string, unknown>) =>
          // Forward the a11y prop the render-prop contract delivers — `p.ref`
          // alone drops it (the trigger owns spreading Overlay's trigger props).
          h('button', {
            ref: p.ref,
            'aria-haspopup': p['aria-haspopup'],
            'data-testid': trg,
          }, 't'),
        children: (p: Record<string, unknown>) => h('div', { ref: p.ref }, 'c'),
      }),
    )

  it("popover advertises aria-haspopup='dialog' (not 'menu')", async () => {
    const { container, unmount } = mountType('popover', 'hp-pop')
    await flush()
    expect(
      container.querySelector('[data-testid="hp-pop"]')!.getAttribute('aria-haspopup'),
    ).toBe('dialog')
    unmount()
  })

  it('dropdown keeps aria-haspopup=menu; custom omits it', async () => {
    const a = mountType('dropdown', 'hp-dd')
    await flush()
    expect(a.container.querySelector('[data-testid="hp-dd"]')!.getAttribute('aria-haspopup')).toBe(
      'menu',
    )
    a.unmount()

    const b = mountType('custom', 'hp-cu')
    await flush()
    expect(b.container.querySelector('[data-testid="hp-cu"]')!.getAttribute('aria-haspopup')).toBeNull()
    b.unmount()
  })
})
