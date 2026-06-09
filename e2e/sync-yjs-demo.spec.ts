import { expect, test } from '@playwright/test'

// Real-Chromium proof of the local-first sync headline (raw-Yjs track):
// two tabs editing one synced field stay in sync with ZERO network
// (BroadcastChannel), and a remote edit patches exactly the bound text node
// (compiled `_bindText`) — no component re-render. Two pages in ONE browser
// context share an origin, so BroadcastChannel propagates between them.

test.describe('sync (Yjs) — two-tab BroadcastChannel sync', () => {
  test('an edit in one tab propagates to the other, surgically (no re-render)', async ({
    context,
  }) => {
    const errors: string[] = []
    const a = await context.newPage()
    const b = await context.newPage()
    for (const p of [a, b]) {
      p.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      p.on('pageerror', (e) => errors.push(String(e)))
    }

    await a.goto('/')
    await b.goto('/')

    // Both start at the seeded value (and have run the connect handshake).
    await expect(a.getByTestId('title')).toHaveText('untitled')
    await expect(b.getByTestId('title')).toHaveText('untitled')

    // Tag tab B's <h1> so we can prove it's the SAME element after the remote
    // update — i.e. `_bindText` patched its `.data` in place, the node was not
    // recreated by a re-render.
    await b.evaluate(() =>
      document.querySelector('[data-testid="title"]')?.setAttribute('data-marker', 'keep'),
    )

    // Edit in tab A → CRDT update → BroadcastChannel → tab B.
    await a.getByTestId('set-a').click()

    await expect(a.getByTestId('title')).toHaveText('from-tab-A')
    await expect(b.getByTestId('title')).toHaveText('from-tab-A') // converged, zero network

    const marker = await b.evaluate(() =>
      document.querySelector('[data-testid="title"]')?.getAttribute('data-marker'),
    )
    expect(marker).toBe('keep') // same <h1> element — surgical patch, no re-render

    // Reverse direction.
    await b.getByTestId('set-b').click()
    await expect(a.getByTestId('title')).toHaveText('from-tab-B')
    await expect(b.getByTestId('title')).toHaveText('from-tab-B')

    // Realistic edit path: typing in A's input syncs to B.
    await a.getByTestId('input').fill('typed-in-A')
    await expect(b.getByTestId('title')).toHaveText('typed-in-A')

    expect(errors).toEqual([])
    await a.close()
    await b.close()
  })

  test('a late-joining tab converges via the state-vector handshake', async ({ context }) => {
    const a = await context.newPage()
    await a.goto('/')
    await a.getByTestId('set-a').click()
    await expect(a.getByTestId('title')).toHaveText('from-tab-A')

    // B opens AFTER A's edit. The connect handshake (B sends its state vector,
    // A replies with the diff) must bring both into agreement. CRDTs guarantee
    // CONVERGENCE, not a specific winner, so assert the two tabs AGREE — poll
    // until the async handshake + LWW settle.
    const b = await context.newPage()
    await b.goto('/')

    await expect
      .poll(async () => {
        const at = await a.getByTestId('title').textContent()
        const bt = await b.getByTestId('title').textContent()
        return at !== null && at === bt
      })
      .toBe(true)

    await a.close()
    await b.close()
  })
})

test.describe('sync (Yjs) — IndexedDB persistence', () => {
  test('an edit survives a page reload (offline-durable)', async ({ page }) => {
    // Fresh context per test → fresh IndexedDB, so the initial state is clean.
    await page.goto('/')
    await expect(page.getByTestId('title')).toHaveText('untitled')

    await page.getByTestId('set-a').click()
    await expect(page.getByTestId('title')).toHaveText('from-tab-A')

    // Let y-indexeddb flush the update to IndexedDB before reloading.
    await page.waitForTimeout(500)
    await page.reload()

    // After reload the doc loads its persisted state from IndexedDB (the app
    // awaits `whenSynced` before seeding), so the edit is still there — not the
    // 'untitled' default.
    await expect(page.getByTestId('title')).toHaveText('from-tab-A')
  })
})

test.describe('sync (Yjs) — collaborative text (Y.Text)', () => {
  test('concurrent inserts from two tabs MERGE with no lost characters', async ({
    context,
  }) => {
    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto('/')
    await b.goto('/')

    await a.getByTestId('ins-a').click() // A inserts 'AAA'
    await expect(b.getByTestId('body')).toHaveValue('AAA') // B receives it
    await b.getByTestId('ins-b').click() // B inserts 'BBB' (its text is now 'AAA')

    // Both tabs converge AND both inserts survive — no character dropped
    // (contrast the scalar `title`, where two writes resolve by last-writer-wins).
    await expect(a.getByTestId('body')).toHaveValue(/AAA/)
    await expect(a.getByTestId('body')).toHaveValue(/BBB/)
    const av = await a.getByTestId('body').inputValue()
    const bv = await b.getByTestId('body').inputValue()
    expect(av).toBe(bv)
    expect(av.length).toBe(6)

    await a.close()
    await b.close()
  })

  test('typing in one tab streams into the other', async ({ context }) => {
    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto('/')
    await b.goto('/')

    await a.getByTestId('body').fill('hello from A')
    await expect(b.getByTestId('body')).toHaveValue('hello from A')

    await a.close()
    await b.close()
  })
})
