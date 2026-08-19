import type { Page } from '@playwright/test'

/**
 * Wait until the client has taken ownership of the app — NOT merely until
 * markup is visible.
 *
 * Those are different things, and any spec that CLICKS or TYPES depends on the
 * difference. Until recently they were indistinguishable by accident:
 * `RouterView` renders its route through a reactive accessor and every
 * fs-router route is `lazy()`, so the accessor's first render deleted the
 * server range. The page blanked and refilled when the chunk landed, and
 * nothing clickable existed in between — so any node a locator matched was
 * necessarily the client-mounted one, already carrying its handlers.
 *
 * That accident disappears as soon as hydration ADOPTS the server DOM rather
 * than rebuilding it, which is the direction the framework is moving. A locator
 * then matches a fully-rendered, visible, DEAD control and the interaction is
 * swallowed. The failure surfaces against the POST-interaction state — "element
 * not found", "expected text not present" — which reads as a reactivity or
 * validation bug rather than a timing one. Measured on that shape: ~48ms
 * locally, unbounded on a cold dev transform or a slow network.
 *
 * `startClient` sets `data-pyreon-hydrated` on the container AFTER mount/hydrate
 * returns, so its presence means handlers are attached rather than that markup
 * arrived.
 *
 * Shared deliberately: this was first fixed in `ui-showcase-regression.spec.ts`
 * alone, and the identical failure then appeared across the fundamentals
 * suites. A correction that cannot be stated as a repo-wide invariant gets
 * re-discovered by whoever writes the next spec.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.locator('[data-pyreon-hydrated]').first().waitFor({ state: 'attached' })
}
