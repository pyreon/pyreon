import { expect, test } from '@playwright/test'

test.describe('Storage — browser APIs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('nav.sidebar')
    // Clear storage before each test
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
      document.cookie.split(';').forEach((c) => {
        document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
      })
    })
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
    // Set up listener on first page — filter for our specific key
    const storageEventPromise = page.evaluate(() => {
      return new Promise<string>((resolve) => {
        window.addEventListener('storage', (e) => {
          if (e.key === 'cross-tab-test') resolve(e.key)
        })
      })
    })

    // Write from second tab
    const page2 = await context.newPage()
    await page2.goto('/')
    await page2.waitForTimeout(500)
    await page2.evaluate(() => {
      localStorage.setItem('cross-tab-test', 'synced')
    })

    const eventKey = await storageEventPromise
    expect(eventKey).toBe('cross-tab-test')
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
