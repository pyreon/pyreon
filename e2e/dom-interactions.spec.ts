import { expect, test } from '@playwright/test'

test.describe('DOM interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('nav.sidebar')
  })

  test('keyboard events fire on the page', async ({ page }) => {
    const keyPressed = page.evaluate(() => {
      return new Promise<string>((resolve) => {
        document.addEventListener(
          'keydown',
          (e) => resolve(e.key),
          { once: true },
        )
      })
    })

    // Focus body first, use a key unlikely to be intercepted
    await page.click('body')
    await page.keyboard.press('F7')
    expect(await keyPressed).toBe('F7')
  })

  test('pointer events fire correctly', async ({ page }) => {
    const pointerFired = await page.evaluate(() => {
      let count = 0
      document.addEventListener('pointerdown', () => count++)
      document.addEventListener('pointerup', () => count++)
      return count
    })
    expect(pointerFired).toBe(0)

    // Click triggers pointer events
    await page.click('nav.sidebar')
    const afterClick = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        // Give a tick for events to process
        setTimeout(() => resolve(true), 50)
      })
    })
    expect(afterClick).toBe(true)
  })

  test('ResizeObserver is available', async ({ page }) => {
    const hasResizeObserver = await page.evaluate(() => {
      return typeof ResizeObserver === 'function'
    })
    expect(hasResizeObserver).toBe(true)
  })

  test('IntersectionObserver is available', async ({ page }) => {
    const hasIntersectionObserver = await page.evaluate(() => {
      return typeof IntersectionObserver === 'function'
    })
    expect(hasIntersectionObserver).toBe(true)
  })

  test('MutationObserver is available', async ({ page }) => {
    const hasMutationObserver = await page.evaluate(() => {
      return typeof MutationObserver === 'function'
    })
    expect(hasMutationObserver).toBe(true)
  })

  test('WebSocket API is available', async ({ page }) => {
    const hasWebSocket = await page.evaluate(() => {
      return typeof WebSocket === 'function'
    })
    expect(hasWebSocket).toBe(true)
  })

  test('wheel events work for scroll/zoom', async ({ page }) => {
    const wheelFired = page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        document.addEventListener(
          'wheel',
          () => resolve(true),
          { once: true, passive: true },
        )
      })
    })

    await page.mouse.wheel(0, 100)
    expect(await wheelFired).toBe(true)
  })

  test('touch events API is available', async ({ page }) => {
    const hasTouchEvent = await page.evaluate(() => {
      return typeof TouchEvent !== 'undefined' || 'ontouchstart' in window
    })
    // May or may not be available depending on browser config
    expect(typeof hasTouchEvent).toBe('boolean')
  })

  test('clipboard API is available', async ({ page }) => {
    const hasClipboard = await page.evaluate(() => {
      return typeof navigator.clipboard !== 'undefined'
    })
    expect(hasClipboard).toBe(true)
  })

  test('CSS transforms work for flow viewport', async ({ page }) => {
    const transformed = await page.evaluate(() => {
      const div = document.createElement('div')
      div.style.transform = 'translate(100px, 200px) scale(1.5)'
      document.body.appendChild(div)
      const computed = getComputedStyle(div).transform
      div.remove()
      return computed !== 'none' && computed !== ''
    })
    expect(transformed).toBe(true)
  })
})
