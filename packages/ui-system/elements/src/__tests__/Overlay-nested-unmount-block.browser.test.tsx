/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock: a nested overlay that UNMOUNTS while open must release
 * the block it holds on its parent.
 *
 * `showContent` blocks the parent (`ctx.setBlocked()`) so a click or Escape
 * that belongs to the child does not close the parent; only `hideContent`
 * unblocked it. A child removed while open (route change, conditional
 * render, list item deleted) never hid, so the parent stayed blocked forever
 * and no longer closed on outside click or Escape. A child that was shown
 * twice without a hide in between also double-counted its block.
 */
import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { useOverlay } from '../Overlay'

type Api = { show: () => void; hide: () => void; active: () => boolean }

function mountNested() {
  const childMounted = signal(true)
  let parent!: Api
  let child!: Api

  function Child() {
    const o = useOverlay({ openOn: 'manual', closeOn: 'manual', type: 'popover' })
    child = { show: o.showContent, hide: o.hideContent, active: o.active }
    onMount(() => o.setupListeners())
    return <button ref={o.triggerRef}>child trigger</button>
  }

  function Parent() {
    const o = useOverlay({ openOn: 'manual', closeOn: 'clickOutsideContent', type: 'popover' })
    parent = { show: o.showContent, hide: o.hideContent, active: o.active }
    onMount(() => o.setupListeners())
    return (
      <div>
        <button ref={o.triggerRef}>parent trigger</button>
        <div ref={o.contentRef} data-testid="parent-content">
          <o.Provider blocked={o.blocked} setBlocked={o.setBlocked} setUnblocked={o.setUnblocked}>
            {() => (childMounted() ? <Child /> : null)}
          </o.Provider>
        </div>
      </div>
    )
  }

  const outside = document.createElement('button')
  outside.textContent = 'outside'
  document.body.appendChild(outside)
  const { unmount } = mountInBrowser(<Parent />)
  return {
    parent: () => parent,
    child: () => child,
    unmountChild: () => childMounted.set(false),
    outside,
    cleanup: () => {
      unmount()
      outside.remove()
    },
  }
}

const pressEscape = () =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

describe('nested useOverlay — a child unmounted while open releases the parent', () => {
  it('the parent closes on Escape after its open child unmounts', async () => {
    const h = mountNested()
    await flush()
    h.parent().show()
    h.child().show()
    await flush()
    expect(h.child().active()).toBe(true)
    h.unmountChild()
    await flush()
    pressEscape()
    expect(h.parent().active()).toBe(false)
    h.cleanup()
  })

  it('the parent closes on an outside click after its open child unmounts', async () => {
    const h = mountNested()
    await flush()
    h.parent().show()
    h.child().show()
    await flush()
    h.unmountChild()
    await flush()
    h.outside.click()
    expect(h.parent().active()).toBe(false)
    h.cleanup()
  })

  it('a child shown twice holds ONE block: one hide releases the parent', async () => {
    const h = mountNested()
    await flush()
    h.parent().show()
    h.child().show()
    h.child().show()
    h.child().hide()
    await flush()
    pressEscape()
    expect(h.parent().active()).toBe(false)
    h.cleanup()
  })
})
