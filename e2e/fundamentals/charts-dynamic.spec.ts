import { expect, test } from '@playwright/test'
import { waitForHydration } from '../hydration-barrier'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/charts')
  await waitForHydration(page)
})

test('the real chart demo reveals and hides its first conditional mark', async ({ page }) => {
  const section = page.getByTestId('conditional-chart')
  await expect(section.locator('canvas')).toHaveCount(0)
  await section.getByRole('button', { name: 'Show chart' }).click()
  await expect(section.locator('canvas')).toBeVisible()
  await section.getByRole('button', { name: 'Hide chart' }).click()
  await expect(section.locator('canvas')).toHaveCount(0)
  await section.getByRole('button', { name: 'Show chart' }).click()
  await expect(section.locator('canvas')).toBeVisible()
})

test('the real donut demo repaints options and data without replacing the canvas', async ({ page }) => {
  const section = page.getByTestId('donut-chart')
  const canvas = section.locator('canvas')
  await expect(canvas).toBeVisible()
  const original = await canvas.elementHandle()
  const before = await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())
  await section.getByRole('button', { name: 'Change donut size' }).click()
  await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())).not.toBe(before)
  expect(await original!.evaluate((el) => el.isConnected)).toBe(true)
  await section.getByRole('button', { name: 'Randomize Values' }).click()
  expect(await original!.evaluate((el) => el.isConnected)).toBe(true)
  await expect(canvas).toHaveCount(1)
})
