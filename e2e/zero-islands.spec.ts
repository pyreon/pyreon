import { expect, test } from '@playwright/test'
import { waitForHydration } from './hydration-barrier'

// Islands in @pyreon/zero — self-hydrating, end-to-end. The /island-demo route
// declares an island via `import { island } from '@pyreon/zero'` (no
// @pyreon/server dep) and entry-client is just `startClient({ routes })`. zero
// re-mounts route content client-side (RouterView reactive child), so the
// island OWNS its hydration: it renders the marker and on mount loads its chunk
// + mounts the component per `data-hydrate`. ZERO manual wiring. Verifies
// Bug 2/E (islands usable in zero) + Bug 3/F (reactivity works in the hydrated
// island — the dual-@pyreon/core 'reading ref' crash is gone).

test.describe('islands in @pyreon/zero (self-hydrating)', () => {
  test('island SSR-renders, hydrates with no manual wiring, and is reactive', async ({ page }) => {
    await page.goto('/island-demo')

    const probe = page.getByTestId('island-probe')
    // SSR rendered the island content inside its <pyreon-island> marker.
    await expect(probe).toBeVisible()
    await expect(probe).toHaveText('island clicks: 0')

    // hydrate: 'visible' → bring it into view to trigger the auto-wired
    // hydrateIslandsAuto. Then a click must drive the signal — retried so the
    // click lands after the dynamic chunk loads + the handler attaches (a
    // pre-hydration click is a harmless no-op).
    await probe.scrollIntoViewIfNeeded()
    await expect(async () => {
      await probe.click()
      await expect(probe).toHaveText(/island clicks: [1-9]/)
    }).toPass({ timeout: 15_000 })
  })

  test('each click increments the island signal by exactly 1 (no +2 double-fire)', async ({
    page,
  }) => {
    // Regression for the v0.35.0 islands "+2 per click" bug: the island
    // self-hydrates via hydrateRoot(islandMarker), installing a delegation root
    // INSIDE the app's mount root, so a click on the island's button was walked
    // by BOTH roots → the handler fired twice. The specs above assert only
    // `[1-9]` (any non-zero), which a +2 double-fire passes; this asserts the
    // per-click DELTA is exactly 1.
    await page.goto('/island-demo')
    const probe = page.getByTestId('island-probe')
    await expect(probe).toBeVisible()
    await probe.scrollIntoViewIfNeeded()

    const read = async (): Promise<number> => {
      const t = (await probe.textContent()) ?? ''
      const m = t.match(/island clicks: (\d+)/)
      return m ? Number(m[1]) : Number.NaN
    }

    // Warm up past the hydration race: retry-click until the count moves off 0,
    // confirming the handler is attached (pre-hydration clicks are no-ops).
    await expect(async () => {
      await probe.click()
      expect(await read()).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000 })

    // Hydrated now. Three DETERMINISTIC clicks must add exactly 3 — a +2
    // double-fire (overlapping app-root + island delegation roots) adds 6.
    const before = await read()
    await probe.click()
    await probe.click()
    await probe.click()
    expect(await read()).toBe(before + 3)
  })

  test('page hydration ADOPTS the server-rendered island (no replace, interior kept until its trigger)', async ({
    page,
  }) => {
    // The island is async on the server (wrapped in `<!--$pas-->…<!--$pae-->`)
    // and sync on the client (the bare `<pyreon-island>` marker). The page's
    // hydration must adopt the server marker inside that range — it used to
    // hydrate against the `$pas` comment, mismatch, and replace the island with
    // an empty client marker, blanking the demo until it scrolled into view.
    // Capture the server nodes before the deferred client entry runs, and
    // record every `<pyreon-island>` removed afterwards.
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>
      const removed: string[] = []
      w.__removedIslands = removed
      new MutationObserver((records) => {
        for (const r of records) {
          for (const n of Array.from(r.removedNodes)) {
            if (n instanceof Element && (n.matches('pyreon-island') || n.querySelector('pyreon-island')))
              removed.push(n.outerHTML.slice(0, 80))
          }
        }
      }).observe(document, { childList: true, subtree: true })
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive') {
          w.__serverIsland = document.querySelector('pyreon-island[data-component="IslandProbe"]')
          w.__serverProbe = document.querySelector('[data-testid="island-probe"]')
        }
      })
    })
    // Trailing slash: `vite preview` serves the PRERENDERED
    // `dist/island-demo/index.html` only for `/island-demo/`; `/island-demo`
    // falls back to the root shell, where the route is client-MOUNTED and no
    // server island exists to adopt.
    await page.goto('/island-demo/')
    await waitForHydration(page)

    const state = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      return {
        hadServerIsland: w.__serverIsland != null,
        sameIsland:
          document.querySelector('pyreon-island[data-component="IslandProbe"]') === w.__serverIsland,
        // Not scrolled into view yet, so the island has not hydrated: its
        // server-rendered interior must still be the same node.
        sameProbe: document.querySelector('[data-testid="island-probe"]') === w.__serverProbe,
        removed: w.__removedIslands as string[],
      }
    })
    expect(state.hadServerIsland).toBe(true)
    expect(state.removed).toEqual([])
    expect(state.sameIsland).toBe(true)
    expect(state.sameProbe).toBe(true)
  })

  test('hydration produces no console / page errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.goto('/island-demo')
    const probe = page.getByTestId('island-probe')
    await probe.scrollIntoViewIfNeeded()
    await expect(async () => {
      await probe.click()
      await expect(probe).toHaveText(/island clicks: [1-9]/)
    }).toPass({ timeout: 15_000 })

    // No "Duplicate @pyreon/server" sentinel, no "Cannot read properties of
    // undefined (reading 'ref')" — the failure modes from the bug report.
    expect(errors).toEqual([])
  })
})

test.describe('auto-named island (no explicit name — plugin-derived)', () => {
  test('an island declared WITHOUT a name hydrates and is reactive', async ({ page }) => {
    await page.goto('/island-demo')
    const probe = page.getByTestId('auto-island-probe')
    // SSR rendered it inside a marker whose data-component is the DERIVED
    // name (AutoIsland$<file-hash>) — assert the marker shape explicitly so
    // a regression to an empty/missing name fails here, not just on click.
    await expect(probe).toBeVisible()
    const markerName = await probe.evaluate(
      (el) => el.closest('pyreon-island')?.getAttribute('data-component') ?? '',
    )
    expect(markerName).toMatch(/^AutoIsland\$[0-9a-z]{1,6}$/)
    await expect(probe).toHaveText('auto island clicks: 0')

    await probe.scrollIntoViewIfNeeded()
    await expect(async () => {
      await probe.click()
      await expect(probe).toHaveText(/auto island clicks: [1-9]/)
    }).toPass({ timeout: 15_000 })
  })
})
