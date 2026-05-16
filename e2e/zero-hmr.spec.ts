import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Zero component-HMR regression gate.
 *
 * Bug (pre-fix): `@pyreon/vite-plugin`'s `injectHmr` emitted a bare
 * `import.meta.hot.accept()` (no callback). Vite re-evaluated the edited
 * route module but NOTHING re-rendered the mounted tree, AND the
 * self-accept suppressed Vite's full-reload fallback — so a component/JSX
 * edit produced a silently-stale UI until the user pressed refresh BY HAND.
 *
 * Fix: the plugin now emits a coordinator-driven accept that calls
 * `globalThis.__pyreon_hmr_reload__` (registered by `@pyreon/router`),
 * which re-resolves the active route's lazy component. The identity
 * changes → `RouterView` re-renders that subtree IN PLACE — no page
 * reload, so the module-scope signal's value survives via
 * `__pyreon_hmr_registry__`.
 *
 * This spec proves all three at once against a real zero dev server in
 * real Chromium:
 *   1. the marker text updates after a source edit (HMR actually fires),
 *   2. with NO page reload (a window sentinel survives),
 *   3. and the module-scope `count` signal keeps its value across the swap.
 *
 * Bisect contract: against the pre-fix bare `accept()`, step (1) times
 * out — `hmr-marker` stays `MARKER_V1` forever (stale UI, manual refresh
 * required), which is exactly the reported bug.
 */

// Playwright runs with cwd = the config's directory (the worktree root).
const PROBE = resolve(
  process.cwd(),
  'examples/ssr-showcase/src/routes/hmr-probe.tsx',
)

test('editing a route component hot-updates the DOM in place, no reload, signal preserved', async ({
  page,
}) => {
  const original = readFileSync(PROBE, 'utf8')
  expect(original).toContain('MARKER_V1')

  try {
    await page.goto('/hmr-probe')

    // Initial SSR + hydration: committed marker + zeroed signal.
    await expect(page.getByTestId('hmr-marker')).toHaveText('MARKER_V1')
    await expect(page.getByTestId('hmr-count')).toHaveText('0')

    // Sentinel on `window` — a full page reload wipes it; an in-place
    // HMR re-render does not. This is how we prove "no reload".
    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__hmrSentinel = 'alive'
    })

    // Mutate runtime state so we can prove it's preserved across the swap.
    await page.getByTestId('hmr-inc').click()
    await page.getByTestId('hmr-inc').click()
    await page.getByTestId('hmr-inc').click()
    await expect(page.getByTestId('hmr-count')).toHaveText('3')

    // ── The edit ────────────────────────────────────────────────────────
    writeFileSync(PROBE, original.replace('MARKER_V1', 'MARKER_V2'), 'utf8')

    // (1) HMR actually fires — the marker reflects the NEW source.
    //     Pre-fix this never happens (bare accept → stale) and times out.
    await expect(page.getByTestId('hmr-marker')).toHaveText('MARKER_V2', {
      timeout: 15_000,
    })

    // (2) No page reload — the window sentinel survived the swap.
    const sentinel = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__hmrSentinel,
    )
    expect(sentinel).toBe('alive')

    // (3) The module-scope `count` signal kept its value across the
    //     no-reload module swap (signal-preserving HMR).
    await expect(page.getByTestId('hmr-count')).toHaveText('3')
  } finally {
    // Leave the committed file byte-identical regardless of outcome.
    writeFileSync(PROBE, original, 'utf8')
  }
})
