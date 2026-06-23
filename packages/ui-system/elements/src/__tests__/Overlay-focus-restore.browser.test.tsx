/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium regression lock for Overlay focus management. `useOverlay`
 * declared `_prevFocusEl` but NEVER used it — non-modal overlays (dropdown /
 * popover / tooltip) dropped keyboard focus at the top of the document when
 * they closed (native `<dialog>.showModal()` gives modal overlays this for
 * free; the others had nothing). The fix captures the opener in showContent
 * and restores it in hideContent IF focus is still inside the closing overlay.
 *
 * Drives the showContent/hideContent focus code path directly via useOverlay
 * (manual mode, inline content) — the capture/restore logic is identical
 * regardless of the Portal/click plumbing around it.
 *
 * Bisect: revert the showContent capture / hideContent restore → this fails
 * (activeElement stays the in-content button instead of returning to trigger).
 */
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { useOverlay } from '../Overlay'

type Api = { show: () => void; hide: () => void }

describe('Overlay (useOverlay) — focus restore on close', () => {
  it('restores focus to the opener when focus was inside the closing overlay', async () => {
    let api!: Api
    function Harness() {
      const o = useOverlay({ openOn: 'manual', closeOn: 'manual', type: 'popover', isOpen: false })
      api = { show: o.showContent, hide: o.hideContent }
      return (
        <div>
          <button ref={o.triggerRef} data-testid="trigger">
            Open
          </button>
          <div ref={o.contentRef}>
            <button data-testid="inside">Inside</button>
          </div>
        </div>
      )
    }
    const { container, unmount } = mountInBrowser(<Harness />)
    await flush()

    const trigger = container.querySelector('[data-testid=trigger]') as HTMLButtonElement
    const inside = container.querySelector('[data-testid=inside]') as HTMLButtonElement

    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    api.show() // captures the opener (trigger) as the restore target
    await flush()

    inside.focus() // focus moves into the overlay content
    expect(document.activeElement).toBe(inside)

    api.hide() // focus is inside → restore to the opener
    await flush()
    expect(document.activeElement).toBe(trigger)

    unmount()
  })

  it('does NOT steal focus if the user moved it outside the overlay before close', async () => {
    let api!: Api
    function Harness() {
      const o = useOverlay({ openOn: 'manual', closeOn: 'manual', type: 'popover', isOpen: false })
      api = { show: o.showContent, hide: o.hideContent }
      return (
        <div>
          <button ref={o.triggerRef} data-testid="trigger">
            Open
          </button>
          <div ref={o.contentRef}>
            <button data-testid="inside">Inside</button>
          </div>
          <button data-testid="elsewhere">Elsewhere</button>
        </div>
      )
    }
    const { container, unmount } = mountInBrowser(<Harness />)
    await flush()

    const trigger = container.querySelector('[data-testid=trigger]') as HTMLButtonElement
    const elsewhere = container.querySelector('[data-testid=elsewhere]') as HTMLButtonElement

    trigger.focus()
    api.show()
    await flush()
    // User deliberately moves focus OUT of the overlay (not the trigger).
    elsewhere.focus()
    expect(document.activeElement).toBe(elsewhere)

    api.hide() // focus is NOT in the overlay → leave it where the user put it
    await flush()
    expect(document.activeElement).toBe(elsewhere)

    unmount()
  })
})
