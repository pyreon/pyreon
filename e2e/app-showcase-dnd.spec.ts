import { expect, test } from '@playwright/test'

/**
 * `@pyreon/dnd` real-app e2e — sortable list, draggable card → drop zone,
 * file drop with type filter.
 *
 * Targets `examples/app-showcase`'s `/dnd` route which wires three
 * `@pyreon/dnd` hooks (`useSortable`, `useDraggable` + `useDroppable`,
 * `useFileDrop`) into a real-app shape with reactive state writes back
 * to signals on drop. The hooks build on `pragmatic-drag-and-drop` so
 * they consume real native drag events; vitest can't drive those, which
 * is the structural gap this gate closes.
 *
 * Tests dispatch real DragEvent / DataTransfer sequences inside
 * `page.evaluate` because Playwright's `mouse.down/move/up` does not
 * trigger the HTML5 drag-and-drop event lifecycle (`dragstart`,
 * `dragenter`, `dragover`, `drop`) — those require a `dataTransfer`
 * object the synthesized mouse events don't carry.
 */

const DND_URL = '/dnd'

test.describe('app-showcase /dnd', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DND_URL, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-testid="sortable"]').waitFor()
    // Wait for `useSortable` to actually attach pragmatic-drag-and-drop's
    // listeners. The hook sets `aria-roledescription="sortable item"` in
    // the SAME synchronous code path as the `draggable()` call (see
    // `packages/fundamentals/dnd/src/use-sortable.ts`), so its presence
    // is a reliable proxy for "drop handlers are wired". Without this
    // wait the test races hydration on slower CI runners — drag events
    // dispatched before the listener attaches are silently no-ops.
    await page
      .locator('[data-testid="sortable-list"] li[aria-roledescription="sortable item"]')
      .first()
      .waitFor()
  })

  test('renders all three drag-and-drop scenarios', async ({ page }) => {
    await expect(page.locator('[data-testid="sortable"]')).toBeVisible()
    await expect(page.locator('[data-testid="card-drop"]')).toBeVisible()
    await expect(page.locator('[data-testid="file-drop"]')).toBeVisible()

    // Sortable list seeds with 4 items.
    await expect(page.locator('[data-testid="sortable-list"] > li')).toHaveCount(4)

    // Initial order matches seed.
    await expect(page.locator('[data-testid="sortable-order"]')).toHaveText('order: 1, 2, 3, 4')

    // Card + zone start in their initial states.
    await expect(page.locator('[data-testid="card"]')).toHaveAttribute('data-dragging', 'false')
    await expect(page.locator('[data-testid="zone"]')).toHaveAttribute('data-dropped', 'false')

    // File-drop zone starts empty.
    await expect(page.locator('[data-testid="file-zone"]')).toHaveAttribute('data-files', '0')
  })

  test('useSortable reorders items via HTML5 drag-and-drop', async ({ page }) => {
    // Simulate dragging item 1 below item 3 by dispatching the full
    // HTML5 drag event sequence with a shared DataTransfer. pragmatic-
    // drag-and-drop listens for dragstart/over/drop on element targets;
    // Playwright can't synthesize this end-to-end via mouse, hence the
    // direct dispatch.
    await page.evaluate(() => {
      const list = document.querySelector(
        '[data-testid="sortable-list"]',
      ) as HTMLElement | null
      if (!list) return
      const items = list.querySelectorAll<HTMLElement>('li[data-itemid]')
      const item1 = items[0]
      const item3 = items[2]
      if (!item1 || !item3) return

      const dataTransfer = new DataTransfer()
      const fire = (target: Element, type: string, related?: { x: number; y: number }) => {
        const rect = (target as HTMLElement).getBoundingClientRect()
        const x = related?.x ?? rect.left + rect.width / 2
        const y = related?.y ?? rect.top + rect.height / 2
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer,
            clientX: x,
            clientY: y,
          }),
        )
      }

      // Drag from item1 → over item3 (bottom edge) → drop on list.
      fire(item1, 'dragstart')
      const r3 = item3.getBoundingClientRect()
      fire(item3, 'dragenter', { x: r3.left + r3.width / 2, y: r3.bottom - 4 })
      fire(item3, 'dragover', { x: r3.left + r3.width / 2, y: r3.bottom - 4 })
      fire(list, 'drop')
      fire(item1, 'dragend')
    })

    // pragmatic-drag-and-drop processes drops asynchronously (microtask /
    // rAF), so reading `textContent` synchronously right after dispatch
    // races the reorder on slower CI runners. Use a polling assertion
    // that waits for the order to change off the seed instead — passes
    // deterministically once the reorder commits, fails fast (default
    // 5s timeout) if it never does. Whether item-1 ends up at position
    // 2 or 3 depends on closest-edge math (top/bottom); either is fine,
    // the test just asserts the seed `1, 2, 3, 4` was disturbed.
    await expect(page.locator('[data-testid="sortable-order"]')).not.toHaveText(
      'order: 1, 2, 3, 4',
    )
  })

  test('useDraggable + useDroppable card moves via drag events', async ({ page }) => {
    const zone = page.locator('[data-testid="zone"]')

    // Pre-drop: zone is in initial state.
    await expect(zone).toHaveAttribute('data-dropped', 'false')

    // Dispatch drag sequence: dragstart on card, dragenter/over on zone,
    // drop on zone, dragend on card. pragmatic-drag-and-drop's element
    // adapter wires these via standard HTML5 drag events.
    await page.evaluate(() => {
      const card = document.querySelector('[data-testid="card"]') as HTMLElement | null
      const zone = document.querySelector('[data-testid="zone"]') as HTMLElement | null
      if (!card || !zone) throw new Error('card or zone missing')

      const dt = new DataTransfer()
      const fire = (target: Element, type: string) => {
        const rect = (target as HTMLElement).getBoundingClientRect()
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          }),
        )
      }

      fire(card, 'dragstart')
      fire(zone, 'dragenter')
      fire(zone, 'dragover')
      fire(zone, 'drop')
      fire(card, 'dragend')
    })

    // Post-drop: the zone's `data-dropped` flips and the payload text
    // appears (signal-driven write from `onDrop`).
    await expect(zone).toHaveAttribute('data-dropped', 'true')
    await expect(zone).toContainText('Move me')
  })

  test('useFileDrop accepts an image file via synthetic DataTransfer', async ({ page }) => {
    const zone = page.locator('[data-testid="file-zone"]')
    await expect(zone).toHaveAttribute('data-files', '0')

    // Drive pragmatic-drag-and-drop's external/file adapter with the
    // EXACT pattern from pdnd's own Playwright suite at
    // `packages/core/__tests__/playwright/external-files.spec.ts`:
    //
    //   1. `dragenter` on `window` — this is what "activates" the
    //      external adapter; bubbling a zone-targeted dragenter doesn't
    //      reach the activation path reliably under headless Chromium
    //      (macOS works, Linux silently rejects via `getAvailableTypes`).
    //   2. `dragover` and `drop` on the actual drop target — same
    //      DataTransfer shared across all three events so the file is
    //      preserved.
    //
    // The same DataTransfer instance MUST be used across all three
    // dispatches; pdnd reads the file list from the event's transfer at
    // drop time, and a fresh DataTransfer per event would lose the file.
    await page.evaluate(() => {
      const zone = document.querySelector('[data-testid="file-zone"]') as HTMLElement | null
      if (!zone) throw new Error('file-zone missing')

      const file = new File(['<bytes>'], 'avatar.png', { type: 'image/png' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)

      // 1. Activate the external file adapter via window dragenter.
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer }))

      // 2. Dispatch dragover + drop on the zone with the same transfer.
      zone.dispatchEvent(new DragEvent('dragover', { dataTransfer }))
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer }))
    })

    // The hook filters by `image/*` accept and writes the surviving files
    // to a signal — the `data-files` attribute reflects the count.
    await expect
      .poll(async () => zone.getAttribute('data-files'), { timeout: 2000 })
      .toBe('1')
    await expect(zone).toContainText('avatar.png')
  })
})
