import { type Browser, expect, type Page, test } from '@playwright/test'

// Real-Chromium gate for the collab-board showcase. Two ISOLATED browser
// contexts (no shared origin/storage/BroadcastChannel) converge only through
// the WebSocket relay. We drive list mutations via buttons (deterministic), and
// reorder via a dispatched HTML5-drag sequence (the marquee interaction).

const RELAY = 'ws://127.0.0.1:5190'

function boardUrl(room: string): string {
  // `?ws=` is a REAL query param (before the hash) so the app reads it from
  // `location.search`; the hash drives the router to /board/<room>.
  return `/?ws=${encodeURIComponent(`${RELAY}/${room}`)}#/board/${room}`
}

// Vite's dev server re-optimizes deps on first load and returns a transient
// `504 (Outdated Optimize Dep)` for in-flight requests, then auto-retries — a
// dev-server artifact, not an app error.
const isViteNoise = (t: string): boolean => /Outdated Optimize Dep|ERR_ABORTED|\b504\b/.test(t)

async function openClient(browser: Browser, url: string, errors: string[]): Promise<Page> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' && !isViteNoise(m.text())) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url)
  await expect(page.getByTestId('board-title')).toBeVisible() // past the ready gate
  return page
}

function colTitles(page: Page, col: string): Promise<string[]> {
  return page.getByTestId(`col-${col}`).locator('.card-title').allTextContents()
}

// Dispatch the HTML5 drag sequence to move the first card of a column below the
// last (pragmatic-drag-and-drop needs real DragEvent/DataTransfer, which
// Playwright's mouse can't synthesize). Mirrors app-showcase's dnd gate.
async function dragFirstToLast(page: Page, col: string): Promise<void> {
  await page.evaluate((colId) => {
    const list = document.querySelector(`[data-testid="col-${colId}"]`) as HTMLElement | null
    if (!list) return
    const items = list.querySelectorAll<HTMLElement>('li')
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last || first === last) return
    const dt = new DataTransfer()
    const fire = (target: Element, type: string, y?: number) => {
      const r = (target as HTMLElement).getBoundingClientRect()
      target.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: r.left + r.width / 2,
          clientY: y ?? r.top + r.height / 2,
        }),
      )
    }
    const rl = last.getBoundingClientRect()
    fire(first, 'dragstart')
    fire(last, 'dragenter', rl.bottom - 4)
    fire(last, 'dragover', rl.bottom - 4)
    fire(list, 'drop')
    fire(first, 'dragend')
  }, col)
}

test.describe('collab-board — relay sync', () => {
  test('add card, edit title, and move card in A appear in B', async ({ browser }) => {
    const room = `e2e-${crypto.randomUUID()}`
    const errors: string[] = []
    const a = await openClient(browser, boardUrl(room), errors)
    const b = await openClient(browser, boardUrl(room), errors)

    // (1) Add a card in A's "To Do" → appears in B (syncedList).
    await a.getByTestId('add-todo').click()
    await expect(a.getByTestId('col-todo').getByText('Card 1')).toBeVisible()
    await expect(b.getByTestId('col-todo').getByText('Card 1')).toBeVisible()

    // (2) Edit the board title in A → B's title input reflects it (syncedStore).
    await a.getByTestId('board-title').fill('Launch plan')
    await expect(b.getByTestId('board-title')).toHaveValue('Launch plan')

    // (3) Move the card to the next column in A → B sees it in "Doing"
    //     (cross-column POSITIONAL ops: delete source + push dest).
    await a.getByTestId('col-todo').locator('.card-move').first().click()
    await expect(b.getByTestId('col-doing').getByText('Card 1')).toBeVisible()
    await expect(b.getByTestId('col-todo').getByText('Card 1')).toHaveCount(0)

    expect(errors, errors.join('\n')).toEqual([])
    await a.context().close()
    await b.context().close()
  })

  test('drag-reorder in A syncs the new order to B (useSortable → syncedList)', async ({
    browser,
  }) => {
    const room = `e2e-${crypto.randomUUID()}`
    const errors: string[] = []
    const a = await openClient(browser, boardUrl(room), errors)
    const b = await openClient(browser, boardUrl(room), errors)

    for (let i = 0; i < 3; i++) await a.getByTestId('add-todo').click()
    await expect(b.getByTestId('col-todo').locator('.card').or(b.getByTestId('col-todo').locator('li'))).toHaveCount(3)
    expect(await colTitles(a, 'todo')).toEqual(['Card 1', 'Card 2', 'Card 3'])

    await dragFirstToLast(a, 'todo')

    // The drag fires useSortable.onReorder → cards.set(next) → relay → B.
    await expect
      .poll(() => colTitles(a, 'todo'))
      .not.toEqual(['Card 1', 'Card 2', 'Card 3'])
    await expect.poll(() => colTitles(b, 'todo')).toEqual(await colTitles(a, 'todo'))

    expect(errors, errors.join('\n')).toEqual([])
    await a.context().close()
    await b.context().close()
  })

  test('collaborative notes (@pyreon/code + syncedText): A types, B sees it', async ({
    browser,
  }) => {
    const room = `e2e-${crypto.randomUUID()}`
    const errors: string[] = []
    const a = await openClient(browser, boardUrl(room), errors)
    const b = await openClient(browser, boardUrl(room), errors)

    await a.getByTestId('add-todo').click()
    await expect(b.getByTestId('col-todo').getByText('Card 1')).toBeVisible()

    // A opens the card and types collaborative notes. `pressSequentially` on the
    // editor LOCATOR focuses the contenteditable itself before typing (a bare
    // `.click()` + `page.keyboard.type` can miss focus in headless Linux while the
    // panel settles — the original empty-on-all-retries CI failure).
    await a.getByTestId('col-todo').locator('.card-title').first().click()
    await expect(a.getByTestId('card-panel')).toBeVisible()
    const aEditor = a.getByTestId('card-notes').locator('.cm-content')
    await expect(aEditor).toBeVisible()
    await aEditor.pressSequentially('shipping monday')
    // The edit must land in A's editor (→ syncedText → the CRDT) FIRST — this
    // isolates "did the typing register" from "did it sync".
    await expect(aEditor).toContainText('shipping monday')

    // B opens the SAME card AFTER A's note is in the shared doc, so B's CodeMirror
    // is created from the already-synced `syncedText` value (baked into the initial
    // EditorState) — proving collaborative notes WITHOUT depending on a live signal
    // dispatch landing while B's lazy markdown grammar is still cold-mounting (the
    // CI-only race a both-open-then-type flow is fragile to). Generous budget for
    // the cold first-mount of the CodeMirror grammar chunk on a fresh CI runner.
    await b.getByTestId('col-todo').locator('.card-title').first().click()
    await expect(b.getByTestId('card-panel')).toBeVisible()
    await expect(b.getByTestId('card-notes').locator('.cm-content')).toContainText(
      'shipping monday',
      { timeout: 15000 },
    )

    expect(errors, errors.join('\n')).toEqual([])
    await a.context().close()
    await b.context().close()
  })

  test('offline persistence: a card survives a reload (IndexedDB, no relay)', async ({
    browser,
  }) => {
    const errors: string[] = []
    // No `?ws=` → local board (BroadcastChannel + IndexedDB), so this isolates
    // persistence (not relay re-sync).
    const room = `persist-${crypto.randomUUID()}`
    const a = await openClient(browser, `#/board/${room}`, errors)

    await a.getByTestId('add-todo').click()
    await expect(a.getByTestId('col-todo').getByText('Card 1')).toBeVisible()

    // y-indexeddb writes asynchronously — give the persist a moment to flush
    // before the reload, otherwise we'd reload a doc that hasn't been written.
    await a.waitForTimeout(1000)
    await a.reload()
    await expect(a.getByTestId('board-title')).toBeVisible()
    await expect(a.getByTestId('col-todo').getByText('Card 1')).toBeVisible() // from IndexedDB

    expect(errors, errors.join('\n')).toEqual([])
    await a.context().close()
  })

  test('viewer mode disables editing (permissions UI gate)', async ({ browser }) => {
    const errors: string[] = []
    const a = await openClient(browser, `#/board/viewer-${crypto.randomUUID()}`, errors)

    await expect(a.getByTestId('add-todo')).toBeEnabled()
    await a.getByTestId('role-toggle').click() // Editing → Viewing
    await expect(a.getByTestId('role-toggle')).toHaveText('Viewing')
    await expect(a.getByTestId('add-todo')).toBeDisabled()

    expect(errors, errors.join('\n')).toEqual([])
    await a.context().close()
  })
})
