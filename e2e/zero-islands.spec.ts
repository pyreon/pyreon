import { expect, test } from '@playwright/test'

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
