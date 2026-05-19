/**
 * End-to-end tests for `@pyreon/svelte-compat` running in real Chromium.
 *
 * Fifth compat-layer e2e suite (alongside react/preact/vue/solid).
 * svelte-compat shims Svelte's importable runtime API — `svelte/store`
 * (`writable`/`readable`/`derived`/`get`/`readonly`) + `svelte`
 * lifecycle/context — backed by Pyreon signals. A component that
 * subscribes to a store inside its body is the faithful equivalent of
 * Svelte's `$store` auto-subscription: it re-renders on store change
 * and auto-cleans on unmount.
 *
 * The gate proves a Svelte-shaped app actually boots through Pyreon
 * and behaves correctly under user interaction.
 */

import { expect, test } from '@playwright/test'

test.describe('svelte-compat — real-app smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('app boots + renders header + first store demo', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Svelte')
    await expect(page.locator('#app-root')).toBeVisible()
    // First demo is StoreDemo — "Count: <strong>0</strong>".
    const firstDemo = page.locator('section.demo').first()
    await expect(firstDemo).toBeVisible()
    await expect(firstDemo).toContainText('Count:')
    await expect(firstDemo.locator('strong').first()).toHaveText('0')
  })

  test('writable — Increment/Decrement/Reset re-render via $store-style subscribe', async ({
    page,
  }) => {
    const demo = page.locator('section.demo').first()
    await expect(demo.locator('strong').first()).toHaveText('0')

    const inc = demo.locator('button', { hasText: 'Increment' })
    await inc.click()
    await inc.click()
    await inc.click()
    await expect(demo.locator('strong').first()).toHaveText('3')

    await demo.locator('button', { hasText: 'Decrement' }).click()
    await expect(demo.locator('strong').first()).toHaveText('2')

    await demo.locator('button', { hasText: 'Reset' }).click()
    await expect(demo.locator('strong').first()).toHaveText('0')
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
    expect(count).toBeGreaterThanOrEqual(8) // example declares more; allow drift

    await demos.first().locator('button', { hasText: 'Increment' }).click()
    await expect(demos.first().locator('strong').first()).toHaveText('1')

    expect(errors).toEqual([])
  })
})
