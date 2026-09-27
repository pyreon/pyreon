/**
 * Production-truth specs shared by ssr-node and isr-node (audit A1). They run
 * against the BUILT node server, whose stderr the config redirects to
 * `PYREON_E2E_SERVER_STDERR`.
 */
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

function serverStderr(): string {
  const path = process.env.PYREON_E2E_SERVER_STDERR
  // Fail closed: a missing log would make "nothing was logged" unfalsifiable.
  if (!path) throw new Error('PYREON_E2E_SERVER_STDERR is not set by the playwright config')
  return readFileSync(path, 'utf-8')
}

export function productionTruthSpecs(): void {
  test('a throwing loader answers 500 and is LOGGED with [Pyreon] and the path', async ({ page }) => {
    const res = await page.request.get('/boom')
    expect(res.status()).toBe(500)
    // The client sees a generic body — never the error message.
    expect(await res.text()).not.toContain('BOOM_PROBE_loader_failed')
    await expect
      .poll(() => serverStderr(), { timeout: 5000 })
      .toMatch(/\[Pyreon\][^\n]*\/boom[\s\S]*BOOM_PROBE_loader_failed/)
  })

  test('app middleware 401s a server-action POST before the handler runs', async ({ page }) => {
    // Loading the page evaluates the action's module on the server (actions
    // register lazily) and gives us the real browser POST.
    await page.goto('/action-probe')
    const denied = page.waitForResponse((r) => r.url().includes('/_zero/actions/'))
    await page.getByTestId('action-probe').click()
    const res = await denied
    expect(res.status()).toBe(401)
    expect(await res.text()).not.toContain('ACTION_HANDLER_SENTINEL_z3k8')

    // With the credential the same action runs — the 401 came from the
    // middleware, not from a broken endpoint.
    await page.setExtraHTTPHeaders({ 'x-demo-auth': 'let-me-in' })
    const allowed = page.waitForResponse((r) => r.url().includes('/_zero/actions/'))
    await page.getByTestId('action-probe').click()
    const ok = await allowed
    expect(ok.status()).toBe(200)
    expect(await ok.json()).toEqual({ secret: 'ACTION_HANDLER_SENTINEL_z3k8' })
  })
}
