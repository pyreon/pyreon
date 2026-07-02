/**
 * Real-Chromium regression lock: delegated events fire inside <Portal>.
 *
 * Pyreon delegates common bubbling events at the MOUNT CONTAINER — portal
 * content lives outside it, so a click on a portaled button bubbled
 * `button → body → html → document` and never crossed the app root's
 * delegation listener: every portaled `onClick` was silently dead (the
 * documented anti-pattern; toast worked around it with its own host +
 * setupDelegation). The fix makes the Portal mount branch delegate its own
 * target. Also locks the DOUBLE-FIRE guard: with document.body as the portal
 * target (an ANCESTOR of the app root), a click INSIDE the app must still
 * invoke its handler exactly once — the per-dispatch DELEGATED_ELEMENTS
 * invoked-set makes the outer root skip elements the inner root handled.
 *
 * (Written with `h()` rather than JSX literals — runtime-dom's browser test
 * config runs no JSX transform; see element-conditional-tpl.browser.test.tsx.)
 */
import { describe, expect, it } from 'vitest'
import { h, Portal } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'

describe('<Portal> — event delegation', () => {
  it('delegated onClick fires inside a Portal to document.body', async () => {
    let clicks = 0
    const { unmount } = mountInBrowser(
      h(
        'div',
        null,
        h(
          Portal,
          { target: document.body },
          h('button', { 'data-testid': 'portal-btn', onClick: () => clicks++ }, 'portal'),
        ),
      ),
    )
    await flush()

    const btn = document.querySelector('[data-testid=portal-btn]') as HTMLButtonElement
    expect(btn).not.toBeNull()
    btn.click()
    expect(clicks).toBe(1)
    btn.click()
    expect(clicks).toBe(2)

    unmount()
  })

  it('does NOT double-fire app handlers when the portal target is an ancestor (document.body)', async () => {
    let appClicks = 0
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        null,
        h('button', { 'data-testid': 'app-btn', onClick: () => appClicks++ }, 'app'),
        h(Portal, { target: document.body }, h('span', null, 'portal content')),
      ),
    )
    await flush()

    // body is now a delegation root ABOVE the app's mount container — the
    // invoked-set must dedupe so the app handler fires exactly once.
    const btn = container.querySelector('[data-testid=app-btn]') as HTMLButtonElement
    btn.click()
    expect(appClicks).toBe(1)

    unmount()
  })
})
