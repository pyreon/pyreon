import { expect, test } from '@playwright/test'

// Real-Chromium proof of the CROSS-DEVICE sync path (raw-Yjs track): two
// ISOLATED browser contexts — separate origins-as-far-as-the-browser-cares, so
// NO shared BroadcastChannel and NO shared storage — converge on one synced
// field. The ONLY thing that can bridge them is the WebSocket relay
// (`@pyreon/sync/server`). Contrast `sync-yjs-demo.spec.ts`, where two pages in
// ONE context sync via BroadcastChannel with zero network.
//
// `?ws=<relay-url>` puts the demo in relay-only mode (no BroadcastChannel, no
// persistence), so convergence here is unambiguously the relay's doing.

const RELAY = 'ws://127.0.0.1:5186'
// Fixed room — the relay process is booted fresh per CI run (webServer), so the
// room starts empty; GC'd when both contexts close.
const ROOM = 'e2e-cross-context'
const url = `/?ws=${encodeURIComponent(`${RELAY}/${ROOM}`)}`

test.describe('sync (Yjs) — cross-context WebSocket relay', () => {
  test('two isolated contexts converge over the relay (not BroadcastChannel)', async ({
    browser,
  }) => {
    const errors: string[] = []
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const a = await ctxA.newPage()
    const b = await ctxB.newPage()
    for (const p of [a, b]) {
      p.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      p.on('pageerror', (e) => errors.push(String(e)))
    }

    await a.goto(url)
    await b.goto(url)

    // Both connect to the relay and seed the same scalar — no edit yet, so both
    // settle on 'untitled' (the create-if-missing seed; LWW of identical values).
    await expect(a.getByTestId('title')).toHaveText('untitled')
    await expect(b.getByTestId('title')).toHaveText('untitled')

    // Tag B's <h1> to prove the later update patches the SAME node in place
    // (surgical `_bindText`), not a re-render — exactly as the same-origin proof.
    await b.evaluate(() =>
      document.querySelector('[data-testid="title"]')?.setAttribute('data-marker', 'keep'),
    )

    // A edits → CRDT update → relay → B (which shares NOTHING with A but the relay).
    await a.getByTestId('set-a').click()
    await expect(a.getByTestId('title')).toHaveText('from-tab-A')
    await expect(b.getByTestId('title')).toHaveText('from-tab-A') // converged via the relay

    const marker = await b.evaluate(() =>
      document.querySelector('[data-testid="title"]')?.getAttribute('data-marker'),
    )
    expect(marker).toBe('keep') // same node — surgical patch, no re-render

    // Reverse direction, and a collaborative LIST add over the relay.
    await b.getByTestId('set-b').click()
    await expect(a.getByTestId('title')).toHaveText('from-tab-B')

    await a.getByTestId('add-a').click() // A pushes 'item-A'
    await b.getByTestId('add-b').click() // B pushes 'item-B'
    for (const p of [a, b]) {
      await expect(p.getByTestId('items').getByText('item-A')).toBeVisible()
      await expect(p.getByTestId('items').getByText('item-B')).toBeVisible()
      await expect(p.getByTestId('items').locator('li.item')).toHaveCount(2)
    }

    expect(errors).toEqual([])
    await ctxA.close()
    await ctxB.close()
  })

  test('a late-joining context catches up from the relay room state', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await a.goto(url)
    await a.getByTestId('set-a').click()
    await expect(a.getByTestId('title')).toHaveText('from-tab-A')

    // B opens AFTER A's edit, in a fresh context. The relay holds the room's
    // authoritative state; B's connect handshake (B sends its state vector, the
    // relay replies with the diff) must bring it into agreement with A. CRDTs
    // guarantee CONVERGENCE, not a specific winner — poll until both AGREE.
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await b.goto(url)

    await expect
      .poll(async () => {
        const at = await a.getByTestId('title').textContent()
        const bt = await b.getByTestId('title').textContent()
        return at !== null && at === bt
      })
      .toBe(true)

    await ctxA.close()
    await ctxB.close()
  })
})
