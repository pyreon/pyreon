import { expect, test } from '@playwright/test'

/**
 * `@pyreon/form` `useFormState` selector-narrowing — real-Chromium gate.
 *
 * The unit-level regression in `packages/fundamentals/form/src/tests/
 * form-additional.test.tsx` runs in happy-dom; this spec is the real-
 * browser regression gate. Without it, a future Vite/bundler change
 * that drops the `process.env.NODE_ENV` dev-gate counter (or a
 * `useFormState` regression that re-introduces the eager-scan summary)
 * would pass unit tests against the mock environment but ship the
 * regression to consumers.
 *
 * The forms-stress section in `examples/perf-dashboard` exposes the
 * exact hook surface used by `scripts/perf/record.ts`'s journey
 * driver — same code path, same counter contract, same atomic
 * computeds shared via per-form WeakMap. We just exercise it from a
 * normal Playwright test instead of the perf-record CLI, and assert
 * the counter values via `window.__pyreon_perf__.snapshot()` (set up
 * by `install()` in `main.tsx` when DEV).
 *
 * Scale: 100 fields. The counter contract is independent of N — at
 * any N, selector path produces `fieldsRead === 0`, no-selector path
 * produces `fieldsRead === N`. We use 100 (vs the 10k stress
 * benchmark) so the spec runs in <2s on CI hardware.
 *
 * Bisect-verified: reverting `use-form-state.ts` to the eager-scan
 * shape fails this spec with `expected 0, received 100` (matching the
 * unit test failure with `expected 0, received 50`).
 */

interface PerfWindow {
  __pyreon_perf__?: { snapshot: () => Record<string, number>; reset: () => void }
  __pyreon_perf_forms?: {
    setScale: (n: number) => void
    triggerStateRead: () => void
    triggerStateReadSelector: () => void
    fillField: (name: string, value: string) => void
    resetField: (name: string) => void
  }
}

test.describe('useFormState selector narrowing — real-Chromium contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => {
      const w = window as unknown as PerfWindow
      w.__pyreon_perf_forms?.setScale(100)
    })
    await page.locator('[data-testid="forms-stress-ready"]').waitFor()
  })

  test('selector reading isValid does NOT scan field maps after error flip', async ({
    page,
  }) => {
    const counters = await page.evaluate(() => {
      const w = window as unknown as PerfWindow
      const perf = w.__pyreon_perf__
      const hooks = w.__pyreon_perf_forms
      if (!perf || !hooks) throw new Error('perf hooks not installed')

      // Touch a field once so the form is in a real-app shape (had
      // some user interaction). Reset counters AFTER setup.
      hooks.resetField('f0')
      hooks.fillField('f0', 'seeded')
      perf.reset()

      // Reset → fill → trigger selector read. The reset+fill produce
      // the field-write signals; the selector read recomputes whatever
      // the selector tracks. Pre-fix that meant `formStateScan.fieldsRead`
      // = 100 (full scan via the eager summary). Post-fix the selector
      // only reads `summary.isValid`, which routes to the O(1)
      // `_invalidCount` signal — zero scans.
      hooks.resetField('f0')
      hooks.fillField('f0', `e2e-${Date.now()}`)
      hooks.triggerStateReadSelector()

      return perf.snapshot()
    })

    expect(counters['form.formStateScan.fieldsRead'] ?? 0).toBe(0)
    expect(counters['form.formStateScan'] ?? 0).toBe(0)
  })

  test('no-selector read DOES materialize field maps (contract control)', async ({
    page,
  }) => {
    // Sibling test that proves the counter is wired and emits when it
    // SHOULD — guards against the false-positive failure mode where
    // `fieldsRead === 0` because the counter was silently dropped at
    // build time (not because the selector narrowed).
    const counters = await page.evaluate(() => {
      const w = window as unknown as PerfWindow
      const perf = w.__pyreon_perf__
      const hooks = w.__pyreon_perf_forms
      if (!perf || !hooks) throw new Error('perf hooks not installed')

      hooks.resetField('f0')
      hooks.fillField('f0', 'seeded')
      perf.reset()

      hooks.resetField('f0')
      hooks.fillField('f0', `e2e-${Date.now()}`)
      hooks.triggerStateRead()

      return perf.snapshot()
    })

    // No-selector path materializes touched + dirty + errors maps =
    // 3 atom computeds × 100 fields = 300 fieldsRead reads.
    expect(counters['form.formStateScan'] ?? 0).toBe(1)
    expect(counters['form.formStateScan.fieldsRead'] ?? 0).toBeGreaterThanOrEqual(100)
  })
})
