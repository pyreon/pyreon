/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for the modal body-scroll lock in `useOverlay`.
 *
 * The lock used to be taken when the hook MOUNTED (in `setupListeners`), not
 * when the modal opened, and released by writing `''`. So a CLOSED modal
 * blocked page scrolling for as long as its trigger was on the page, and its
 * release wiped whatever another owner (`@pyreon/hooks` `useScrollLock`, used
 * by `ModalBase`) had saved. Every existing modal test mounted with
 * `isOpen: true`, which is why it passed.
 *
 * Contract locked here: the page is scroll-locked exactly while at least one
 * modal is OPEN (shared with `useScrollLock` through `lockScroll` in
 * `@pyreon/core`), and releasing restores the value the page had before.
 */
import { lockScroll, onMount } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useOverlay } from '../Overlay'

type Api = { show: () => void; hide: () => void }

function mountModal(type: 'modal' | 'popover' = 'modal'): { api: Api; unmount: () => void } {
  let api!: Api
  function Harness() {
    const o = useOverlay({ openOn: 'manual', closeOn: 'manual', type })
    api = { show: o.showContent, hide: o.hideContent }
    onMount(() => o.setupListeners())
    return (
      <div>
        <button ref={o.triggerRef}>Open</button>
        {() => (o.active() ? <div ref={o.contentRef}>Dialog</div> : null)}
      </div>
    )
  }
  const { unmount } = mountInBrowser(<Harness />)
  return { api, unmount }
}

const bodyCanScroll = (): boolean => getComputedStyle(document.body).overflow !== 'hidden'
const pageCanScroll = (): boolean =>
  bodyCanScroll() && getComputedStyle(document.documentElement).overflow !== 'hidden'

describe('useOverlay modal — page scroll lock follows OPEN, not mount', () => {
  let tall: HTMLDivElement
  beforeEach(() => {
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
    tall = document.createElement('div')
    tall.style.height = '5000px'
    document.body.appendChild(tall)
  })
  afterEach(() => {
    tall.remove()
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
  })

  it('a closed modal leaves the page scrollable', async () => {
    const { unmount } = mountModal()
    await flush()
    expect(pageCanScroll()).toBe(true)
    window.scrollTo(0, 300)
    expect(window.scrollY).toBe(300)
    window.scrollTo(0, 0)
    unmount()
  })

  it('locks on open, unlocks on close and restores the previous value', async () => {
    document.body.style.overflow = 'scroll'
    const { api, unmount } = mountModal()
    await flush()
    expect(document.body.style.overflow).toBe('scroll')
    api.show()
    await flush()
    expect(bodyCanScroll()).toBe(false)
    api.hide()
    await flush()
    expect(document.body.style.overflow).toBe('scroll')
    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('unmounting an open modal releases the lock', async () => {
    const { api, unmount } = mountModal()
    await flush()
    api.show()
    await flush()
    expect(bodyCanScroll()).toBe(false)
    unmount()
    expect(pageCanScroll()).toBe(true)
  })

  it('a non-modal overlay never locks', async () => {
    const { api, unmount } = mountModal('popover')
    await flush()
    api.show()
    await flush()
    expect(pageCanScroll()).toBe(true)
    unmount()
  })

  it('shares ONE counter with lockScroll (what @pyreon/hooks useScrollLock uses)', async () => {
    let release = lockScroll()
    const { api, unmount } = mountModal()
    await flush()
    api.show()
    await flush()
    // Closing the modal must NOT release the page while the other lock holds it.
    api.hide()
    await flush()
    expect(bodyCanScroll()).toBe(false)
    release()
    expect(pageCanScroll()).toBe(true)
    // And the other order: the modal still holds it after the other lock releases.
    api.show()
    await flush()
    release = lockScroll()
    release()
    expect(bodyCanScroll()).toBe(false)
    api.hide()
    await flush()
    expect(pageCanScroll()).toBe(true)
    unmount()
  })
})
