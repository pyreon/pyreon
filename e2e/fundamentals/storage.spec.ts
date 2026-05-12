import { expect, test } from '@playwright/test'

test.describe('Storage — browser APIs', () => {
  test.beforeEach(async ({ page }) => {
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
    // CI flake guard — `waitForSelector` returns as soon as the sidebar
    // is mounted, but Vite's dev server can still be streaming async
    // chunks / re-prebundling under slow CI load. A late-arriving HMR
    // reload then destroys the execution context the moment the test
    // body calls `page.evaluate(...)` ("Execution context was destroyed,
    // most likely because of a navigation"). `networkidle` blocks until
    // 500ms of zero in-flight requests, after which HMR cannot fire
    // without a fresh user-driven navigation. Both `cross-tab
    // localStorage sync fires storage event` (line 58) and
    // `localStorage.clear removes all items` (line 81) flaked at the
    // first `page.evaluate` in CI on three consecutive main-branch runs
    // (#25728248892 / M3.A merge, plus PR #535's initial run + rerun)
    // before this guard was added — load-dependent, not specific to one
    // test. Bisect: removing this line reproduces both flake shapes on
    // GitHub-hosted ubuntu-latest runners under typical CI concurrency.
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

    // Write from second tab
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
