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

/**
 * Wake and wait for every island on a static page: scroll through so each
 * `visible` island hydrates, then wait until each one is live
 * (`data-island-hydrated`, set by @pyreon/server once `hydrateRoot` returns)
 * or reported broken (`data-island-error`, which the caller's error checks
 * then see). Interaction-strategy islands are left asleep. Scrolls back to
 * the top before returning.
 */
export async function waitForIslands(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 40))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForFunction(() =>
    [...document.querySelectorAll('pyreon-island')].every(
      (el) =>
        el.getAttribute('data-hydrate') === 'interaction' ||
        el.getAttribute('data-hydrate') === 'never' ||
        el.hasAttribute('data-island-hydrated') ||
        el.hasAttribute('data-island-error'),
    ),
  )
}
