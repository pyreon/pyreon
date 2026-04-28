/**
 * End-to-end tests for `@pyreon/vue-compat` running in real Chromium.
 *
 * Compat-layer counterpart to the React/Preact e2e suites. The Vue API
 * surface is different (ref / reactive / watch / lifecycle), but the
 * bug-shapes we want to catch are the same:
 *
 *   1. Example app boots (the shim's mount path works for the
 *      Composition API setup-function shape)
 *   2. Mutating a ref triggers DOM update through the engine
 *      (`count.value++` → re-render)
 *   3. Multi-component apps co-exist without crashes
 *
 * Vue's hook-indexed re-execute model means the component setup
 * function runs once but reactive reads inside the JSX are tracked —
 * fine-grained updates, no whole-tree replacement. So no re-query
 * gotcha; standard idiom.
 */

import { expect, test } from '@playwright/test'

test.describe('vue-compat — real-app smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('app boots + renders header + RefDemo component', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Vue')
    // vue-compat App returns a Fragment (no #app-root wrapper); use the
    // header as the boot marker instead.
    await expect(page.locator('header').first()).toBeVisible()
    // First demo section should show the ref-based counter.
    const firstDemo = page.locator('section.demo').first()
    await expect(firstDemo).toBeVisible()
    await expect(firstDemo).toContainText('count:')
    await expect(firstDemo.locator('strong').first()).toHaveText('0')
  })

  test('ref — clicking Increment updates DOM via .value mutation', async ({ page }) => {
    const refDemo = page.locator('section.demo').first()
    await expect(refDemo.locator('strong').first()).toHaveText('0')

    // Vue's `count.value++` pattern under the hood — the demo's onClick
    // does this. We just click and verify the rendered text.
    const incrementBtn = refDemo.locator('button', { hasText: 'Increment' })
    await incrementBtn.click()
    await incrementBtn.click()
    await expect(refDemo.locator('strong').first()).toHaveText('2')

    await refDemo.locator('button', { hasText: 'Decrement' }).click()
    await expect(refDemo.locator('strong').first()).toHaveText('1')
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
    expect(count).toBeGreaterThanOrEqual(10) // example declares 13, allow drift

    await demos.first().locator('button', { hasText: 'Increment' }).click()
    await expect(demos.first().locator('strong').first()).toHaveText('1')

    expect(errors).toEqual([])
  })
})
