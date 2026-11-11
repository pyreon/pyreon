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
    [...document.querySelectorAll('pyreon-island')].every((el) => {
      const how = el.getAttribute('data-hydrate')
      if (how === 'interaction' || how === 'never') return true
      if (el.hasAttribute('data-island-hydrated') || el.hasAttribute('data-island-error')) return true
      // A `visible` island whose content has no box at this width (a hidden
      // variant) never becomes visible, by design.
      const boxes = [el, ...el.children].map((n) => n.getBoundingClientRect())
      return how === 'visible' && boxes.every((r) => r.width === 0 || r.height === 0)
    }),
  )
}

/**
 * Record every island's server-rendered root elements as the page parses,
 * so `replacedIslandRoots` can tell adoption from a remount: an island that
 * adopts keeps the very elements the server sent (their content may then
 * change: a chart draws, a list renders); one that remounts swaps them for
 * new ones. Call before `page.goto`.
 */
export async function trackIslandRoots(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __islandRoots: [Element, Element[]][] }
    w.__islandRoots = []
    document.addEventListener('DOMContentLoaded', () => {
      for (const el of document.querySelectorAll('pyreon-island')) w.__islandRoots.push([el, [...el.children]])
    })
  })
}

/** Islands (by `data-component`) that are live but no longer hold their server root elements. */
export async function replacedIslandRoots(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __islandRoots: [Element, Element[]][] }
    return w.__islandRoots
      .filter(([el, roots]) => el.hasAttribute('data-island-hydrated') && roots.some((r) => r.parentNode !== el))
      .map(([el]) => el.getAttribute('data-component') ?? '?')
  })
}

/** Scroll an island into view and wait until it is live. */
export async function hydrateIsland(page: Page, selector: string): Promise<void> {
  const island = page.locator(selector).first()
  await island.scrollIntoViewIfNeeded()
  await page.locator(`${selector}[data-island-hydrated], ${selector}[data-island-error]`).first().waitFor({ state: 'attached' })
}
