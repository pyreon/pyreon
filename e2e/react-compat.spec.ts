/**
 * End-to-end tests for `@pyreon/react-compat` running in real Chromium.
 *
 * The compat layer's value prop is "behaves like real React in a real
 * app" — vitest-browser smoke tests prove the shim's surface but not
 * that an app shipping React code runs end-to-end through Pyreon's
 * reactive engine. This suite exercises the example app at
 * `examples/react-compat` to close that gap.
 *
 * **Critical compat-layer gotcha (re-render shape):**
 * react-compat re-renders by replacing the entire component subtree on
 * every state change (no VDOM diffing — Pyreon's pattern is fine-grained
 * reactivity, the compat shim simulates React's whole-tree-render shape
 * by re-running the component body via a version signal). Tests MUST
 * re-query the DOM after a state change — captured locator handles
 * still resolve, but pre-captured Element handles via `elementHandle()`
 * would point at detached nodes. Documented in
 * `react-compat-rerender.browser.test.tsx`.
 *
 * Playwright's `expect(locator).toHaveText(...)` re-queries on every
 * poll, so it's safe; we just stick to that pattern.
 */

import { expect, test } from '@playwright/test'

test.describe('react-compat — real-app smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('app boots + renders header + counter component', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Pyreon — React Compat')
    await expect(page.locator('#app-root')).toBeVisible()
    // The UseStateDemo renders "Count: <strong>0</strong>" inside the first demo section.
    await expect(page.locator('section.demo').first()).toBeVisible()
    await expect(page.locator('section.demo').first()).toContainText('Count:')
  })

  test('useState — clicking Increment updates DOM through the compat re-render path', async ({
    page,
  }) => {
    const useStateDemo = page.locator('section.demo').first()
    // Start at 0 (from initialValue in UseStateDemo).
    await expect(useStateDemo).toContainText('Count:')
    await expect(useStateDemo.locator('strong').first()).toHaveText('0')

    // Click Increment three times. After each click, react-compat
    // bumps a version signal which triggers a full subtree replace.
    // toHaveText() re-queries every poll cycle, so stale-handle isn't
    // an issue here — but DON'T pre-capture .elementHandle().
    const incrementBtn = useStateDemo.locator('button', { hasText: 'Increment' })
    await incrementBtn.click()
    await incrementBtn.click()
    await incrementBtn.click()
    await expect(useStateDemo.locator('strong').first()).toHaveText('3')

    // Decrement once — verifies the same path on the reverse direction.
    await useStateDemo.locator('button', { hasText: 'Decrement' }).click()
    await expect(useStateDemo.locator('strong').first()).toHaveText('2')

    // Reset clears state.
    await useStateDemo.locator('button', { hasText: 'Reset' }).click()
    await expect(useStateDemo.locator('strong').first()).toHaveText('0')
  })

  test('multiple demos can co-exist + interact independently (lifecycle smoke)', async ({
    page,
  }) => {
    // The example app mounts ~14 demo sections. They each have their own
    // hook state. Verifying independence + no console errors covers the
    // "mount/unmount lifecycle works for many components" surface.
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Filter dev-warn noise that's not actually an error
        if (text.includes('favicon')) return
        errors.push(text)
      }
    })

    const demos = page.locator('section.demo')
    await expect(demos).not.toHaveCount(0)
    const count = await demos.count()
    expect(count).toBeGreaterThanOrEqual(10) // app declares 14, allow drift

    // Click Increment in the first demo. This proves at least one component
    // is interactive after the full app finished mounting.
    await demos.first().locator('button', { hasText: 'Increment' }).click()
    await expect(demos.first().locator('strong').first()).toHaveText('1')

    expect(errors).toEqual([])
  })
})
