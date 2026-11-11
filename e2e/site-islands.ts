import type { Page } from '@playwright/test'

/**
 * Marketing pages are static HTML with islands (docs/src/site/render-mode.ts):
 * nothing sets `data-pyreon-hydrated`, because the app never starts. The nav
 * island marks its bar `data-hydrated` once its handlers are attached; wait
 * for that before clicking anything in the shell.
 */
export async function waitForNav(page: Page): Promise<void> {
  await page.locator('.s-bar[data-hydrated]').waitFor({ state: 'attached' })
}

/** Wait for a plain-markup island root that marks itself `data-hydrated`. */
export async function waitForIsland(page: Page, selector: string): Promise<void> {
  await page.locator(`${selector}[data-hydrated]`).waitFor({ state: 'attached' })
}
