import { expect, test } from '@playwright/test'

/**
 * `@pyreon/virtual` real-app e2e — locks in that the dashboard's
 * `CustomersVirtualList` (1,024 customers) virtualizes correctly in a
 * realistic, distinct mounting path the fundamentals demo doesn't exercise:
 *
 *   • TAB-GATED LATE MOUNT — the list is `{() => activeTab() === 'orders'
 *     ? <OrdersTable /> : <CustomersVirtualList />}`, so it mounts AFTER a
 *     "Customers" tab click. The `getScrollElement` ref callback fires on
 *     that later mount, not at initial page load.
 *   • QUERY-DRIVEN COUNT — the virtualizer is created with `count: 0` while
 *     `customersQuery` is pending, then `count` reactively updates to 1,024
 *     when the query resolves. Proves the reactive-options path re-runs the
 *     virtualizer when the count signal changes.
 *
 * Rows carry a `--row-y` inline CSS var (the styled virtualization pattern),
 * so they're selectable without a testid. Only the visible window (+overscan)
 * is in the DOM — far fewer than 1,024.
 */
test.describe('app-showcase /dashboard — @pyreon/virtual customers list', () => {
  test('Customers tab mounts a virtualized 1,024-row list (only the visible window in DOM)', async ({
    page,
  }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // Switch to the Customers tab — this is the late mount of the
    // virtualized list (Orders is the default tab).
    await page.locator('button:has-text("Customers")').first().click()

    // The virtual rows position via a `--row-y` inline CSS var. Wait for
    // the first one — the customers query must resolve (count 0 → 1024)
    // AND the scroll-element ref must fire before any row mounts.
    const rows = page.locator('[style*="--row-y"]')
    await expect.poll(async () => rows.count(), { timeout: 10_000 }).toBeGreaterThan(0)

    // Only the visible window (+overscan) is mounted — far fewer than the
    // 1,024 seeded customers. Bounded assert proves virtualization.
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(100)
  })
})

test.describe('app-showcase /chat — @pyreon/virtual message list', () => {
  test('seeded messages render in the virtualized scroll container', async ({
    page,
  }) => {
    // The chat MessageList virtualizes `store.visibleMessages()` (60+
    // seeded). Same `innerRef`-on-styled bug as the dashboard: the
    // scroll element must be captured via `ref` (not `innerRef`, which
    // a `styled()` component silently drops) or NO message rows mount.
    await page.goto('/chat', { waitUntil: 'domcontentloaded' })
    // Message rows position via `--row-y` (the styled virtualization
    // pattern). At least one must mount, bounded (virtualized window).
    const rows = page.locator('[style*="--row-y"]')
    await expect.poll(async () => rows.count(), { timeout: 10_000 }).toBeGreaterThan(0)
    expect(await rows.count()).toBeLessThan(120)
  })
})
