import { expect, test } from '@playwright/test'

/**
 * `@pyreon/flow` feature-matrix e2e — drives the `/flow-features` route in
 * examples/app-showcase, where every flow feature is a `data-testid` control
 * with a live readout. This gate proves the round-2 component bug fixes in a
 * real app + exercises a representative slice of the full API:
 *
 *   • Bug — <Flow> injects instance into MiniMap + Controls via context
 *     (they previously rendered NOTHING without an explicit `instance`).
 *   • Bug — drag-to-connect creates an edge (pointerup hit-tests the cursor
 *     because pointer capture hijacks e.target).
 *   • Bug — NodeToolbar shows on selection (was a static return null).
 *   • Bug — NodeResizer handles appear on selection.
 *   • Feature sweep — nodes/edges CRUD, selection, undo/redo, queries,
 *     serialization, config toggles, markers — via the readout.
 */

const URL = '/flow-features'

test.describe('app-showcase /flow-features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-nodeid]').first().waitFor()
  })

  test('seed renders + MiniMap & Controls inject via <Flow> context', async ({ page }) => {
    // 3 seed nodes, 2 seed edges.
    await expect(page.locator('[data-nodeid]')).toHaveCount(3)
    await expect(page.getByTestId('ro-nodes')).toHaveText('3')
    await expect(page.getByTestId('ro-edges')).toHaveText('2')

    // The bug fix: MiniMap + Controls render WITHOUT an explicit instance prop
    // (resolved from the <Flow> context). Pre-fix both rendered null.
    await expect(page.locator('.pyreon-flow-minimap')).toBeVisible()
    await expect(page.locator('.pyreon-flow-controls')).toBeVisible()
    await expect(page.locator('button[title="Zoom in"]')).toBeVisible()
  })

  test('edge markers render as deduped <defs> (closed + open + colored)', async ({ page }) => {
    // Seed: e1 default closed arrow, e2 open red arrow + closed start marker.
    const markers = page.locator('.pyreon-flow-edges defs marker, svg defs marker')
    await expect(markers.first()).toBeAttached()
    // At least 2 distinct marker shapes exist (polygon = closed, polyline = open).
    await expect(page.locator('defs marker polygon').first()).toBeAttached()
    await expect(page.locator('defs marker polyline').first()).toBeAttached()
  })

  test('NodeToolbar + NodeResizer appear on selection (reactive)', async ({ page }) => {
    // No toolbar / resizer before selection.
    await expect(page.getByTestId('fnode-del-n1')).toHaveCount(0)
    await expect(page.locator('.pyreon-flow-resizer-nw')).toHaveCount(0)

    await page.getByTestId('act-select-n1').click()
    await expect(page.getByTestId('ro-selected')).toHaveText('1')
    // Toolbar (with its Delete button) + resize handles now mounted.
    await expect(page.getByTestId('fnode-del-n1')).toBeVisible()
    await expect(page.locator('.pyreon-flow-resizer-nw').first()).toBeVisible()

    // Clearing selection hides them again (proves the reactive show/hide).
    await page.getByTestId('act-clear-selection').click()
    await expect(page.getByTestId('ro-selected')).toHaveText('0')
    await expect(page.getByTestId('fnode-del-n1')).toHaveCount(0)
  })

  test('node + edge CRUD with undo/redo via the readout', async ({ page }) => {
    await page.getByTestId('act-add-node').click()
    await expect(page.getByTestId('ro-nodes')).toHaveText('4')

    await page.getByTestId('act-add-edge').click()
    await expect(page.getByTestId('ro-edges')).toHaveText('3')

    // Undo the edge add, then the node add.
    await page.getByTestId('act-undo').click()
    await expect(page.getByTestId('ro-edges')).toHaveText('2')
    await page.getByTestId('act-undo').click()
    await expect(page.getByTestId('ro-nodes')).toHaveText('3')

    // Redo brings the node back.
    await page.getByTestId('act-redo').click()
    await expect(page.getByTestId('ro-nodes')).toHaveText('4')
  })

  test('NodeToolbar Delete button removes its node', async ({ page }) => {
    await page.getByTestId('act-select-n1').click()
    await page.getByTestId('fnode-del-n1').click()
    await expect(page.getByTestId('ro-nodes')).toHaveText('2')
    await expect(page.locator('[data-nodeid="n1"]')).toHaveCount(0)
  })

  test('queries + serialization update the readout', async ({ page }) => {
    await page.getByTestId('act-search').click()
    await expect(page.getByTestId('ro-query')).toHaveText('search → 1 match')

    await page.getByTestId('act-connected').click()
    await expect(page.getByTestId('ro-query')).toHaveText('connected → 2')

    await page.getByTestId('act-incomers').click()
    await expect(page.getByTestId('ro-query')).toHaveText('incomers → 1')

    await page.getByTestId('act-export-json').click()
    await expect(page.getByTestId('ro-query')).toHaveText('json → 3 nodes')
  })

  test('config toggles flip in the readout', async ({ page }) => {
    await expect(page.getByTestId('ro-snap-objects')).toHaveText('true')
    await page.getByTestId('act-toggle-snap-objects').click()
    await expect(page.getByTestId('ro-snap-objects')).toHaveText('false')

    await expect(page.getByTestId('ro-virtualize')).toHaveText('false')
    await page.getByTestId('act-toggle-virtualize').click()
    await expect(page.getByTestId('ro-virtualize')).toHaveText('true')
    // Still renders the visible seed nodes after virtualization turns on.
    await expect(page.locator('[data-nodeid]').first()).toBeVisible()
  })

  // NOTE: drag-to-connect (dragging from a source handle onto a target handle
  // to create an edge) is covered authoritatively by the unit-browser test
  // `packages/fundamentals/flow/src/tests/node-components.browser.test.tsx`
  // ("drag-to-connect …"), which exercises the real `handlePointerUp` +
  // `document.elementFromPoint` drop resolution in real Chromium against real
  // handles. It is NOT automated here because synthetic pointer hit-testing of
  // the 8px handles against the full app's transformed/clipped canvas is
  // unreliable (elementFromPoint doesn't resolve the tiny handle at its
  // center). The feature itself works in the example — drag between two node
  // handles by hand.
})
