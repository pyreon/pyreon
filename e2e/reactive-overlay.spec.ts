/**
 * E2E — the zero-install reactive-health overlay in a REAL browser.
 *
 * What happy-dom cannot prove (and this does):
 *   1. `installDevTools()` auto-fires on the app's first real `mount()` in dev
 *      (nobody calls it by hand) → `__PYREON_DEVTOOLS__.reactive.showOverlay`
 *      exists in the running app.
 *   2. A real compiled-app reactive graph populates, so the panel renders live
 *      counts + a real `[orphan-signal]` insight in the real DOM.
 *   3. The `Ctrl+Shift+R` keydown listener is wired in the real app.
 *
 * The toggle is exercised via a synthetic `KeyboardEvent` dispatched in-page,
 * NOT `page.keyboard.press('Control+Shift+R')` — that chord is Chromium's
 * hard-reload accelerator and the browser would swallow it before the page saw
 * it. The synthetic DOM event is the same path the runtime's listener handles.
 */
import { expect, test } from '@playwright/test'

async function bootWithGraph(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('#layout', { timeout: 10_000 })
  // Mount a real signal-driven subtree AND create an orphan signal kept alive
  // on `window` so the always-on reactive registry has a known insight to show.
  await page.evaluate(() => {
    const w = window as any
    const { h, mount, signal, computed, effect } = w.__pyreon
    const app = document.getElementById('app')!
    app.innerHTML = ''
    const count = signal(0)
    const doubled = computed(() => count() * 2)
    const dispose = effect(() => void doubled())
    mount(h('div', { id: 'rx-probe' }, () => `Count: ${count()}`), app)
    // Orphan: created + retained, never read → describeReactiveGraph flags it.
    const orphan = signal('unused')
    w.__rxKeepAlive = { count, doubled, dispose, orphan }
  })
}

test.describe('reactive health overlay (real browser)', () => {
  test('auto-installed devtools exposes the reactive overlay bridge', async ({ page }) => {
    await bootWithGraph(page)
    const shape = await page.evaluate(() => {
      const rx = (window as any).__PYREON_DEVTOOLS__?.reactive
      return {
        hasShow: typeof rx?.showOverlay === 'function',
        hasHide: typeof rx?.hideOverlay === 'function',
      }
    })
    expect(shape.hasShow).toBe(true)
    expect(shape.hasHide).toBe(true)
  })

  test('showOverlay renders live graph counts + an orphan insight', async ({ page }) => {
    await bootWithGraph(page)
    await page.evaluate(() => (window as any).__PYREON_DEVTOOLS__.reactive.showOverlay())

    const panel = page.locator('#__pyreon-reactive-overlay')
    await expect(panel).toBeVisible()

    const body = page.locator('#__pyreon-rx-body')
    // header shape: "N signals · M derived · K effects · E edges"
    await expect(body).toContainText('signal')
    await expect(body).toContainText('edges')
    // the retained orphan signal surfaces as a health insight
    await expect(body).toContainText('[orphan-signal]')
  })

  test('Ctrl+Shift+R keydown toggles the panel open then closed', async ({ page }) => {
    await bootWithGraph(page)
    const dispatch = () =>
      page.evaluate(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'R',
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
          }),
        )
      })

    await dispatch()
    await expect(page.locator('#__pyreon-reactive-overlay')).toBeVisible()

    await dispatch()
    await expect(page.locator('#__pyreon-reactive-overlay')).toHaveCount(0)
  })

  test('Activity tab shows recent fires + a "why did X update?" chain after a real interaction', async ({
    page,
  }) => {
    await bootWithGraph(page)
    // Fire the live chain in the real app: count.set -> doubled -> effect,
    // all recorded in the always-on ring buffer.
    await page.evaluate(() => {
      const w = window as any
      w.__rxKeepAlive.count.set(1)
      w.__PYREON_DEVTOOLS__.reactive.showOverlay()
    })

    await expect(page.locator('#__pyreon-reactive-overlay')).toBeVisible()

    // Switch to the Activity view.
    await page.locator('#__pyreon-rx-tab-activity').click()

    const body = page.locator('#__pyreon-rx-body')
    await expect(body).toContainText('Recent updates (newest first):')
    // The causal-chain explainer is rendered for the most-recent fire.
    await expect(body).toContainText('Why did')

    // Back to Health restores the graph summary.
    await page.locator('#__pyreon-rx-tab-health').click()
    await expect(body).toContainText('edges')
  })
})

test.describe('reactive overlay — Inspect picker (real compiled app)', () => {
  // The playground's Home (/) renders <Counter/>, whose `<p class="value">
  // {() => count()}</p>` compiles to a real `_bindText(count, __t)` — the exact
  // path the DOM→signal tag records. NB: do NOT wipe #app here (unlike
  // bootWithGraph) — the compiled Counter must stay in the DOM.
  test('nodesForElement correlates a compiled {count()} element to its signal', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.value', { timeout: 10_000 })

    const bound = await page.evaluate(() => {
      const el = document.querySelector('.value')!
      return (window as any).__PYREON_DEVTOOLS__.reactive
        .nodesForElement(el)
        .map((b: any) => ({ name: b.name, kind: b.kind }))
    })
    // The <p class="value"> displays exactly one reactive value — a signal.
    expect(bound.length).toBeGreaterThanOrEqual(1)
    expect(bound[0].kind).toBe('signal')
  })

  test('🎯 pick → clicking a compiled element shows its driving signal in Inspect', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForSelector('.value')

    await page.evaluate(() => (window as any).__PYREON_DEVTOOLS__.reactive.showOverlay())
    await expect(page.locator('#__pyreon-reactive-overlay')).toBeVisible()

    // Enter pick mode, then click the compiled value element.
    await page.locator('#__pyreon-rx-pick').click()
    await page.locator('.value').click()

    const body = page.locator('#__pyreon-rx-body')
    await expect(body).toContainText('displays')
    await expect(body).toContainText('(signal)')
  })
})
