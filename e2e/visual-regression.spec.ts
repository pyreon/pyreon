/**
 * Visual regression tests for the Pyreon UI System Showcase.
 *
 * Captures screenshots of key UI states for comparison against baselines.
 * Run via: bun run visual-test:capture
 */

import { test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const CURRENT_DIR = join(__dirname, '../scripts/visual-test/current')

// Ensure output directory exists
mkdirSync(CURRENT_DIR, { recursive: true })

async function saveScreenshot(page: any, name: string, options?: { fullPage?: boolean }) {
  const buffer = await page.screenshot({
    fullPage: options?.fullPage ?? false,
    animations: 'disabled',
  })
  writeFileSync(join(CURRENT_DIR, `${name}.png`), buffer)
}

// ── Full page captures ──────────────────────────────────────────────────────

test.describe('visual regression — layout', () => {
  test('home — full page', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#app')
    // Wait for animations and fonts to settle
    await page.waitForTimeout(500)
    await saveScreenshot(page, 'home-full', { fullPage: true })
  })

  test('home — above the fold', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#app')
    await page.waitForTimeout(500)
    await saveScreenshot(page, 'home-above-fold')
  })
})

// ── Dashboard tab ───────────────────────────────────────────────────────────

test.describe('visual regression — dashboard', () => {
  test('dashboard tab — stats and table', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#app')
    await page.waitForTimeout(500)
    // Dashboard is the default tab
    await saveScreenshot(page, 'dashboard-tab', { fullPage: true })
  })

  test('dashboard tab — search filtering', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#app')
    await page.waitForTimeout(300)

    const searchInput = page.locator('input[type="text"]').first()
    if (await searchInput.isVisible()) {
      await searchInput.fill('button')
      // Wait for debounce (300ms) + render
      await page.waitForTimeout(500)
      await saveScreenshot(page, 'dashboard-search', { fullPage: true })
    }
  })
})

// ── Components tab ──────────────────────────────────────────────────────────

test.describe('visual regression — components', () => {
  test('components tab — all sections', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#app')
    await page.waitForTimeout(300)

    // Click the Components tab
    const componentsTab = page.locator('button', { hasText: 'Components' })
    await componentsTab.click()
    await page.waitForTimeout(500)
    await saveScreenshot(page, 'components-tab', { fullPage: true })
  })
})

// ── Hooks tab ───────────────────────────────────────────────────────────────

test.describe('visual regression — hooks', () => {
  test('hooks tab — all sections', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#app')
    await page.waitForTimeout(300)

    // Click the Hooks tab
    const hooksTab = page.locator('button', { hasText: 'Hooks' })
    await hooksTab.click()
    await page.waitForTimeout(500)
    await saveScreenshot(page, 'hooks-tab', { fullPage: true })
  })
})

// ── Dark mode ───────────────────────────────────────────────────────────────

test.describe('visual regression — dark mode', () => {
  test('home — dark mode', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#app')
    await page.waitForTimeout(300)

    // Toggle dark mode
    const darkToggle = page.locator('button', { hasText: 'Dark' })
    await darkToggle.click()
    await page.waitForTimeout(300)
    await saveScreenshot(page, 'home-dark', { fullPage: true })
  })

  test('components tab — dark mode', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#app')
    await page.waitForTimeout(300)

    // Toggle dark mode
    const darkToggle = page.locator('button', { hasText: 'Dark' })
    await darkToggle.click()
    await page.waitForTimeout(200)

    // Switch to Components tab
    const componentsTab = page.locator('button', { hasText: 'Components' })
    await componentsTab.click()
    await page.waitForTimeout(500)
    await saveScreenshot(page, 'components-dark', { fullPage: true })
  })
})

// ── Modal ───────────────────────────────────────────────────────────────────

test.describe('visual regression — modal', () => {
  test('modal overlay open', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#app')
    await page.waitForTimeout(300)

    const modalBtn = page.locator('button', { hasText: 'Open modal' })
    // The button may be inside a span wrapper
    if (await modalBtn.isVisible()) {
      await modalBtn.click()
      await page.waitForTimeout(500)
      await saveScreenshot(page, 'modal-open')
    }
  })
})
