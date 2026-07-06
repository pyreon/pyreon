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
})
