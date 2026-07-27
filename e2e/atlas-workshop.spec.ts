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

/**
 * Canvas addons — the Storybook-inspired tools. These assert the RENDERED
 * effect (a real width, a real background colour, real outline CSS, the real
 * pseudo styling), not just that a button toggled: an addon that flips state
 * but paints nothing is exactly the failure mode worth catching.
 */
test.describe('Atlas workshop — canvas addons', () => {
  test('viewport presets resize the canvas frame', async ({ browser }) => {
    const page = await open(browser)
    // Widen the window so the tablet preset fits BESIDE the sidebar + addon
    // panel. The presets are capped at the stage width on purpose (`maxWidth:
    // 100%`), so in a narrow window a wide preset legitimately renders
    // narrower than its nominal size — asserting the nominal number without
    // the room for it would be testing the cap, not the preset.
    await page.setViewportSize({ width: 1700, height: 900 })
    await page.getByTestId('addon-tab-canvas').click()

    const frame = page.getByTestId('canvas-frame')
    const width = async () => Math.round((await frame.boundingBox())!.width)
    const full = await width()

    await page.getByTestId('viewport-mobile').click()
    await expect.poll(width).toBe(375)

    await page.getByTestId('viewport-tablet').click()
    await expect.poll(width).toBe(768)

    await page.getByTestId('viewport-full').click()
    await expect.poll(width).toBe(full)
  })

  test('a viewport wider than the stage is CAPPED, never overflowing it', async ({ browser }) => {
    const page = await open(browser)
    await page.setViewportSize({ width: 1100, height: 800 })
    await page.getByTestId('addon-tab-canvas').click()

    await page.getByTestId('viewport-desktop').click() // 1280px nominal
    const frame = await page.getByTestId('canvas-frame').boundingBox()
    const stage = await page.getByTestId('canvas-preview').evaluate((el) => {
      const stageEl = el.closest('div')!.parentElement!.parentElement!
      return stageEl.clientWidth
    })
    expect(frame!.width).toBeLessThanOrEqual(stage)
    expect(frame!.width).toBeLessThan(1280)
  })

  test('background presets repaint the preview surface', async ({ browser }) => {
    const page = await open(browser)
    await page.getByTestId('addon-tab-canvas').click()

    const surface = page.getByTestId('canvas-preview')
    const bg = () => surface.evaluate((el) => getComputedStyle(el).backgroundColor)
    const themeBg = await bg()

    await page.getByTestId('background-light').click()
    await expect.poll(bg).toBe('rgb(255, 255, 255)')

    await page.getByTestId('background-dark').click()
    await expect.poll(bg).toBe('rgb(15, 15, 20)')

    await page.getByTestId('background-theme').click()
    await expect.poll(bg).toBe(themeBg)
  })

  test('outline toggle outlines every element inside the preview only', async ({ browser }) => {
    const page = await open(browser)
    await page.getByTestId('addon-tab-canvas').click()

    const inner = page.getByTestId('canvas-preview').locator('button').first()
    const outlineOf = () => inner.evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(await outlineOf()).toBe('none')

    await page.getByTestId('outline-toggle').click()
    await expect.poll(outlineOf).toBe('solid')

    // chrome outside the preview must stay untouched
    const chromeOutline = await page
      .getByTestId('addon-tab-canvas')
      .evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(chromeOutline).toBe('none')

    await page.getByTestId('outline-toggle').click()
    await expect.poll(outlineOf).toBe('none')
  })

  test('pseudo-state forcing applies the component REAL hover styling', async ({ browser }) => {
    const page = await open(browser)
    await page.getByTestId('addon-tab-canvas').click()

    const btn = page.getByTestId('canvas-preview').locator('button').first()
    // Read the property the demo Button's `hover` theme block actually sets.
    const filter = () => btn.evaluate((el) => getComputedStyle(el).filter)
    const resting = await filter()
    expect(resting).toBe('none')

    // Forcing hover must change the PAINTED style — the whole point: rocketstyle
    // renders the same CSS a real pointer hover would, driven by a prop, so no
    // stylesheet rewriting is involved.
    await page.getByTestId('pseudo-hover').click()
    await expect.poll(filter).toContain('brightness')

    await page.getByTestId('pseudo-none').click()
    await expect.poll(filter).toBe('none')

    // …and a real pointer hover produces the SAME declaration, which is the
    // claim that separates this from a lookalike class.
    await btn.hover()
    await expect.poll(filter).toContain('brightness')
  })

  test('forcing `disabled` applies the disabled block', async ({ browser }) => {
    const page = await open(browser)
    await page.getByTestId('addon-tab-canvas').click()

    const btn = page.getByTestId('canvas-preview').locator('button').first()
    const opacity = () => btn.evaluate((el) => Number(getComputedStyle(el).opacity))
    expect(await opacity()).toBe(1)

    await page.getByTestId('pseudo-disabled').click()
    await expect.poll(opacity).toBeLessThan(1)

    await page.getByTestId('pseudo-none').click()
    await expect.poll(opacity).toBe(1)
  })
})
