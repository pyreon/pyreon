/**
 * Journey catalog for scripts/perf/record.ts.
 *
 * Each journey is a named async function that takes a Playwright-ish `page`
 * handle (just `click` / `fill` / `evaluate` — typed loosely so the example
 * doesn't need a Playwright dep). The record script imports this module,
 * iterates the journeys, and captures counter snapshots around each run.
 *
 * Journeys should be short (< 2s each), deterministic (same interaction
 * every run), and read-only of state that would affect subsequent
 * journeys — this script runs them sequentially against the same page.
 */

export interface PageLike {
  click: (selector: string) => Promise<void>
  fill: (selector: string, value: string) => Promise<void>
  waitForSelector: (selector: string) => Promise<void>
  evaluate: <T>(fn: () => T) => Promise<T>
}

export const journeys: Record<string, (page: PageLike) => Promise<void>> = {
  /** Baseline: just boot, counters after initial mount. */
  boot: async () => {
    // Nothing — boot counters are captured by the record loop before any
    // interaction runs.
  },

  /** Theme swap — stresses the dynamic-styled re-resolve path. */
  toggleTheme: async (page) => {
    await page.click('[data-testid="toggle-theme"]')
  },

  /** Theme-thrash — 10 toggles. */
  themeThrash: async (page) => {
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="toggle-theme"]')
    }
  },

  /** List shuffle — stresses mountFor LIS + keyed reorder. */
  shuffleRows: async (page) => {
    await page.click('[data-testid="shuffle-rows"]')
  },

  /** List regenerate — brand-new array, forces mount/unmount churn. */
  regenRows: async (page) => {
    await page.click('[data-testid="regen-rows"]')
  },

  /** Open + close modal — stresses runtime.mount / runtime.unmount. */
  modalCycle: async (page) => {
    await page.click('[data-testid="open-modal"]')
    await page.waitForSelector('[data-testid="modal-backdrop"]')
    await page.click('[data-testid="close-modal"]')
  },
}
