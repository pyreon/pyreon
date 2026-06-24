/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium regression lock for the Overlay MODAL focus trap. `useOverlay`
 * managed focus RESTORE on close (Overlay-focus-restore.browser.test) but did
 * NOT trap Tab inside an open modal — keyboard / screen-reader users could Tab
 * straight out to the inert background behind the dialog (a serious WAI-ARIA
 * dialog-pattern failure). This adds, for `type: 'modal'` only:
 *   - initial focus-in on open (showContent → first focusable),
 *   - Tab / Shift+Tab cycling within the content (setupListeners trap).
 *
 * The trap is a window keydown listener registered by setupListeners, so the
 * harness calls it in onMount. Synthetic Tab dispatch reaches the listener,
 * which calls .focus() to wrap — that IS the focus move under test (native Tab
 * doesn't fire on a synthetic event).
 *
 * Bisect: revert the setupListeners trap block → the forward/back wrap specs
 * fail (activeElement stays put). Revert the showContent focus-in → the
 * initial-focus spec fails. The non-modal control spec proves the trap is
 * gated on type === 'modal'.
 */
import { onMount } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { useOverlay } from '../Overlay'

type OverlayType = 'modal' | 'popover'
type Api = { show: () => void; hide: () => void }

const nextFrame = (): Promise<void> =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

function mountHarness(type: OverlayType): {
  api: Api
  q: (id: string) => HTMLButtonElement
  unmount: () => void
} {
  let api!: Api
  function Harness() {
    const o = useOverlay({ openOn: 'manual', closeOn: 'manual', type, isOpen: false })
    api = { show: o.showContent, hide: o.hideContent }
    onMount(() => o.setupListeners())
    return (
      <div>
        <button ref={o.triggerRef} data-testid="trigger">
          Open
        </button>
        <div ref={o.contentRef} data-testid="content">
          <button data-testid="b1">One</button>
          <button data-testid="b2">Two</button>
          <button data-testid="b3">Three</button>
        </div>
      </div>
    )
  }
  const { container, unmount } = mountInBrowser(<Harness />)
  const q = (id: string) => container.querySelector(`[data-testid=${id}]`) as HTMLButtonElement
  return { api, q, unmount }
}

function pressTab(shift = false): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true }))
}

describe('Overlay (useOverlay) — modal focus trap', () => {
  it('moves focus into the modal content on open (first focusable)', async () => {
    const { api, q, unmount } = mountHarness('modal')
    await flush()
    api.show()
    await nextFrame() // initial focus-in is rAF-deferred
    expect(document.activeElement).toBe(q('b1'))
    unmount()
  })

  it('Tab at the last focusable wraps to the first', async () => {
    const { api, q, unmount } = mountHarness('modal')
    await flush()
    api.show()
    await nextFrame()
    q('b3').focus()
    expect(document.activeElement).toBe(q('b3'))
    pressTab()
    expect(document.activeElement).toBe(q('b1'))
    unmount()
  })

  it('Shift+Tab at the first focusable wraps to the last', async () => {
    const { api, q, unmount } = mountHarness('modal')
    await flush()
    api.show()
    await nextFrame()
    q('b1').focus()
    expect(document.activeElement).toBe(q('b1'))
    pressTab(true)
    expect(document.activeElement).toBe(q('b3'))
    unmount()
  })

  it('does NOT trap (or wrap) when closed', async () => {
    const { api, q, unmount } = mountHarness('modal')
    await flush()
    api.show()
    await nextFrame()
    api.hide()
    await flush()
    q('b3').focus()
    pressTab() // closed → trap body early-returns on !active()
    expect(document.activeElement).toBe(q('b3')) // unchanged
    unmount()
  })

  it('does NOT trap for a non-modal overlay (type=popover)', async () => {
    const { api, q, unmount } = mountHarness('popover')
    await flush()
    api.show()
    await nextFrame()
    q('b3').focus()
    pressTab() // popover → no trap registered → no wrap
    expect(document.activeElement).toBe(q('b3')) // unchanged
    unmount()
  })
})
