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
  reload: (opts?: { waitUntil?: string }) => Promise<unknown>
}

export const journeys: Record<string, (page: PageLike) => Promise<void>> = {
  /**
   * Baseline: reload the page and let the full boot happen under fresh
   * counters. Record loop resets counters before the journey runs, so the
   * reload-then-let-the-app-boot flow captures mount + first-paint work.
   */
  boot: async (page) => {
    await page.reload({ waitUntil: 'networkidle' })
    // Wait for the first paint to settle — the install() in main.tsx re-runs
    // after reload so the harness is live again by this point.
    await page.waitForSelector('[data-testid="toggle-theme"]')
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

  // ─── Canonical journeys (architectural-experiments-2026-q2 plan) ───────────
  //
  // Three real-app-shape workloads — wins/regressions show up the way they
  // would in production, not just on synthetic microbenchmarks. Every
  // architectural experiment's PR runs all three and reports the delta.

  /**
   * **chat** — append-heavy list, ~1000 messages total.
   *
   * Resets the message log to 50, then appends 10 batches of 100 messages
   * incrementally (1050 total). Models a chat / live-feed shape: monotonic
   * append, no key reordering, mountFor takes the append-only fast path.
   * Stresses `runtime.mountFor.lisOps` (should stay 0 throughout).
   */
  chat: async (page) => {
    await page.click('[data-testid="chat-reset"]')
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="chat-append-100"]')
    }
  },

  /**
   * **dashboard** — 50 reactive widgets, 5s of churn.
   *
   * Starts a 100ms-tick interval that updates 5 random widget values per
   * tick (50 updates/sec). After 5s, ~250 widget updates have fired.
   * Stresses `signalWrite` + `effectRun` + `styler.resolve` cascades in
   * a real-app shape (live-data dashboard, observability panel).
   */
  dashboard: async (page) => {
    await page.click('[data-testid="dashboard-churn-start"]')
    await new Promise((r) => setTimeout(r, 5000))
    await page.click('[data-testid="dashboard-churn-stop"]')
  },

  /**
   * **form** — 30 fields, 60 keystrokes total, cross-field validation.
   *
   * Types 2 characters into 28 plain fields (56 keystrokes), then types
   * matching 6-char passwords into the password+confirm fields (12
   * keystrokes plus validation re-run on each). Stresses per-field
   * `signalWrite` + `computedRecompute` for the `passwordsMatch` derived
   * signal. Models a real signup / settings form keystroke shape.
   */
  form: async (page) => {
    for (let i = 0; i < 28; i++) {
      await page.fill(`[data-testid="form-field-${i}"]`, `v${i}`)
    }
    await page.fill('[data-testid="form-password"]', 'secret')
    await page.fill('[data-testid="form-confirm-password"]', 'secret')
  },
}
