import { expect, test } from '@playwright/test'

/**
 * Functional smoke for the 8 demos added to fundamentals-playground in
 * the coverage-extension PR (dnd, flow, hooks, rx, toast, url-state,
 * validate, feature). The existing `playground.spec.ts` nav-sweep covers
 * mount + zero-error for every route in TAB_PATHS; these specs assert
 * that each demo's **primary interactive flow** actually works
 * end-to-end (not just that the route renders).
 *
 * With `feature` covered (CRUD against an in-memory mock fetcher), all
 * 23 `@pyreon/fundamentals/*` packages now have a live FP demo.
 */

test.describe('Rx demo — pipe + filter + aggregations', () => {
  test('inStock filter and avg both render', async ({ page }) => {
    await page.goto('/rx')
    await expect(page.locator('[data-testid=rx-instock]')).toContainText('Hammer')
    await expect(page.locator('[data-testid=rx-instock]')).toContainText('Bread')
    await expect(page.locator('[data-testid=rx-avg]')).toContainText('$')
    await expect(page.locator('[data-testid=rx-total]')).toContainText('$')
  })

  test('min-price slider re-derives aboveMin reactively', async ({ page }) => {
    await page.goto('/rx')
    // Default minPrice=0 → all items.
    const above = page.locator('[data-testid=rx-above-min]')
    await expect(above).toContainText('Bread')
    // Move slider via the input. range[0..100] → 50 should drop items <50.
    await page.locator('input[type=range]').fill('50')
    await expect(above).not.toContainText('Bread')
  })
})

test.describe('Toast demo — imperative variants + promise helper', () => {
  test('clicking success spawns a role=alert toast', async ({ page }) => {
    await page.goto('/toast')
    await page.locator('[data-testid=toast-success]').click()
    await expect(page.locator('[role=alert]').first()).toBeVisible()
  })

  test('dismiss-all removes every alert', async ({ page }) => {
    await page.goto('/toast')
    await page.locator('[data-testid=toast-bulk]').click()
    await expect(page.locator('[role=alert]')).toHaveCount(5)
    await page.locator('[data-testid=toast-dismiss-all]').click()
    // After dismiss animations, count goes to 0.
    await expect(page.locator('[role=alert]')).toHaveCount(0, { timeout: 5000 })
  })
})

test.describe('URL-State demo — params round-trip', () => {
  test('next button increments page and updates URL', async ({ page }) => {
    await page.goto('/url-state')
    await page.locator('[data-testid=url-state-next]').click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.locator('[data-testid=url-state-page]')).toContainText('page 2')
  })

  test('typing in q field syncs to URL query param', async ({ page }) => {
    await page.goto('/url-state')
    await page.locator('[data-testid=url-state-q]').fill('hello')
    // useUrlState debounces a tick; wait for the URL to settle.
    await expect(page).toHaveURL(/q=hello/, { timeout: 2000 })
  })

  test('reset clears all params', async ({ page }) => {
    await page.goto('/url-state?page=5&q=foo')
    await page.locator('[data-testid=url-state-reset]').click()
    // After reset, none of the cleared keys remain (default values
    // serialize to empty / removed).
    await expect(page).not.toHaveURL(/q=foo/)
    await expect(page).not.toHaveURL(/page=5/)
  })
})

test.describe('Hooks demo — useToggle + useClipboard', () => {
  test('toggle button flips boolean state', async ({ page }) => {
    await page.goto('/hooks')
    await expect(page.locator('[data-testid=hooks-toggle-state]')).toHaveText('closed')
    await page.locator('[data-testid=hooks-toggle-btn]').click()
    await expect(page.locator('[data-testid=hooks-toggle-state]')).toHaveText('OPEN')
  })

  test('typing into debounced input updates live + debounced', async ({ page }) => {
    await page.goto('/hooks')
    await page.locator('[data-testid=hooks-debounce-input]').fill('abc')
    // Live updates immediately
    await expect(page.locator('[data-testid=hooks-live]')).toHaveText('abc')
    // Debounced lags 300ms — wait for it to catch up
    await expect(page.locator('[data-testid=hooks-debounced]')).toHaveText('abc', {
      timeout: 1500,
    })
  })
})

test.describe('Validate demo — Standard Schema + parseReactive', () => {
  test('valid inputs flip status to VALID', async ({ page }) => {
    await page.goto('/validate')
    await expect(page.locator('[data-testid=validate-status]')).toHaveText('INVALID')
    await page.locator('[data-testid=validate-username]').fill('alice')
    await page.locator('[data-testid=validate-age]').fill('25')
    await page.locator('[data-testid=validate-email]').fill('alice@example.com')
    await expect(page.locator('[data-testid=validate-status]')).toHaveText('VALID')
  })

  test('short username surfaces inline error', async ({ page }) => {
    await page.goto('/validate')
    await page.locator('[data-testid=validate-username]').fill('a')
    await expect(page.locator('[data-testid=validate-username-err]')).toContainText(
      'at least 3',
    )
  })
})

const DND_SEED_ORDER =
  'Read the docs → Build a demo → Open a PR → Celebrate → Refactor'

test.describe('DnD demo — useSortable reorder', () => {
  test('5 items render in initial order', async ({ page }) => {
    await page.goto('/dnd')
    await expect(page.locator('[data-testid^=dnd-item-]')).toHaveCount(5)
    await expect(page.locator('[data-testid=dnd-order]')).toHaveText(
      DND_SEED_ORDER,
    )
  })

  test('dragging item 1 below item 3 reorders the list off its seed', async ({
    page,
  }) => {
    await page.goto('/dnd', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-testid=dnd-order]')).toHaveText(
      DND_SEED_ORDER,
    )
    // `useSortable` sets `aria-roledescription="sortable item"` in the SAME
    // synchronous path as the pragmatic-drag-and-drop `draggable()` call
    // (packages/fundamentals/dnd/src/use-sortable.ts:262), so its presence
    // is a reliable proxy for "drop listeners are wired". Without this wait
    // the dispatch below races hydration and silently no-ops on slower CI.
    await page
      .locator('[data-testid=dnd-list] li[aria-roledescription="sortable item"]')
      .first()
      .waitFor()

    // Playwright's mouse.down/move/up does NOT trigger the HTML5 drag
    // lifecycle (dragstart/enter/over/drop) — those need a `dataTransfer`
    // the synthesized mouse events don't carry. Dispatch the real DragEvent
    // sequence with one shared DataTransfer, mirroring app-showcase-dnd.spec.
    // Drag item-1 ("Read the docs") onto item-3's bottom edge ("Open a PR").
    await page.evaluate(() => {
      const list = document.querySelector(
        '[data-testid="dnd-list"]',
      ) as HTMLElement | null
      if (!list) throw new Error('dnd-list missing')
      const item1 = list.querySelector(
        '[data-testid="dnd-item-1"]',
      ) as HTMLElement | null
      const item3 = list.querySelector(
        '[data-testid="dnd-item-3"]',
      ) as HTMLElement | null
      if (!item1 || !item3) throw new Error('drag items missing')

      const dataTransfer = new DataTransfer()
      const fire = (
        target: Element,
        type: string,
        related?: { x: number; y: number },
      ) => {
        const rect = (target as HTMLElement).getBoundingClientRect()
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer,
            clientX: related?.x ?? rect.left + rect.width / 2,
            clientY: related?.y ?? rect.top + rect.height / 2,
          }),
        )
      }

      const r3 = item3.getBoundingClientRect()
      fire(item1, 'dragstart')
      fire(item3, 'dragenter', { x: r3.left + r3.width / 2, y: r3.bottom - 4 })
      fire(item3, 'dragover', { x: r3.left + r3.width / 2, y: r3.bottom - 4 })
      fire(list, 'drop')
      fire(item1, 'dragend')
    })

    // pragmatic-drag-and-drop commits drops on a microtask/rAF, so poll
    // rather than read synchronously. Whether item-1 lands at position 2
    // or 3 depends on closest-edge math; the test asserts only that the
    // seed order was disturbed (a real reorder fired end-to-end).
    await expect(page.locator('[data-testid=dnd-order]')).not.toHaveText(
      DND_SEED_ORDER,
    )
    // All 5 items survive the reorder (no drop / clone leak).
    await expect(page.locator('[data-testid^=dnd-item-]')).toHaveCount(5)
  })

  test('reset restores the seed order after a reorder', async ({ page }) => {
    await page.goto('/dnd', { waitUntil: 'domcontentloaded' })
    await page
      .locator('[data-testid=dnd-list] li[aria-roledescription="sortable item"]')
      .first()
      .waitFor()

    // Reorder first (same dispatch as above), then assert reset returns
    // the list to its seed — proving the onReorder signal write AND the
    // reset path both round-trip.
    await page.evaluate(() => {
      const list = document.querySelector(
        '[data-testid="dnd-list"]',
      ) as HTMLElement | null
      if (!list) throw new Error('dnd-list missing')
      const item1 = list.querySelector(
        '[data-testid="dnd-item-1"]',
      ) as HTMLElement | null
      const item3 = list.querySelector(
        '[data-testid="dnd-item-3"]',
      ) as HTMLElement | null
      if (!item1 || !item3) throw new Error('drag items missing')
      const dt = new DataTransfer()
      const fire = (
        t: Element,
        type: string,
        rel?: { x: number; y: number },
      ) => {
        const r = (t as HTMLElement).getBoundingClientRect()
        t.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: rel?.x ?? r.left + r.width / 2,
            clientY: rel?.y ?? r.top + r.height / 2,
          }),
        )
      }
      const r3 = item3.getBoundingClientRect()
      fire(item1, 'dragstart')
      fire(item3, 'dragenter', { x: r3.left + r3.width / 2, y: r3.bottom - 4 })
      fire(item3, 'dragover', { x: r3.left + r3.width / 2, y: r3.bottom - 4 })
      fire(list, 'drop')
      fire(item1, 'dragend')
    })

    await expect(page.locator('[data-testid=dnd-order]')).not.toHaveText(
      DND_SEED_ORDER,
    )
    await page.getByRole('button', { name: 'Reset order' }).click()
    await expect(page.locator('[data-testid=dnd-order]')).toHaveText(
      DND_SEED_ORDER,
    )
  })
})

test.describe('Flow demo — reactive graph + add/fit', () => {
  test('renders initial 4 nodes / 4 edges', async ({ page }) => {
    await page.goto('/flow')
    await expect(page.locator('[data-testid=flow-node-count]')).toHaveText('4')
    await expect(page.locator('[data-testid=flow-edge-count]')).toHaveText('4')
  })

  test('add-node button increments count', async ({ page }) => {
    await page.goto('/flow')
    await page.locator('[data-testid=flow-add]').click()
    await expect(page.locator('[data-testid=flow-node-count]')).toHaveText('5')
    await page.locator('[data-testid=flow-add]').click()
    await expect(page.locator('[data-testid=flow-node-count]')).toHaveText('6')
  })

  test('fit view does not crash + zoom updates', async ({ page }) => {
    await page.goto('/flow')
    await page.locator('[data-testid=flow-fit]').click()
    // After fit, zoom is some percentage — assert format only.
    await expect(page.locator('[data-testid=flow-zoom]')).toContainText('%')
  })
})

test.describe('Feature demo — schema-driven CRUD over a mock fetcher', () => {
  // The in-memory mock fetcher carries 250-450ms simulated latency per
  // request, so each assertion waits on the post-mutation list state
  // rather than a fixed timeout. `defineFeature` invalidates the list
  // query on every successful create/update/delete.
  test('useList renders the 3 seeded tasks', async ({ page }) => {
    await page.goto('/feature')
    await expect(page.locator('[data-testid^=feature-task-]')).toHaveCount(3, {
      timeout: 5000,
    })
  })

  test('schema fields are introspected from the Zod schema', async ({ page }) => {
    await page.goto('/feature')
    const fields = page.locator('[data-testid=feature-fields]')
    await expect(fields).toContainText('title')
    await expect(fields).toContainText('done')
  })

  test('useCreate adds a task (list grows 3 → 4)', async ({ page }) => {
    await page.goto('/feature')
    await expect(page.locator('[data-testid^=feature-task-]')).toHaveCount(3, {
      timeout: 5000,
    })
    await page.locator('[data-testid=feature-new-title]').fill('Write the report')
    await page.locator('[data-testid=feature-add]').click()
    await expect(page.locator('[data-testid^=feature-task-]')).toHaveCount(4, {
      timeout: 5000,
    })
    await expect(page.locator('[data-testid=feature-list]')).toContainText(
      'Write the report',
    )
  })

  test('useDelete removes a task (list shrinks 3 → 2)', async ({ page }) => {
    await page.goto('/feature')
    await expect(page.locator('[data-testid^=feature-task-]')).toHaveCount(3, {
      timeout: 5000,
    })
    // Seeded task ids are '1' / '2' / '3'.
    await page.locator('[data-testid=feature-delete-1]').click()
    await expect(page.locator('[data-testid^=feature-task-]')).toHaveCount(2, {
      timeout: 5000,
    })
  })

  test('useUpdate toggles a task done state via PUT', async ({ page }) => {
    await page.goto('/feature')
    const checkbox = page.locator(
      '[data-testid=feature-task-2] input[type=checkbox]',
    )
    await expect(checkbox).not.toBeChecked({ timeout: 5000 })
    await checkbox.click()
    await expect(checkbox).toBeChecked({ timeout: 5000 })
  })

  test('useSearch filters by title reactively', async ({ page }) => {
    await page.goto('/feature')
    await expect(page.locator('[data-testid^=feature-task-]')).toHaveCount(3, {
      timeout: 5000,
    })
    await page.locator('[data-testid=feature-search]').fill('manifest')
    // Seeded task '1' is "Read the manifest".
    await expect(
      page.locator('[data-testid=feature-search-results]'),
    ).toContainText('Read the manifest', { timeout: 5000 })
  })
})
