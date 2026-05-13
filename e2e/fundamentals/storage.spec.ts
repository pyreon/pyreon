import { expect, test } from '@playwright/test'

test.describe('Storage — browser APIs', () => {
  test.beforeEach(async ({ page, context }) => {
    // Kill Vite's HMR client for every page in this context. The browser
    // primitives these tests exercise (localStorage / sessionStorage /
    // document.cookie) are not Pyreon code paths, but they run inside the
    // fundamentals-playground Vite dev server because Playwright needs a
    // same-origin document to fire `storage` events cross-tab. Without HMR
    // suppression, a second tab's `page2.goto('/')` re-triggers Vite's
    // pre-bundle / module-graph traversal on the dev server, which sends
    // an HMR update to ALL connected clients (including tab 1) via the
    // websocket connection established by `@vite/client`. Tab 1's reload
    // then destroys any `addEventListener('storage', …)` callbacks that
    // had been registered in the test body — and `cross-tab localStorage
    // sync fires storage event` times out at `waitForFunction`. Four
    // consecutive main-branch CI failures before this fix (run IDs
    // 25745360432 / 25728248892 / 25725838841 / 25723298232) all hit the
    // same shape; PR #535's `networkidle` + `window.__storageSync` poll
    // added defenses but the listener itself was the casualty.
    //
    // `context.route` propagates to every page created from the context,
    // including the second tab in the cross-tab test. Without `@vite/client`,
    // the page never opens the HMR websocket → no HMR updates → no reloads.
    // The dev server still serves the rest of the bundle normally.
    await context.route('**/@vite/client*', (route) => route.fulfill({ status: 204, body: '' }))

    // Clear storage BEFORE the page loads — `addInitScript` runs in every
    // new document context before any user code executes. Avoids the race
    // where `page.evaluate` after `waitForSelector` lands mid-navigation and
    // throws "Execution context was destroyed" on slow CI.
    await page.addInitScript(() => {
      try {
        localStorage.clear()
        sessionStorage.clear()
      } catch {
        // Cross-origin or storage-disabled context — skip.
      }
      document.cookie.split(';').forEach((c) => {
        document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
      })
    })
    await page.goto('/')
    await page.waitForSelector('nav.sidebar')
    // Preserved from PR #535. With the HMR client suppressed above, the
    // dev server still streams JS chunks during initial mount, so blocking
    // on networkidle (500ms of zero in-flight requests) keeps the post-
    // mount evaluate calls from racing the last bundler request.
    await page.waitForLoadState('networkidle')
  })

  test('localStorage persists and reads back', async ({ page }) => {
    // Write to localStorage via page context
    await page.evaluate(() => {
      localStorage.setItem('test-key', JSON.stringify('test-value'))
    })

    // Read it back
    const value = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('test-key') ?? 'null')
    })
    expect(value).toBe('test-value')
  })

  test('sessionStorage read/write works', async ({ page }) => {
    await page.evaluate(() => {
      sessionStorage.setItem('session-test', 'hello')
    })
    const value = await page.evaluate(() => {
      return sessionStorage.getItem('session-test')
    })
    expect(value).toBe('hello')
  })

  test('cookies can be set and read', async ({ page }) => {
    await page.evaluate(() => {
      document.cookie = 'test-cookie=hello;path=/'
    })

    const cookie = await page.evaluate(() => {
      return document.cookie
    })
    expect(cookie).toContain('test-cookie=hello')
  })

  test('cross-tab localStorage sync fires storage event', async ({ page, context }) => {
    // Set up listener on first page — filter for our specific key.
    // Storing the result on a global lets us poll for it via
    // `waitForFunction` instead of awaiting a long-lived
    // `page.evaluate(() => new Promise(...))` — the polling form is
    // robust to a transient HMR reload that would otherwise leave the
    // outer Promise un-resolved.
    await page.evaluate(() => {
      const w = window as typeof window & { __storageSync?: string }
      w.__storageSync = undefined
      window.addEventListener('storage', (e) => {
        if (e.key === 'cross-tab-test') w.__storageSync = e.key ?? ''
      })
    })

    // Write from second tab. The HMR-suppression route in beforeEach
    // applies to this page too (`context.route` covers every page in the
    // context), so this goto can't trigger an HMR reload on tab 1.
    const page2 = await context.newPage()
    await page2.goto('/')
    await page2.waitForLoadState('networkidle')
    await page2.evaluate(() => {
      localStorage.setItem('cross-tab-test', 'synced')
    })

    const eventKey = await page.waitForFunction(
      () => (window as typeof window & { __storageSync?: string }).__storageSync,
      undefined,
      { timeout: 5000 },
    )
    expect(await eventKey.jsonValue()).toBe('cross-tab-test')
    await page2.close()
  })

  test('localStorage.clear removes all items', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('a', '1')
      localStorage.setItem('b', '2')
      localStorage.setItem('c', '3')
      localStorage.clear()
    })

    const count = await page.evaluate(() => localStorage.length)
    expect(count).toBe(0)
  })
})
