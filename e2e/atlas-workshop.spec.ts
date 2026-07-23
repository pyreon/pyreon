import { type Browser, expect, type Page, test } from '@playwright/test'

/**
 * Real-Chromium e2e for the Atlas Component Workshop — the authoritative proof
 * the Storybook-alternative UI WORKS end-to-end on the Pyreon stack (zero SSR +
 * rocketstyle-on-elements + PyreonUI theming, no inline styles). Every spec
 * targets a shape a green `vite build` / happy-dom cannot see.
 *
 * This suite CAUGHT (and its fixes address) THREE showstoppers a build could not:
 *   1. the styler theme context was unwired (`background:undefined` → HTTP 500);
 *      fixed by wrapping in <PyreonUI> (autoInit + enrichTheme).
 *   2. every horizontal container stacked vertically + overlapped (Element owns
 *      layout via its `css`/direction props, overriding `extendCss` flex); fixed
 *      by routing layout through Element's `css` prop.
 *   3. rocketstyle dimension states never applied — the compiler emits an INLINE
 *      reactive dimension prop (`state={sig()?'a':'b'}`) as a bare accessor
 *      `state: () => …`, and rocketstyle's `calculateStylingAttrs` treated a
 *      function as `undefined` → the dimension was dropped. Fixed in
 *      `rocketstyle/utils/attrs.ts` (resolve a function-valued dimension prop);
 *      workshop dimensions moved to callback form + structured keys. So the
 *      active-tab highlight, the Variant preview switch, and zoom-scale now work.
 */

const isNoise = (t: string): boolean =>
  /Outdated Optimize Dep|ERR_ABORTED|\b504\b|Failed to load resource/.test(t)

async function open(browser: Browser, errors: string[]): Promise<Page> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' && !isNoise(m.text())) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.getByTestId('atlas-shell')).toBeVisible()
  return page
}

const bg = (page: Page, sel: string): Promise<string> =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)!).backgroundColor, sel)

const PREVIEW_BTN = '[data-testid="canvas-preview"] button'

test.describe('Atlas workshop — real-Chromium e2e', () => {
  test('boots + hydrates with no console errors; rocketstyle emits real CSS', async ({
    browser,
  }) => {
    const errors: string[] = []
    const page = await open(browser, errors)

    // The shell's rocketstyle .theme() must have emitted a real background (not
    // the transparent default a broken theme-context pipeline left → HTTP 500).
    const shellBg = await bg(page, '[data-testid="atlas-shell"]')
    expect(shellBg).not.toBe('rgba(0, 0, 0, 0)')
    expect(shellBg).not.toBe('transparent')

    // Default preview button = a real accent background.
    await expect(page.locator(PREVIEW_BTN)).toBeVisible()
    const btnBg = await bg(page, PREVIEW_BTN)
    expect(btnBg).toMatch(/^rgb/)
    expect(btnBg).not.toBe('rgba(0, 0, 0, 0)')

    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([])
  })

  test('layout: header on-screen, preview clickable (no vertical-stack overlap)', async ({
    browser,
  }) => {
    const errors: string[] = []
    const page = await open(browser, errors)

    // Regression guard for the flex-stack-and-overlap bug: the header must be a
    // horizontal row at the top of the viewport, and the addon panel must NOT
    // cover the canvas preview.
    const geo = await page.evaluate(() => {
      const header = document.querySelector('header') as HTMLElement
      const btn = document.querySelector('[data-testid="canvas-preview"] button') as HTMLElement
      const r = btn.getBoundingClientRect()
      const onTop = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return {
        headerY: Math.round(header.getBoundingClientRect().y),
        headerDir: getComputedStyle(header).flexDirection,
        previewClickable: !!onTop && (btn.contains(onTop) || onTop === btn),
      }
    })
    expect(geo.headerY).toBe(0)
    expect(geo.headerDir).toBe('row')
    expect(geo.previewClickable).toBe(true)

    expect(errors).toEqual([])
  })

  test('a text control drives the live preview (signal → fine-grained re-render)', async ({
    browser,
  }) => {
    const errors: string[] = []
    const page = await open(browser, errors)

    await expect(page.locator(PREVIEW_BTN)).toHaveText('Get started')
    await page.getByPlaceholder('Get started').fill('Hello Atlas')
    await expect(page.locator(PREVIEW_BTN)).toHaveText('Hello Atlas')

    expect(errors).toEqual([])
  })

  test('reactive theme swap: brand + dark repaint the preview', async ({ browser }) => {
    const errors: string[] = []
    const page = await open(browser, errors)

    const emberBtn = await bg(page, PREVIEW_BTN)
    await page.getByRole('button', { name: 'Aurora', exact: true }).click()
    await expect.poll(() => bg(page, PREVIEW_BTN)).not.toBe(emberBtn)

    const shellDark = await bg(page, '[data-testid="atlas-shell"]')
    await page.getByTitle('Toggle theme').click()
    await expect.poll(() => bg(page, '[data-testid="atlas-shell"]')).not.toBe(shellDark)

    expect(errors).toEqual([])
  })

  test('views switch: Canvas ↔ Docs ↔ Theme Lab', async ({ browser }) => {
    const errors: string[] = []
    const page = await open(browser, errors)

    await page.getByRole('button', { name: 'Docs', exact: true }).click()
    await expect(page.getByTestId('props-table')).toBeVisible()
    await expect(page.getByText('label', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Theme Lab', exact: true }).click()
    const grid = page.getByTestId('lab-grid')
    await expect(grid).toBeVisible()
    // 4 brands × light/dark = 8 tiles, each with its own themed preview button.
    await expect(grid.locator('button')).toHaveCount(8)

    await page.getByRole('button', { name: 'Canvas', exact: true }).click()
    await expect(page.getByTestId('canvas-preview')).toBeVisible()

    expect(errors).toEqual([])
  })

  test('Actions addon logs a real click; search + sidebar select work', async ({ browser }) => {
    const errors: string[] = []
    const page = await open(browser, errors)

    await page.getByRole('button', { name: 'Actions', exact: true }).click()
    await expect(page.getByText('No events yet — click the component.')).toBeVisible()
    await page.getByRole('button', { name: 'Controls', exact: true }).click()
    await page.locator(PREVIEW_BTN).click()
    await page.getByRole('button', { name: 'Actions', exact: true }).click()
    await expect(page.getByText('onClick', { exact: true })).toBeVisible()

    await page.locator('input[data-search]').fill('badge')
    await expect(page.getByRole('button', { name: /Badge/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Button/ })).toHaveCount(0)
    await page.getByRole('button', { name: /Badge/ }).click()
    await expect(page.getByTestId('canvas-name')).toHaveText('Badge')

    expect(errors).toEqual([])
  })

  test('rocketstyle dimensions apply: active-tab highlight, variant flip, zoom scale', async ({
    browser,
  }) => {
    const errors: string[] = []
    const page = await open(browser, errors)

    // (a) active-tab highlight — the `.states()` dimension resolves for an INLINE
    // reactive `state={view()==='canvas'?'active':'idle'}` prop. The active Canvas
    // tab must carry a different (highlighted) class than the idle Docs tab.
    const tabs = await page.evaluate(() => {
      const b = (t: string) => [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === t) as HTMLElement
      const canvas = b('Canvas')
      return {
        differ: canvas.className !== b('Docs').className,
        canvasBg: getComputedStyle(canvas).backgroundColor,
        canvasWeight: getComputedStyle(canvas).fontWeight, // base styling must survive the dimension merge
      }
    })
    expect(tabs.differ).toBe(true)
    expect(tabs.canvasBg).not.toBe('rgba(0, 0, 0, 0)')
    expect(tabs.canvasWeight).toBe('600')

    // (b) variant control flips the demo button (`.variants()` dimension).
    const solid = await bg(page, PREVIEW_BTN)
    await page.getByRole('button', { name: 'outline', exact: true }).click()
    await expect.poll(() => bg(page, PREVIEW_BTN)).toBe('rgba(0, 0, 0, 0)')
    expect(solid).not.toBe('rgba(0, 0, 0, 0)')

    // (c) zoom + scales the preview surface (`.sizes()` dimension). Poll the
    // transform — there's a `transition: transform .12s` so it settles a frame
    // after the label flips to 125%.
    await page.getByRole('button', { name: '+', exact: true }).click()
    await expect(page.getByTestId('zoom-label')).toHaveText('125%')
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.querySelector('[data-testid="canvas-preview"]')!).transform,
        ),
      )
      .toMatch(/matrix\(1\.25/)

    expect(errors).toEqual([])
  })
})
