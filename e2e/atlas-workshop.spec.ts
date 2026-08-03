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
    // Brand themes moved into the profile menu (avatar, top-right).
    await page.getByTestId('profile-btn').click()
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

    await page.getByTestId('search-trigger').click()
    await page.locator('input[data-search]').fill('badge')
    const dialog = page.getByTestId('search-dialog')
    await expect(dialog.getByRole('button', { name: /Badge/ })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Button/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: /Badge/ }).click()
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

test('A11y panel reports the REAL rendered element, not fabricated passes', async ({ browser }) => {
  const page = await open(browser)
  await page.getByTestId('addon-tab-a11y').click()

  // The demo Button renders a native <button> with text, so every check should
  // genuinely pass — and crucially the notes must reference what was inspected.
  const body = page.locator('body')
  await expect(body).toContainText('passing')

  // "Keyboard operable" must cite the real element, not a canned sentence.
  await expect(body).toContainText(/native <button>|focusable/i)

  // Emptying the label removes the accessible name → a REAL violation appears.
  await page.getByTestId('addon-tab-controls').click()
  const label = page.getByTestId('canvas-preview').locator('button').first()
  const before = (await label.textContent())?.trim()
  expect(before).toBeTruthy()

  await page.locator('input[placeholder]').first().fill('')
  await page.getByTestId('addon-tab-a11y').click()
  // an unnamed <button> is a genuine danger — the old metadata check could not
  // see this because it only looked at control values, never the DOM
  await expect(body).toContainText(/violation/i)
})

test('Locale addon flips writing direction on the preview (RTL layout test)', async ({ browser }) => {
  const page = await open(browser)
  await page.getByTestId('addon-tab-canvas').click()

  const preview = page.getByTestId('canvas-preview')
  const dir = () => preview.evaluate((el) => el.getAttribute('dir'))
  expect(await dir()).toBe('ltr')

  // Arabic is RTL — the flip is what exposes hardcoded margin-left / one-sided
  // borders / unmirrored icons, so it must reach the DOM, not just the label.
  await page.getByTestId('locale-ar').click()
  await expect.poll(dir).toBe('rtl')
  // and the browser must actually resolve the direction, not just carry the attr
  await expect.poll(() => preview.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')

  await page.getByTestId('locale-en').click()
  await expect.poll(dir).toBe('ltr')
})

/**
 * Reactive coverage — the capability no React-based workbench can have.
 *
 * These assert the VERDICT changes with real interaction, not merely that a
 * panel renders. A coverage panel that always shows the same number would be
 * indistinguishable from a broken one, which is precisely the failure mode the
 * verify verdict had before #2539.
 */
test.describe('Reactivity panel — reactive coverage', () => {
  test('records a session and reports uncovered reactive edges', async ({ browser }) => {
    const page = await open(browser)
    await page.getByTestId('addon-tab-reactivity').click()

    // Before recording there is no verdict — not a fabricated 100%.
    await expect(page.getByTestId('coverage-summary')).toHaveCount(0)
    await expect(page.locator('body')).toContainText(/No recording yet/i)

    // The workbench runs in a dev build, so coverage IS available. If this
    // renders, the panel is misreporting a healthy build as unmeasurable.
    await expect(page.getByTestId('coverage-unavailable')).toHaveCount(0)

    await page.getByTestId('coverage-toggle').click()
    await expect(page.getByTestId('coverage-toggle')).toHaveText(/Stop/i)

    // Drive real reactivity: flip a control so signals actually write.
    await page.getByTestId('addon-tab-controls').click()
    const textInput = page.locator('input[placeholder]').first()
    await textInput.fill('coverage probe')
    await page.getByTestId('addon-tab-reactivity').click()

    await page.getByTestId('coverage-toggle').click()
    await expect(page.getByTestId('coverage-toggle')).toHaveText(/Record/i)

    const summary = page.getByTestId('coverage-summary')
    await expect(summary).toHaveCount(1)
    // A percentage and a node count, both real.
    await expect(summary).toContainText(/% covered/)
    await expect(summary).toContainText(/\d+\/\d+ nodes/)
  })

  test('a recorded session measures something — the denominator is not zero', async ({ browser }) => {
    const page = await open(browser)
    await page.getByTestId('addon-tab-reactivity').click()
    await page.getByTestId('coverage-toggle').click()

    await page.getByTestId('addon-tab-canvas').click()
    await page.getByTestId('viewport-tablet').click()
    await page.getByTestId('addon-tab-reactivity').click()
    await page.getByTestId('coverage-toggle').click()

    // `0/0 nodes` would mean the session recorded nothing while still showing a
    // percentage — the empty-scan false green, in a new place.
    const text = (await page.getByTestId('coverage-summary').textContent()) ?? ''
    const match = /(\d+)\/(\d+) nodes/.exec(text)
    expect(match, `no node count in: ${text}`).not.toBeNull()
    expect(Number(match![2]), 'the graph must have nodes to measure').toBeGreaterThan(0)
  })
})

/**
 * "Why did this update?" — the inverse of React DevTools' whole-component
 * answer. Asserts the chain NAMES a node, not merely that a panel renders.
 */
test.describe('Why panel — causal chains', () => {
  test('names the chain behind a real interaction', async ({ browser }) => {
    const page = await open(browser)
    await page.getByTestId('addon-tab-why').click()

    // A dev build, so chains ARE reconstructable — the unavailable notice here
    // would mean the panel misreads its own environment.
    await expect(page.getByTestId('why-unavailable')).toHaveCount(0)

    // Cause real reactivity, then refresh the candidate list.
    await page.getByTestId('addon-tab-canvas').click()
    await page.getByTestId('viewport-tablet').click()
    await page.getByTestId('background-dark').click().catch(() => {})
    await page.getByTestId('addon-tab-why').click()
    await page.getByTestId('why-refresh').click()

    // At least one node fired and is offered for explanation.
    const nodes = page.locator('[data-testid^="why-node-"]')
    await expect(nodes.first()).toBeVisible()

    await nodes.first().click()
    await expect(page.getByTestId('why-summary')).toHaveCount(1)
    // The summary must make a real claim — origin or a hop count — not a blank.
    await expect(page.getByTestId('why-summary')).toContainText(/updated because|IS the origin/)
    await expect(page.locator('[data-testid="why-step"]').first()).toBeVisible()
  })
})

/**
 * Pseudo-localization — find truncation without translating anything.
 */
test('pseudo-locale expands and accents every rendered string', async ({ browser }) => {
  const page = await open(browser)
  const preview = page.locator('[data-testid="canvas-preview"]').first()
  const before = ((await preview.textContent()) ?? '').trim()
  expect(before.length, 'preview should render text to stress').toBeGreaterThan(0)

  await page.getByTestId('addon-tab-canvas').click()
  await page.getByTestId('pseudo-locale-toggle').click()

  const after = ((await preview.textContent()) ?? '').trim()
  // Longer — the whole point is exposing a layout that only clips at +40%.
  expect(after.length).toBeGreaterThan(before.length)
  // Accented, so an untransformed (never-i18n'd) string stands out beside it.
  expect(after).toMatch(/[áéíóúćđŕśţẃ]/)
  // Toggling back restores the original, so it is a check and not a one-way door.
  await page.getByTestId('pseudo-locale-toggle').click()
  expect(((await preview.textContent()) ?? '').trim()).toBe(before)
})

/**
 * Perf panel — counters, not timings. Asserts real framework work is recorded
 * for a real interaction; a panel that always shows zero would be
 * indistinguishable from a broken sink.
 */
test('perf panel records framework work for a real interaction', async ({ browser }) => {
  const page = await open(browser)
  await page.getByTestId('addon-tab-perf').click()
  await expect(page.getByTestId('perf-unavailable')).toHaveCount(0)

  await page.getByTestId('perf-toggle').click()
  await expect(page.getByTestId('perf-toggle')).toHaveText(/Stop/i)

  // Drive a real re-render: change a control so the styler + runtime do work.
  await page.getByTestId('addon-tab-controls').click()
  await page.locator('input[placeholder]').first().fill('perf probe')
  await page.getByTestId('addon-tab-perf').click()
  await page.getByTestId('perf-toggle').click()

  await expect(page.getByTestId('perf-summary')).toHaveCount(1)
  const rows = page.locator('[data-testid="perf-row"]')
  await expect(rows.first()).toBeVisible()
  // A named counter with a real count — not an empty verdict dressed as one.
  await expect(page.getByTestId('perf-summary')).toContainText(/[1-9]\d* counter\(s\) fired/)
})

/**
 * Roles — render the scenario as each role sees it.
 *
 * Asserts the DOM actually changes with the role and that the consulted-key
 * list is real, because a panel that merely renders four buttons proves nothing.
 */
test('a hand-catalog play script runs against the live preview, steps logged to Actions', async ({ browser }) => {
  const page = await open(browser, [])
  // Button carries the authored 'Click storm' scenario with a ▶.
  await page.getByTestId('play-button--play-demo').click()
  await page.getByRole('button', { name: 'Actions', exact: true }).click()
  // Each play STEP lands in the Actions ring, then the three clicks the script
  // dispatched land as real onClick events — observation plus behaviour.
  await expect(page.getByText('find the button')).toBeVisible()
  await expect(page.getByText('click it three times')).toBeVisible()
  await expect(page.getByText('Button "Storm target"').first()).toBeVisible()
})

test.describe('Roles panel — permission sets', () => {
  test('a destructive action appears only for a role that may perform it', async ({ browser }) => {
    const page = await open(browser)
    await page.getByRole('button', { name: 'Danger zone' }).click()
    await page.getByTestId('addon-tab-permissions').click()

    // Anonymous is the default: the guarded action must NOT render.
    await page.getByTestId('role-anonymous').click()
    const preview = page.locator('[data-testid="canvas-preview"]')
    await expect(preview).not.toContainText('Delete project')

    // Admin may delete — the same scenario now renders the action.
    await page.getByTestId('role-admin').click()
    await expect(preview).toContainText('Delete project')

    // Viewer may read but not delete: the real bug shape this panel is for.
    await page.getByTestId('role-viewer').click()
    await expect(preview).toContainText('Project visible')
    await expect(preview).not.toContainText('Delete project')
  })

  test('reports the keys the component actually consulted', async ({ browser }) => {
    const page = await open(browser)
    await page.getByRole('button', { name: 'Danger zone' }).click()
    await page.getByTestId('addon-tab-permissions').click()
    await page.getByTestId('role-viewer').click()

    const rows = page.locator('[data-testid="perm-row"]')
    await expect(rows.first()).toBeVisible()
    const text = (await page.getByTestId('perm-summary').textContent()) ?? ''
    // Both keys consulted, one granted and one denied — not a fabricated tally.
    expect(text).toMatch(/2 key\(s\) consulted/)
    expect(text).toMatch(/1 granted/)
    expect(text).toMatch(/1 denied/)
  })

  test('flags a component that never consulted a permission', async ({ browser }) => {
    const page = await open(browser)
    await page.getByTestId('addon-tab-permissions').click()
    // The default Button guards nothing, so switching roles proves nothing
    // about it — the panel has to SAY that rather than show an empty list.
    await expect(page.getByTestId('perm-unguarded')).toBeVisible()
  })
})

/**
 * Data panel — the four query states, without a network.
 *
 * Asserts the PREVIEW changes per state, not just the panel. In particular the
 * refetching case, which hand-written stories routinely model as
 * loading-with-no-data and therefore never exercise.
 */
test('data panel drives all four query states in the preview', async ({ browser }) => {
  const page = await open(browser)
  await page.getByRole('button', { name: 'Project list' }).click()
  await page.getByTestId('addon-tab-data').click()
  const preview = page.locator('[data-testid="canvas-preview"]')

  await page.getByTestId('query-loading').click()
  await expect(preview).toContainText('Loading')
  await expect(preview).not.toContainText('Alpha')

  await page.getByTestId('query-error').click()
  await expect(preview).toContainText('Could not load projects')

  await page.getByTestId('query-success').click()
  await expect(preview).toContainText('Alpha')
  await expect(preview).not.toContainText('Refreshing')

  // The case that matters: stale data STAYS while a request is in flight.
  await page.getByTestId('query-refetching').click()
  await expect(preview).toContainText('Alpha')
  await expect(preview).toContainText('Refreshing')
  // and the panel states why isLoading is false here
  await expect(page.getByTestId('query-note')).toBeVisible()
})

/**
 * Schema panel — controls derived from the schema, and a live verdict.
 *
 * Asserts the derived fields carry the REAL enum members, and that the verdict
 * responds to the actual control values — a panel showing a constant "valid"
 * would be indistinguishable from a broken one.
 */
test('schema panel derives fields and validates the live values', async ({ browser }) => {
  const page = await open(browser)
  await page.getByRole('button', { name: 'Badge' }).click()
  await page.getByTestId('addon-tab-schema').click()

  // Three fields, derived — not hand-listed.
  const fields = page.locator('[data-testid="schema-field"]')
  await expect(fields).toHaveCount(3)
  // The enum carries its real members, which is the drift this removes.
  // Scoped to the variant row: asserting across all three fields is a strict-
  // mode violation, and `.first()` would silently pass on the wrong row.
  await expect(
    page.locator('[data-testid="schema-field"]').filter({ hasText: 'Variant' }),
  ).toContainText('soft | solid | outline')

  // Valid to start.
  await expect(page.getByTestId('schema-verdict')).toContainText('valid')

  // Emptying the label violates `min(1)` — the verdict must follow the values.
  await page.getByTestId('addon-tab-controls').click()
  // Selected by its PLACEHOLDER (the control's default), not `input[placeholder]`
  // — the first such input on the page is the top-bar search box, so the
  // generic selector edits the wrong field and the assertion below would then
  // pass or fail for reasons unrelated to the control.
  // The box now shows the live value, so clearing it is a real edit.
  await page.locator('input[placeholder="New"]').fill('')
  await page.getByTestId('addon-tab-schema').click()
  await expect(page.getByTestId('schema-verdict')).toContainText(/issue\(s\)/)
  await expect(page.locator('[data-testid="schema-issue"]').first()).toContainText('label')
})

test('schema panel says so when a scenario has no schema', async ({ browser }) => {
  const page = await open(browser)
  await page.getByRole('button', { name: 'Project list' }).click()
  await page.getByTestId('addon-tab-schema').click()
  await expect(page.getByTestId('schema-none')).toBeVisible()
})

/**
 * The Controls text input must reflect the LIVE value, not just show the
 * default as a placeholder. It was write-only: type, switch component, come
 * back, and the box was empty while the preview still rendered what you typed.
 */
test('a text control shows the live value and survives a component switch', async ({ browser }) => {
  const page = await open(browser)
  await page.getByRole('button', { name: 'Badge' }).click()
  await page.getByTestId('addon-tab-controls').click()

  const box = page.locator('input[placeholder="New"]')
  // Starts populated with the default the preview is actually rendering.
  await expect(box).toHaveValue('New')

  await box.fill('Shipped')
  await expect(page.locator('[data-testid="canvas-preview"]')).toContainText('Shipped')

  // Switch away and back — the box must still agree with the preview.
  await page.getByRole('button', { name: 'Project list' }).click()
  await page.getByRole('button', { name: 'Badge' }).click()
  await expect(page.locator('input[placeholder="New"]')).toHaveValue('Shipped')
})
