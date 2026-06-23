import { expect, test } from '@playwright/test'

/**
 * Real-app toast e2e — drives the fundamentals-playground ToastDemo in real
 * Chromium. The `@pyreon/toast` component itself is unit-proven by
 * `toaster.browser.test.tsx`; this verifies it works END-TO-END in a real app:
 * a real button click fires `toast.*`, the toast renders (NOT stuck in the
 * invisible `--entering` state — the bug #1719 fixed), and the dismiss button
 * (a Portal'd, delegated-event handler — the other #1719 fix) actually removes
 * it on click.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/toast')
  await page.waitForLoadState('networkidle')
})

test('toast.success renders a visible toast with the right message', async ({ page }) => {
  await page.getByTestId('toast-success').click()
  const toast = page.locator('.pyreon-toast').first()
  await expect(toast).toBeVisible()
  await expect(toast).toContainText('Saved successfully!')
  await expect(toast).toHaveClass(/pyreon-toast--success/)
  // The #1719 fix: the entering→visible promotion must reflect — the row must
  // NOT be stuck in `--entering` (opacity:0 = invisible).
  await expect(toast).not.toHaveClass(/pyreon-toast--entering/)
})

test('different variants render with their type class', async ({ page }) => {
  await page.getByTestId('toast-error').click()
  await expect(page.locator('.pyreon-toast--error')).toContainText('Something went wrong')
  await page.getByTestId('toast-info').click()
  await expect(page.locator('.pyreon-toast--info')).toContainText('FYI')
})

test('clicking the × dismiss button removes the toast (Portal delegated click)', async ({
  page,
}) => {
  await page.getByTestId('toast-plain').click()
  const toast = page.locator('.pyreon-toast').filter({ hasText: 'Plain toast' })
  await expect(toast).toBeVisible()
  await toast.getByRole('button', { name: 'Dismiss' }).click()
  await expect(toast).toHaveCount(0)
})

test('toast.promise transitions loading → success in the live DOM', async ({ page }) => {
  await page.getByTestId('toast-promise-success').click()
  const toast = page.locator('.pyreon-toast').first()
  await expect(toast).toBeVisible()
  // loading first, then the resolved message (the update must reflect — #1719).
  await expect(toast).toHaveClass(/pyreon-toast--success/, { timeout: 4000 })
})
