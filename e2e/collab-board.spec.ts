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

    // Drive the reorder DETERMINISTICALLY via the dev hook (see Column.tsx),
    // NOT a synthetic HTML5 drag. A synthetic DragEvent is a silent no-op on
    // headless Linux CI even after pdnd's listeners attach (verified: re-firing
    // for 15s with listeners wired still never reordered) — driving the pdnd
    // GESTURE is @pyreon/dnd's concern and is covered by app-showcase-dnd + the
    // dnd browser tests. This test's point is the CRDT SYNC: the hook runs the
    // SAME `cards.set(next)` path useSortable.onReorder takes (first card → last),
    // so A reorders and the new order must relay to B. Same precedent as the
    // notes test driving the editor via `value.set` instead of CI keystrokes.
    await a.waitForFunction(
      () =>
        typeof (window as unknown as { __reorderColumns?: Record<string, () => void> })
          .__reorderColumns?.todo === 'function',
    )
    await a.evaluate(() =>
      (
        window as unknown as { __reorderColumns: Record<string, () => void> }
      ).__reorderColumns.todo(),
    )
    await expect.poll(() => colTitles(a, 'todo'), { timeout: 15_000 }).not.toEqual([
      'Card 1',
      'Card 2',
      'Card 3',
    ])
    await expect.poll(() => colTitles(b, 'todo'), { timeout: 15_000 }).toEqual(
      await colTitles(a, 'todo'),
    )

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

    // A opens the card and edits its collaborative notes. We drive the edit
    // through the editor's `value` signal (`editor.value.set`, the documented
    // public controlled-binding API, via the dev-only `__cardEditor` hook) rather
    // than simulated OS keystrokes. A diagnostic CI run proved keystrokes render
    // into the contenteditable DOM but do NOT reach a cold-mounted CodeMirror's
    // doc state on a fresh CI runner (the editor view isn't created until the lazy
    // markdown grammar resolves — `editor.insert` even no-ops while the view is
    // null), so `notes` (the syncedText CRDT) stayed empty and nothing synced.
    // `value.set` feeds the editor↔syncedText binding effect directly — no view
    // dependency — so it deterministically writes the CRDT and syncs. The
    // keystroke-level CodeMirror input path is @pyreon/code's own concern (covered
    // by its browser tests), not what this sync showcase gates on.
    await a.getByTestId('col-todo').locator('.card-title').first().click()
    await expect(a.getByTestId('card-panel')).toBeVisible()
    await expect(a.getByTestId('card-notes').locator('.cm-content')).toBeVisible()
    await a.evaluate(() =>
      (window as unknown as { __cardEditor?: { value: { set: (t: string) => void } } }).__cardEditor?.value.set(
        'shipping monday',
      ),
    )
    // Assert A's edit actually reached the CRDT (not just CodeMirror's DOM — that
    // was the original false-positive). This is the real "the edit landed" check.
    await expect
      .poll(
        () =>
          a.evaluate(
            () => (window as unknown as { __cardNotes?: () => string }).__cardNotes?.() ?? '',
          ),
        { timeout: 10_000 },
      )
      .toContain('shipping monday')

    // B opens the SAME card AFTER A's note is in the shared doc, so B's CodeMirror
    // is created from the already-synced `syncedText` value (baked into the initial
    // EditorState) — proving collaborative notes WITHOUT depending on a live signal
    // dispatch landing while B's lazy markdown grammar is still cold-mounting.
    // Generous budget for the cold first-mount of the grammar chunk on a fresh runner.
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

  test('presence avatars + live cursors sync over awareness', async ({ browser }) => {
    const room = `e2e-${crypto.randomUUID()}`
    const errors: string[] = []
    const a = await openClient(browser, boardUrl(room), errors)
    const b = await openClient(browser, boardUrl(room), errors)

    // Each client publishes its presence (name + color) on mount via
    // `syncedAwareness` → over the relay → each sees TWO avatars (self + peer).
    await expect(a.getByTestId('presence').locator('.avatar')).toHaveCount(2)
    await expect(b.getByTestId('presence').locator('.avatar')).toHaveCount(2)

    // A moves its mouse → its cursor is published into awareness → B renders it.
    // Dispatch the mousemove directly (Playwright's mouse.move doesn't reliably
    // reach a `window` listener in headless — same reason the dnd specs dispatch
    // real events). B sees only A's cursor (`others()` excludes self).
    const move = (x: number, y: number) => (p: typeof a) =>
      p.evaluate(
        ([cx, cy]) =>
          window.dispatchEvent(new MouseEvent('mousemove', { clientX: cx, clientY: cy, bubbles: true })),
        [x, y],
      )
    await move(320, 240)(a)
    await expect(b.getByTestId('remote-cursor')).toHaveCount(1)
    await expect(a.getByTestId('remote-cursor')).toHaveCount(0)

    // Moving again patches the SAME cursor in place — still exactly one.
    await move(120, 360)(a)
    await expect(b.getByTestId('remote-cursor')).toHaveCount(1)

    // A leaves → the relay purges its presence → B drops back to one avatar and
    // A's cursor disappears (ephemeral — no ghost, no last-seen filtering).
    await a.context().close()
    await expect(b.getByTestId('presence').locator('.avatar')).toHaveCount(1)
    await expect(b.getByTestId('remote-cursor')).toHaveCount(0)

    expect(errors, errors.join('\n')).toEqual([])
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
