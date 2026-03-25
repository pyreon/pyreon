import { expect, test } from '@playwright/test'

test.describe('Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('nav.sidebar')
  })

  test('loads sidebar with all demo tabs', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Pyreon Fundamentals')
    const buttons = page.locator('nav.sidebar button')
    const count = await buttons.count()
    expect(count).toBeGreaterThanOrEqual(12)
  })

  test('demos render content', async ({ page }) => {
    // All demos are rendered (display:none for inactive) — check main has content
    const mainText = await page.locator('main.content').textContent()
    expect(mainText?.length).toBeGreaterThan(100)

    // Form inputs should be in the DOM
    await expect(page.locator('main input').first()).toBeAttached()

    // Tables should be in the DOM
    await expect(page.locator('main table').first()).toBeAttached()
  })

  test('no JavaScript errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    await page.waitForTimeout(2000)
    expect(errors).toHaveLength(0)
  })

  test('no JavaScript errors when switching all tabs', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const buttons = await page.locator('nav.sidebar button').all()
    for (const btn of buttons) {
      await btn.click()
      await page.waitForTimeout(200)
    }

    expect(errors).toHaveLength(0)
  })
})
