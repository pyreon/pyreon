/**
 * Real-Chromium regression lock: overlay content is POSITIONED when it opens.
 *
 * Pre-fix, `setContentPosition()` was reachable only through the throttled
 * resize/scroll handlers wired in `setupListeners()` — NOTHING positioned the
 * content when it actually mounted, so every dropdown/tooltip rendered at the
 * document origin until the window scrolled or resized (the downstream
 * "dropdown at (0, viewportHeight)" bug). The fix subscribes to
 * `active`/`isContentLoaded` inside `setupListeners()` and repositions one
 * rAF after open. Needs a REAL browser: happy-dom has no layout, so
 * getBoundingClientRect is all zeros and anchoring can't be asserted.
 */
import { describe, expect, it } from 'vitest'
import { Portal } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { useOverlay } from '../Overlay'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

function Dropdown() {
  const o = useOverlay({ openOn: 'manual', closeOn: 'manual', type: 'dropdown' })
  return (
    <div style="padding-top: 120px; padding-left: 80px;">
      <button ref={o.triggerRef} data-testid="trigger" onClick={() => o.showContent()}>
        open
      </button>
      {() =>
        o.active() ? (
          // PORTALED to document.body — the built-in Overlay component's real
          // shape, and the shape that exposes the bug: portaled content has
          // no flow relationship to the trigger, so without an explicit
          // position write it renders wherever body flow drops it (the
          // pre-fix "menu at the bottom-left of the page" symptom).
          <Portal target={document.body}>
            <div
              ref={o.contentRef}
              data-testid="menu"
              style="width: 160px; height: 90px; background: #eee;"
            >
              menu
            </div>
          </Portal>
        ) : null
      }
    </div>
  )
}

describe('Overlay — position on open (real layout)', () => {
  it('anchors the content to the trigger immediately on open (no scroll/resize needed)', async () => {
    const { container, unmount } = mountInBrowser(<Dropdown />)
    await flush()

    const trigger = container.querySelector('[data-testid=trigger]') as HTMLButtonElement
    trigger.click()
    await flush()
    // Positioning defers one animation frame after the content mounts so
    // layout settles before measuring — wait two frames to be safe.
    await raf()
    await raf()

    const menu = document.querySelector('[data-testid=menu]') as HTMLElement
    expect(menu).not.toBeNull()

    const t = trigger.getBoundingClientRect()
    const m = menu.getBoundingClientRect()
    // The downstream verification contract: menu top ≈ trigger bottom (±8px)
    // and horizontally overlapping the trigger's x-range — NOT at the
    // document origin (the pre-fix failure put it at x=0 / bottom of page).
    expect(Math.abs(m.top - t.bottom)).toBeLessThanOrEqual(8)
    expect(m.left).toBeGreaterThanOrEqual(t.left - 8)
    // Explicitly rule out the pre-fix "unpositioned at origin" shape.
    expect(m.top).toBeGreaterThan(40)

    unmount()
  })

  it('setContentPosition is exposed for manual repositioning', async () => {
    let api!: ReturnType<typeof useOverlay>
    function Probe() {
      api = useOverlay({ openOn: 'manual', closeOn: 'manual', type: 'dropdown' })
      return (
        <div>
          <button ref={api.triggerRef}>t</button>
        </div>
      )
    }
    const { unmount } = mountInBrowser(<Probe />)
    await flush()
    expect(typeof api.setContentPosition).toBe('function')
    // Callable with no open content (no-op, must not throw).
    expect(() => api.setContentPosition()).not.toThrow()
    unmount()
  })
})
