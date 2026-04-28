/**
 * End-to-end tests for `@pyreon/solid-compat` running in real Chromium.
 *
 * Compat-layer counterpart to React/Preact/Vue e2e suites. Solid's
 * createSignal returns a [getter, setter] tuple that callers invoke
 * (`count()` to read, `setCount(n)` to write). The component body runs
 * once; signal reads inside JSX are tracked individually for
 * fine-grained updates.
 *
 * solid-compat's `createSignal` is backed by Pyreon's native signal
 * primitive (the underlying engine is the same), so the shim is very
 * thin. The e2e gate proves a Solid-shaped app actually boots through
 * Pyreon and behaves correctly under user interaction.
 */

import { expect, test } from '@playwright/test'

test.describe('solid-compat — real-app smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('app boots + renders header + SignalDemo component', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Solid')
    await expect(page.locator('#app-root')).toBeVisible()
    // First demo section is SignalDemo — "Count: <strong>0</strong>".
    const firstDemo = page.locator('section.demo').first()
    await expect(firstDemo).toBeVisible()
    await expect(firstDemo).toContainText('Count:')
    await expect(firstDemo.locator('strong').first()).toHaveText('0')
  })

  test('createSignal — clicking Increment updates DOM via setter', async ({ page }) => {
    const signalDemo = page.locator('section.demo').first()
    await expect(signalDemo.locator('strong').first()).toHaveText('0')

    const incrementBtn = signalDemo.locator('button', { hasText: 'Increment' })
    await incrementBtn.click()
    await incrementBtn.click()
    await incrementBtn.click()
    await expect(signalDemo.locator('strong').first()).toHaveText('3')

    await signalDemo.locator('button', { hasText: 'Decrement' }).click()
    await expect(signalDemo.locator('strong').first()).toHaveText('2')

    await signalDemo.locator('button', { hasText: 'Reset' }).click()
    await expect(signalDemo.locator('strong').first()).toHaveText('0')
  })

  test('multi-demo lifecycle smoke (no console errors)', async ({ page }) => {
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
    expect(count).toBeGreaterThanOrEqual(15) // example declares 19, allow drift

    await demos.first().locator('button', { hasText: 'Increment' }).click()
    await expect(demos.first().locator('strong').first()).toHaveText('1')

    expect(errors).toEqual([])
  })
})
