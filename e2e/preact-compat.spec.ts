/**
 * End-to-end tests for `@pyreon/preact-compat` running in real Chromium.
 *
 * Compat-layer counterpart to the `@pyreon/react-compat` e2e suite.
 * Same intent: prove the example app at `examples/preact-compat` boots,
 * renders, and exercises Preact's API (h / Fragment / hooks) end-to-end
 * through Pyreon's reactive engine.
 *
 * preact-compat is closer to a thin shim over Pyreon than react-compat —
 * it doesn't re-render the whole subtree, just rebinds the relevant
 * signals. So no special re-query gotcha here; standard idiom applies.
 */

import { expect, test } from '@playwright/test'

test.describe('preact-compat — real-app smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('app boots + renders header + UseStateDemo component', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Preact')
    // preact-compat App returns a Fragment (no #app-root wrapper); use
    // the header as the boot marker instead.
    await expect(page.locator('header').first()).toBeVisible()
    // First demo is UseStateDemo — renders "count: <strong>0</strong>".
    const firstDemo = page.locator('section.demo').first()
    await expect(firstDemo).toBeVisible()
    await expect(firstDemo).toContainText('count:')
    await expect(firstDemo.locator('strong').first()).toHaveText('0')
  })

  test('useState — clicking Increment updates DOM', async ({ page }) => {
    const useStateDemo = page.locator('section.demo').first()
    await expect(useStateDemo.locator('strong').first()).toHaveText('0')

    const incrementBtn = useStateDemo.locator('button', { hasText: 'Increment' })
    await incrementBtn.click()
    await incrementBtn.click()
    await expect(useStateDemo.locator('strong').first()).toHaveText('2')

    await useStateDemo.locator('button', { hasText: 'Decrement' }).click()
    await expect(useStateDemo.locator('strong').first()).toHaveText('1')

    await useStateDemo.locator('button', { hasText: 'Reset' }).click()
    await expect(useStateDemo.locator('strong').first()).toHaveText('0')
  })

  test('multiple demos co-exist without console errors (lifecycle smoke)', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (text.includes('favicon')) return
        errors.push(text)
      }
    })

    const demos = page.locator('section.demo')
    const count = await demos.count()
    expect(count).toBeGreaterThanOrEqual(8) // example declares 11, allow drift

    await demos.first().locator('button', { hasText: 'Increment' }).click()
    await expect(demos.first().locator('strong').first()).toHaveText('1')

    expect(errors).toEqual([])
  })
})
