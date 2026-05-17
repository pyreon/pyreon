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
 * Fix: the plugin's accept callback hands the FRESH module Vite already
 * re-evaluated to `globalThis.__pyreon_hmr_swap__` (registered by
 * `@pyreon/router`), keyed by the module id. The coordinator swaps the
 * new component into every matched route record whose lazy `_hmrId`
 * matches and bumps `_loadingSignal` → `RouterView` re-renders that
 * subtree IN PLACE — no page reload, so the module-scope signal's value
 * survives via `__pyreon_hmr_registry__`. No match / no coordinator →
 * `import.meta.hot.invalidate()` → automatic reload (never manual).
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

    // ── HMR-readiness gate (closes the cold-boot race) ───────────────────
    // CI's first failure: the file was edited BEFORE Vite's HMR WebSocket
    // had connected and BEFORE the router registered its swap coordinator,
    // so Vite's module-update never reached a handler — neither the
    // in-place swap NOR the `invalidate()` reload fired, leaving the page
    // stuck at MARKER_V1. Locally the dev server is warm enough that the
    // race is never lost; a cold loaded CI runner loses it. Gate the edit
    // on BOTH preconditions being demonstrably true:
    //   • `networkidle` — Vite finished its initial transform/optimize and
    //     the `@vite/client` HMR socket handshake has completed.
    //   • `__pyreon_hmr_swap__` is a function — `@pyreon/router`'s
    //     createRouter ran in the browser and registered the coordinator
    //     the injected `accept` callback dispatches to.
    await page.waitForLoadState('networkidle')
    await page.waitForFunction(
      () =>
        typeof (window as unknown as Record<string, unknown>)
          .__pyreon_hmr_swap__ === 'function',
      undefined,
      { timeout: 15_000 },
    )

    // ── CI-DIAGNOSTIC (remove once the gate is reliably green) ───────────
    // This gate is CI-only-reproducible (overlayfs inotify). Local macOS
    // always passes, so any further failure must be diagnosed from the CI
    // log itself, not guessed from a local run. These listeners print the
    // Vite HMR websocket traffic + whether the swap coordinator fired, so
    // a failing CI run shows EXACTLY where the chain broke (watcher never
    // delivered → no WS update frame; delivered but coordinator missed →
    // WS frame present, no SWAP line).
    page.on('console', (m) => {
      const t = m.text()
      if (t.includes('[vite]') || t.startsWith('SWAP'))
        console.log('[ci-diag console]', m.type(), t)
    })
    page.on('websocket', (ws) => {
      console.log('[ci-diag ws-open]', ws.url())
      ws.on('framereceived', (d) => {
        const s = String(d.payload)
        if (
          s.includes('update') ||
          s.includes('reload') ||
          s.includes('prune')
        )
          console.log('[ci-diag ws-recv]', s.slice(0, 200))
      })
    })
    await page.evaluate(() => {
      const g = window as unknown as Record<string, unknown>
      const orig = g.__pyreon_hmr_swap__ as
        | ((id: string, mod: unknown) => boolean)
        | undefined
      g.__pyreon_hmr_swap__ = (id: string, mod: unknown) => {
        const r = orig ? orig(id, mod) : false
        // eslint-disable-next-line no-console
        console.log(`SWAP-CALLED ${id} -> ${r}`)
        return r
      }
    })

    // ── The edit ────────────────────────────────────────────────────────
    writeFileSync(PROBE, original.replace('MARKER_V1', 'MARKER_V2'), 'utf8')
    // Deterministically trigger Vite's REAL HMR pipeline for the file we
    // just wrote — the dev-only `pyreon:hmr-test-trigger` plugin calls
    // `server.watcher.emit('change', f)`, the exact entrypoint a genuine
    // fs event uses. This removes the dependency on the OS file watcher
    // (unreliable on GHA Linux overlayfs / Bun; polling blind in Vite 8)
    // WITHOUT faking any part of the framework HMR codepath under test.
    const touch = await page.request.post(
      `/__pyreon_hmr_touch__?f=${encodeURIComponent(PROBE)}`,
    )
    console.log(
      `[ci-diag] edit written; touch status=${touch.status()} body=${(
        await touch.text()
      ).slice(0, 80)}`,
    )

    // (1) HMR actually fires — the marker reflects the NEW source.
    //     Pre-fix this never happens (bare accept → stale) and times out.
    //     30s budget: a cold CI runner's FIRST post-boot HMR round-trip
    //     (fs-watch debounce → invalidate → WS push → accept → coordinator
    //     → RouterView re-render) is far slower than the ~1s local path.
    await expect(page.getByTestId('hmr-marker')).toHaveText('MARKER_V2', {
      timeout: 30_000,
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
