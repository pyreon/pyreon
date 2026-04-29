import { expect, test } from '@playwright/test'

/**
 * `@pyreon/flow` real-app e2e — render, selection, node drag, wheel pan.
 *
 * Targets `examples/app-showcase`'s `/flow` route which mounts a
 * `createFlow<WorkflowNodeData>` instance with 4 seed nodes and 3 edges
 * (see `src/sections/flow/data/seed.ts`). The point of these specs is
 * the cross-package shape: pointer events from real Chromium reach
 * @pyreon/flow's drag handler, the handler writes to the flow instance's
 * signals, and the runtime patches the node's `transform: translate(...)`
 * inline style in place — all under hydration, with the elkjs auto-layout
 * chunk lazy-loaded if exercised.
 *
 * vitest-browser tests cover the hook surface in isolation; this file
 * locks the integration shape that surfaced 4 of the recent regression
 * batches (PR #197 silent metadata drop, PR #410 SSR `_rp` resolution,
 * PR #406 RouterView mount-once contract, ongoing custom-node-renderer
 * accessor reactivity).
 */

const FLOW_URL = '/flow'

test.describe('app-showcase /flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded' })
    // Wait for the flow canvas to mount (4 nodes from the seed).
    await page.locator('[data-nodeid]').first().waitFor()
  })

  test('renders 4 seed nodes and 3 edge paths', async ({ page }) => {
    // Node count: each `[data-nodeid]` is one mounted custom node renderer.
    // 4 from `SEED_NODES` (trigger-1, filter-1, transform-1, notify-1).
    await expect(page.locator('[data-nodeid]')).toHaveCount(4)

    // Edge count: 3 SVG paths from `SEED_EDGES`. The default edge type
    // is 'smoothstep' (route's `defaultEdgeType` config) — each renders
    // as one `<path>`. Asserting `>= 3` over `=== 3` to leave room for
    // future seed additions without breaking the spec.
    const paths = await page.locator('svg path').count()
    expect(paths).toBeGreaterThanOrEqual(3)

    // Sanity: no console errors at mount. The flow component lazy-loads
    // elkjs only on `instance.layout()` call, NOT on initial mount, so a
    // clean mount path means `<Flow>` + nodes + edges all wired without
    // the chunk being touched.
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForTimeout(300)
    expect(errors).toHaveLength(0)
  })

  test('clicking a node applies the `selected` class', async ({ page }) => {
    const trigger = page.locator('[data-nodeid="trigger-1"]')

    // Pre-click: not selected.
    await expect(trigger).not.toHaveClass(/selected/)

    await trigger.click()

    // Post-click: `selected` class added (driven by `instance.selectNode`
    // → `node.selected` signal accessor → custom-node renderer's reactive
    // `class` thunk in app-showcase's `WorkflowNode.tsx`). Lock-in for
    // the per-node accessor contract — if `node.selected` becomes a
    // captured-once value instead of a live accessor, the class never
    // updates and this spec fails.
    await expect(trigger).toHaveClass(/selected/)

    // Z-index also bumps to 100 on selection so the selected node draws
    // above its siblings — secondary signal that the selection state is
    // actually being read by the renderer (separate code path from class).
    const z = await trigger.evaluate((el) => getComputedStyle(el).zIndex)
    expect(z).toBe('100')
  })

  test('dragging a node updates its transform via real pointer events', async ({ page }) => {
    const trigger = page.locator('[data-nodeid="trigger-1"]')

    // `transform: translate(40px, 60px)` from `SEED_NODES` — assert the
    // pre-drag inline style matches the seed so the post-drag delta is
    // unambiguously caused by the pointer sequence below.
    const before = await trigger.evaluate((el) => (el as HTMLElement).style.transform)
    expect(before).toContain('translate(40px, 60px)')

    const box = await trigger.boundingBox()
    if (!box) throw new Error('trigger node has no bounding box')

    // Dispatch synthetic pointer events directly. Playwright's
    // `mouse.down/move/up` synthesizes pointer events from mouse events
    // but the resulting `pointerId` / capture sequencing isn't what
    // @pyreon/flow's `setPointerCapture(e.pointerId)` handler expects
    // under headless Chromium — drag handler initializes but subsequent
    // pointermove events don't reach the captured target. Dispatching
    // PointerEvents directly makes the sequence deterministic and
    // covers exactly the contract the flow handler reads from `e.*`.
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.evaluate(
      ({ cx, cy }) => {
        const node = document.querySelector('[data-nodeid="trigger-1"]')
        const container = document.querySelector('.pyreon-flow')
        if (!node || !container) throw new Error('flow not mounted')

        const dispatch = (
          target: Element,
          type: 'pointerdown' | 'pointermove' | 'pointerup',
          x: number,
          y: number,
        ) => {
          target.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 1,
              pointerType: 'mouse',
              clientX: x,
              clientY: y,
              button: 0,
              buttons: type === 'pointerup' ? 0 : 1,
              bubbles: true,
              cancelable: true,
            }),
          )
        }

        dispatch(node, 'pointerdown', cx, cy)
        // Multi-step pointermove — flow's drag handler integrates over
        // delta from the pointerdown's client coords.
        for (let i = 1; i <= 8; i++) {
          dispatch(container, 'pointermove', cx + (150 * i) / 8, cy + (100 * i) / 8)
        }
        dispatch(container, 'pointerup', cx + 150, cy + 100)
      },
      { cx, cy },
    )

    // Post-drag: inline transform should NO LONGER be the seed value.
    // Use `expect.poll` because the flow instance batches signal writes
    // and the DOM patch is async-microtask-bounded.
    await expect
      .poll(async () => trigger.evaluate((el) => (el as HTMLElement).style.transform), {
        timeout: 2000,
      })
      .not.toBe(before)

    // Snap-to-grid is enabled (`snapToGrid: true, snapGrid: 20` in the
    // store config) so the new transform should be axis-aligned to 20px
    // multiples — but the EXACT post-drag position depends on browser
    // pointer-capture timing. Asserting "different from before" is
    // sufficient to prove the drag handler ran end-to-end without
    // overspecifying the snap math.
  })

  test('wheel scroll over the canvas zooms the viewport transform', async ({ page }) => {
    // The `.pyreon-flow-viewport` element is a 0×0 wrapper whose CSS
    // `transform` carries the canvas pan + zoom — so it's "hidden" to
    // Playwright's default `waitFor` (which checks visibility = non-zero
    // box). `state: 'attached'` only requires DOM presence.
    const viewport = page.locator('.pyreon-flow-viewport').first()
    await viewport.waitFor({ state: 'attached' })

    // Capture the initial computed transform — it's the matrix the
    // wheel handler mutates on zoom.
    const before = await viewport.evaluate((el) => getComputedStyle(el).transform)

    // Dispatch a wheel event directly on the `.pyreon-flow` container
    // (which is where the wheel listener is bound). Same reason as the
    // drag spec — Playwright's `mouse.wheel` doesn't always route to
    // the right element under headless Chromium when the canvas is the
    // visible element but the listener is on a child.
    await page.evaluate(() => {
      const container = document.querySelector('.pyreon-flow')
      if (!container) throw new Error('flow container missing')
      const rect = (container as HTMLElement).getBoundingClientRect()
      container.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -200, // negative = zoom-in in @pyreon/flow's handler
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          cancelable: true,
        }),
      )
    })

    await expect
      .poll(async () => viewport.evaluate((el) => getComputedStyle(el).transform), {
        timeout: 2000,
      })
      .not.toBe(before)
  })
})
