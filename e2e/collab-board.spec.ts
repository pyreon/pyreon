import { expect, test } from '@playwright/test'

// Real-Chromium proof that the collab-board example's @pyreon/sync layer
// converges two ISOLATED clients (separate browser contexts — no shared origin,
// no shared storage/BroadcastChannel) through the WebSocket relay. We drive the
// mutations via BUTTONS (add / move / title), not simulated drag: the assertion
// here is about the SYNC path (and the positional cross-column ops drag also
// uses), which stays deterministic. Drag mechanics themselves are covered by
// app-showcase's dnd gate; useSortable's SETUP against a synced list is
// exercised here implicitly (a setup throw would stop the board from rendering,
// failing the first assertion).

const RELAY = 'ws://127.0.0.1:5190'

function boardUrl(room: string): string {
  // `?ws=` is a REAL query param (before the hash) so the app reads it from
  // `location.search`; the hash drives the router to /board/<room>.
  return `/?ws=${encodeURIComponent(`${RELAY}/${room}`)}#/board/${room}`
}

test.describe('collab-board — two clients converge over the relay', () => {
  test('add card, edit title, and move card in A appear in B', async ({ browser }) => {
    const room = `e2e-${crypto.randomUUID()}`
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const a = await ctxA.newPage()
    const b = await ctxB.newPage()

    const errors: string[] = []
    for (const p of [a, b]) {
      p.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      p.on('pageerror', (e) => errors.push(String(e)))
    }

    await a.goto(boardUrl(room))
    await b.goto(boardUrl(room))

    // Both load past the async (whenSynced) ready gate.
    await expect(a.getByTestId('board-title')).toBeVisible()
    await expect(b.getByTestId('board-title')).toBeVisible()

    // (1) Add a card in A's "To Do" → it appears in B's "To Do" (syncedList).
    await a.getByTestId('add-todo').click()
    await expect(a.getByTestId('col-todo').getByText('Card 1')).toBeVisible()
    await expect(b.getByTestId('col-todo').getByText('Card 1')).toBeVisible()

    // (2) Edit the board title in A → B's title input reflects it (syncedStore).
    await a.getByTestId('board-title').fill('Launch plan')
    await expect(b.getByTestId('board-title')).toHaveValue('Launch plan')

    // (3) Move the card to the next column in A → B sees it in "Doing" and gone
    //     from "To Do" (cross-column POSITIONAL ops: delete source + push dest).
    await a.getByTestId('col-todo').locator('.card-move').first().click()
    await expect(b.getByTestId('col-doing').getByText('Card 1')).toBeVisible()
    await expect(b.getByTestId('col-todo').getByText('Card 1')).toHaveCount(0)

    await ctxA.close()
    await ctxB.close()
    expect(errors, errors.join('\n')).toEqual([])
  })
})
