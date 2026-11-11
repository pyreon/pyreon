import { expect, test } from '@playwright/test'

import { waitForHydration } from './hydration-barrier'

/**
 * `@pyreon/i18n` real-app e2e — the Shop section renders translations, not
 * keys, in every locale.
 *
 * The Shop rendered raw keys (`shop:title`, `product:tshirt-classic.title`):
 * its components look keys up as `namespace:key` while the dictionaries were
 * registered in the default namespace, and i18n renders a missing key as the
 * key itself. The check is deliberately generic: no visible text on the page
 * may look like a `namespace:key` of the Shop's three namespaces.
 */

const RAW_KEY = /\b(?:shop|category|product):[\w.-]+/

async function expectNoRawKeys(page: import('@playwright/test').Page): Promise<void> {
  const text = await page.locator('main, body').first().innerText()
  expect(text.match(RAW_KEY)?.[0] ?? null, 'a raw translation key is on screen').toBeNull()
}

test('the Shop renders translated text, not raw keys, in every locale', async ({ page }) => {
  await page.goto('/shop')
  await waitForHydration(page)
  await expect(page.getByText('Pyreon Store').first()).toBeVisible()
  await expect(page.getByText('Classic Tee').first()).toBeVisible()
  await expectNoRawKeys(page)

  await page.getByRole('button', { name: /\bDE\b/ }).click()
  await expect(page.getByText('In den Warenkorb').first()).toBeVisible()
  await expectNoRawKeys(page)

  await page.getByRole('button', { name: /\bFR\b/ }).click()
  await expectNoRawKeys(page)
})
