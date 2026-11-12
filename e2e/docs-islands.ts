import type { Page } from '@playwright/test'
import { waitForNav } from './site-islands'

/**
 * Docs pages are static HTML with islands (docs/src/docs-ui/islands.ts), like
 * every marketing page: nothing sets `data-pyreon-hydrated`. Wait for the nav
 * island, the sidebar's search box (it owns ⌘K) and the page's enhance island
 * (code copy, code-group tabs, scroll-spy, heading anchors) before
 * interacting. Islands that hydrate on interaction replay the click that
 * woke them; wait for their own `data-hydrated` before keyboard-only use.
 */
export async function waitForDocs(page: Page): Promise<void> {
  await waitForNav(page)
  await page.locator('.dx-aside .dx-search[data-hydrated]').waitFor({ state: 'attached' })
  await page.locator('.dx-page[data-enhanced]').waitFor({ state: 'attached' })
}
