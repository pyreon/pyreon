import { expect, test, type Page } from '@playwright/test'

/**
 * Every `@pyreon/ui-components` page on the built workbench shows the
 * component — the deployed pyreon.dev/atlas contract.
 *
 * VISIBLE, measured: a bounding box with area, or a portaled overlay on the
 * body. "The preview has children" was true of an empty `<button>`; "verified"
 * was true of a scenario that mounted no DOM at all. The list of components is
 * read from the built site's own sidebar, so a component added to the library
 * is covered the day it lands, and one dropped by discovery fails this rather
 * than vanishing.
 */

/** Components whose rendered box is legitimately tiny. */
const TINY_BY_DESIGN: Record<string, string> = {
  // A 1×1 clip is the whole point of the component.
  'visually-hidden': 'clips itself to 1px for assistive tech',
  // An 8px status dot — real, and smaller than the threshold below.
  indicator: 'a status dot',
}

async function componentIds(page: Page): Promise<string[]> {
  await page.goto('/')
  await expect(page.getByTestId('canvas-name')).not.toHaveText('')
  // Every sidebar component row carries its id as `data-testid="component-<id>"`,
  // and `<id>` is the route. Read from the page rather than a list written
  // here, so the library and the gate cannot drift apart.
  const rows = await page.locator('[data-testid^="component-"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid')!.slice('component-'.length)),
  )
  return [...new Set(rows)]
}

test.describe('atlas build — @pyreon/ui-components', () => {
  test('lists the whole library', async ({ page }) => {
    const ids = await componentIds(page)
    // 108 today; the point is "not a handful" — a discovery regression that
    // drops a package's exports shows up here as a small number.
    expect(ids.length, ids.join(',')).toBeGreaterThan(90)
  })

  test('every component page renders VISIBLE preview DOM', async ({ page }) => {
    test.setTimeout(300_000)
    const ids = await componentIds(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    const empty: string[] = []
    for (const id of ids) {
      await page.goto(`/${id}/`)
      const preview = page.getByTestId('canvas-preview')
      await expect(preview).toBeAttached()
      await expect(preview.locator('[data-atlas-error]')).toHaveCount(0)
      const box = await preview.evaluate((el) => {
        const own = [...el.querySelectorAll('*')].reduce((a, n) => {
          const r = n.getBoundingClientRect()
          return Math.max(a, r.width * r.height)
        }, 0)
        // An overlay portals to the body; the runtime brackets it in
        // `<!--portal-->` markers.
        const portaled = [...document.body.childNodes].some(
          (n) => n.nodeType === 8 && (n as Comment).data === 'portal',
        )
        return { own, portaled, text: (el.textContent ?? '').trim() }
      })
      const visible = box.own > 200 || box.portaled
      if (!visible && !(id in TINY_BY_DESIGN)) {
        empty.push(`${id} (area ${Math.round(box.own)}, text "${box.text.slice(0, 30)}")`)
      }
    }
    expect(empty, `previews with nothing to see:\n  ${empty.join('\n  ')}`).toEqual([])
    expect(errors).toEqual([])
  })

  test('a part renders inside its parent, and says so', async ({ page }) => {
    await page.goto('/tab-panel/')
    await expect(page.getByTestId('canvas-name')).toHaveText('TabPanel')
    await expect(page.getByTestId('canvas-preview').getByRole('tab')).toHaveCount(3)
    await expect(page.getByTestId('canvas-empty')).toHaveCount(0)
  })

  test('an overlay opens on the canvas and closes back into its control', async ({ page }) => {
    await page.goto('/dialog/')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('canvas-empty')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('block-level components span the stage — the frame is not shrink-wrapped', async ({ page }) => {
    await page.goto('/divider/')
    const hr = page.getByTestId('canvas-preview').locator('hr')
    const box = await hr.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(300)
  })
})
