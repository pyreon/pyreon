import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'

/**
 * Atlas v2 app shell — real Chromium against the workshop example.
 *
 * What happy-dom cannot see: the catalog drawer's focus management at a real
 * phone width, the theme flipping CSS custom properties before first paint,
 * horizontal overflow at the five audit widths, and computed text contrast
 * against the colour a pixel really sits on. Each panel is also opened on the
 * component that gives it real data, and asserted on that data.
 *
 * CI: `bun run test:e2e:atlas` (the atlas-workshop config runs this file too).
 */

const isNoise = (t: string): boolean =>
  /Outdated Optimize Dep|ERR_ABORTED|\b504\b|Failed to load resource/.test(t)

async function open(
  browser: Browser,
  opts: { theme?: 'light' | 'dark'; width?: number; path?: string } = {},
): Promise<{ page: Page; ctx: BrowserContext; errors: string[] }> {
  const errors: string[] = []
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1440, height: 900 } })
  // Seed the preference once — a reload must see what the page itself wrote.
  if (opts.theme) {
    await ctx.addInitScript((t) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1')
        localStorage.setItem('pyreon-theme', t)
      }
    }, opts.theme)
  }
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' && !isNoise(m.text())) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(opts.path ?? '/', { waitUntil: 'networkidle' })
  await expect(page.getByTestId('atlas-shell')).toBeVisible()
  return { page, ctx, errors }
}

const rootTheme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'))
const shellBg = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="atlas-shell"]')!).backgroundColor)

test.describe('the v2 shell', () => {
  test('top bar, catalog, scenario strip, canvas and panels — in that order, no errors', async ({ browser }) => {
    const { page, errors } = await open(browser)
    const geo = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
      return {
        bar: r('header').height,
        catalog: r('[data-testid="catalog"]').width,
        strip: r('[data-testid="scenario-strip"]').height,
        stripTop: r('[data-testid="scenario-strip"]').top,
        canvasTop: r('[data-testid="canvas-stage"]').top,
        panelTop: r('[data-testid="addon-panel"]').top,
      }
    })
    expect(geo.bar).toBe(48)
    expect(geo.catalog).toBe(220)
    expect(geo.strip).toBe(40)
    expect(geo.stripTop).toBeLessThan(geo.canvasTop)
    expect(geo.canvasTop).toBeLessThan(geo.panelTop)
    // Thirteen panel tabs, in the design's order.
    await expect(page.locator('[data-testid^="addon-tab-"]')).toHaveText([
      'Controls', 'Schema', 'Actions', 'A11y', 'Perf', 'Permissions', 'Query', 'Store',
      'Update cause', 'Reactive coverage', 'Lens', 'Canvas', 'Addons',
    ])
    expect(errors).toEqual([])
  })

  test('panel tabs, view tabs and scenario tabs are keyboard operable', async ({ browser }) => {
    const { page } = await open(browser)
    await page.getByTestId('addon-tab-controls').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('addon-tab-schema')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('addon-tab-schema')).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByTestId('addon-tab-addons')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowRight') // wraps
    await expect(page.getByTestId('addon-tab-controls')).toHaveAttribute('aria-selected', 'true')
    // Only the selected tab is in the Tab order.
    await expect(page.locator('[data-testid^="addon-tab-"][tabindex="0"]')).toHaveCount(1)

    await page.getByTestId('view-canvas').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('view-docs')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('view-canvas')).toHaveAttribute('aria-selected', 'true')

    // Button's scenario strip: the authored scenario is a tab; ←/→ select.
    const tab = page.getByTestId('scenario-button--play-demo')
    await tab.focus()
    await page.keyboard.press('Home')
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('scenario-verdict')).toBeVisible()
  })

  test('the panel split is a keyboard-operable separator', async ({ browser }) => {
    const { page } = await open(browser)
    const handle = page.getByTestId('resize-panel')
    const before = Number(await handle.getAttribute('aria-valuenow'))
    await handle.focus()
    await page.keyboard.press('ArrowUp')
    await expect.poll(async () => Number(await handle.getAttribute('aria-valuenow'))).toBe(before + 4)
    await page.keyboard.press('ArrowDown')
    await expect.poll(async () => Number(await handle.getAttribute('aria-valuenow'))).toBe(before)
  })
})

test.describe('the catalog drawer below 860px', () => {
  test('opens as a modal, traps Tab, closes on Escape and returns focus', async ({ browser }) => {
    const { page, errors } = await open(browser, { width: 390 })
    await expect(page.getByTestId('catalog')).toHaveCount(0)
    const toggle = page.getByTestId('toggle-drawer')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    const drawer = page.getByTestId('sidebar-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer).toHaveAttribute('role', 'dialog')
    await expect(drawer).toHaveAttribute('aria-modal', 'true')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Focus moved in.
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="sidebar-drawer"]'))).toBe(true)
    // Tab never leaves it.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="sidebar-drawer"]'))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(toggle).toBeFocused()

    // Choosing a component is navigation: the drawer closes, the canvas follows.
    await toggle.click()
    await page.getByTestId('component-badge').click()
    await expect(drawer).toHaveCount(0)
    await expect(page.getByTestId('canvas')).toHaveAttribute('aria-label', 'Badge preview')
    expect(errors).toEqual([])
  })

  test('the scrim closes it', async ({ browser }) => {
    const { page } = await open(browser, { width: 768 })
    await page.getByTestId('toggle-drawer').click()
    await page.getByTestId('drawer-scrim').click({ position: { x: 700, y: 400 } })
    await expect(page.getByTestId('sidebar-drawer')).toHaveCount(0)
  })

  test('at 1024px the catalog is a column again', async ({ browser }) => {
    const { page } = await open(browser, { width: 1024 })
    await expect(page.getByTestId('catalog')).toBeVisible()
    await expect(page.getByTestId('toggle-drawer')).toHaveCount(0)
  })
})

test.describe('theme — the shared pyreon-theme preference', () => {
  test('the stored preference is on the root before the app boots', async ({ browser }) => {
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext()
      await ctx.addInitScript((t) => localStorage.setItem('pyreon-theme', t), theme)
      const page = await ctx.newPage()
      // Read the attribute at DOMContentLoaded — before any module ran.
      const early = page.waitForEvent('domcontentloaded').then(() => rootTheme(page))
      await page.goto('/')
      expect(await early).toBe(theme)
      await ctx.close()
    }
  })

  test('the OS preference decides when nothing is stored', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' })
    const page = await ctx.newPage()
    await page.goto('/', { waitUntil: 'networkidle' })
    expect(await rootTheme(page)).toBe('light')
    await ctx.close()
  })

  test('the toggle flips the chrome, persists, and survives a reload', async ({ browser }) => {
    const { page } = await open(browser, { theme: 'dark' })
    const dark = await shellBg(page)
    expect(dark).toBe('rgb(10, 10, 14)')
    await page.getByTestId('theme-toggle').click()
    await expect.poll(() => shellBg(page)).toBe('rgb(250, 245, 235)')
    expect(await rootTheme(page)).toBe('light')
    expect(await page.evaluate(() => localStorage.getItem('pyreon-theme'))).toBe('light')
    await page.reload({ waitUntil: 'networkidle' })
    expect(await shellBg(page)).toBe('rgb(250, 245, 235)')
  })

  test('another tab’s choice is picked up live', async ({ browser }) => {
    const { page, ctx } = await open(browser, { theme: 'dark' })
    const other = await ctx.newPage()
    await other.goto('/', { waitUntil: 'networkidle' })
    await other.getByTestId('theme-toggle').click()
    await expect.poll(() => rootTheme(page)).toBe('light')
  })
})

test.describe('?embed — the bare app for an iframe', () => {
  test('renders the app, keeps the flag, writes nothing, and takes the host’s mode', async ({ browser }) => {
    const { page, errors } = await open(browser, { theme: 'dark', path: '/?embed&dark=0' })
    await expect(page.getByTestId('atlas-shell')).toHaveAttribute('data-embed', 'true')
    await expect(page.getByTestId('catalog')).toBeVisible()
    // The host owns the theme: no toggle, and the link's mode applies.
    await expect(page.getByTestId('theme-toggle')).toHaveCount(0)
    expect(await rootTheme(page)).toBe('light')
    // Navigating keeps `embed` in the URL, so a reload stays embedded.
    await page.getByTestId('component-badge').click()
    await expect.poll(() => page.evaluate(() => new URLSearchParams(location.search).get('embed'))).toBe('1')
    // A guest leaves the host's storage alone.
    expect(await page.evaluate(() => localStorage.getItem('atlas:prefs'))).toBeNull()
    expect(await page.evaluate(() => localStorage.getItem('pyreon-theme'))).toBe('dark')
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByTestId('atlas-shell')).toHaveAttribute('data-embed', 'true')
    expect(errors).toEqual([])
  })

  test('works inside an iframe', async ({ browser }) => {
    const { page } = await open(browser)
    await page.setContent(
      `<iframe src="${new URL('/?embed', page.url()).href}" style="width:1000px;height:700px;border:0"></iframe>`,
    )
    const frame = page.frameLocator('iframe')
    await expect(frame.getByTestId('atlas-shell')).toBeVisible({ timeout: 20_000 })
    await expect(frame.getByTestId('atlas-shell')).toHaveAttribute('data-embed', 'true')
  })
})

/**
 * The audit bar: no horizontal page overflow at 320 / 390 / 768 / 1024 / 1440,
 * and every chrome text node at ≥ 4.5:1 against the colour it sits on, in
 * both themes. The preview surface (the user's component) is excluded — its
 * colours are the component's, not Atlas's.
 */
const WIDTHS = [320, 390, 768, 1024, 1440]

async function contrastFailures(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const parse = (c: string): number[] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number)
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]
    }
    const lum = (c: number[]) => {
      const f = (x: number) => {
        const v = x / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!)
    }
    const over = (top: number[], bottom: number[]) => {
      const a = top[3]!
      return [0, 1, 2].map((i) => top[i]! * a + bottom[i]! * (1 - a)).concat(1)
    }
    // The effective background: composite every translucent layer up to an
    // opaque one (the page background at the end).
    const bgOf = (el: Element | null): number[] => {
      const layers: number[][] = []
      for (let n = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor)
        if (c && c[3]! > 0) {
          layers.push(c)
          if (c[3] === 1) break
        }
      }
      let acc = parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1]
      if (acc[3]! < 1) acc = [255, 255, 255, 1]
      for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i]!, acc)
      return acc
    }
    const out: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = t.textContent?.trim()
      const el = t.parentElement
      if (!text || !el) continue
      if (el.closest('[data-testid="canvas-preview"],[data-testid^="lab-tile"],[data-testid^="role-mini-"],svg,script,style')) continue
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
      if (el.closest('[aria-hidden="true"]') || cs.clip === 'rect(0px, 0px, 0px, 0px)') continue
      const bg = bgOf(el)
      let fg = parse(cs.color)!
      if (fg[3]! < 1) fg = over(fg, bg)
      const [a, b] = [lum(fg), lum(bg)]
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      if (ratio < 4.5) out.push(`${ratio.toFixed(2)} "${text.slice(0, 40)}" (${cs.color} on rgb(${bg.slice(0, 3).map(Math.round).join(',')}))`)
    }
    return out
  })
}

test.describe('the audit bar', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`${theme}: no horizontal overflow and AA text contrast at every width`, async ({ browser }) => {
      test.setTimeout(120_000)
      for (const width of WIDTHS) {
        const { page, ctx } = await open(browser, { theme, width })
        for (const panel of ['controls', 'a11y', 'permissions', 'addons']) {
          await page.getByTestId(`addon-tab-${panel}`).click()
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          expect(overflow, `${theme} @${width} ${panel}: horizontal overflow`).toBeLessThanOrEqual(0)
          expect(await contrastFailures(page), `${theme} @${width} ${panel}`).toEqual([])
        }
        await ctx.close()
      }
    })
  }
})

test.describe('reduced motion', () => {
  test('animations and transitions collapse to nothing', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 800 } })
    const page = await ctx.newPage()
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByTestId('toggle-drawer').click()
    const d = await page
      .getByTestId('sidebar-drawer')
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).animationDuration))
    expect(d).toBeLessThan(0.001)
    await ctx.close()
  })
})

test.describe('every panel renders its real data', () => {
  test('Controls → the preview', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=controls' })
    await page.getByPlaceholder('Get started').fill('From controls')
    await expect(page.locator('[data-testid="canvas-preview"] button')).toHaveText('From controls')
  })

  test('Schema → the declared fields and a live verdict', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=badge&p=schema' })
    await expect(page.locator('[data-testid="schema-field"]').first()).toBeVisible()
    await expect(page.getByTestId('schema-verdict')).toContainText('valid')
  })

  test('Actions → a real click lands in the log', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=actions' })
    await page.locator('[data-testid="canvas-preview"] button').click()
    await expect(page.getByText('onClick', { exact: true })).toBeVisible()
  })

  test('A11y → the probed checks, counted in the headline', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=a11y' })
    await expect(page.getByTestId('a11y-passing')).toContainText(/\d+\s*passing/i)
    await expect(page.locator('[data-testid^="a11y-row-"]').first()).toBeVisible()
  })

  test('Perf → counters from a recorded interaction', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=perf' })
    await page.getByTestId('perf-toggle').click()
    await page.getByTestId('addon-tab-controls').click()
    await page.getByPlaceholder('Get started').fill('perf probe')
    await page.getByTestId('addon-tab-perf').click()
    await page.getByTestId('perf-toggle').click()
    await expect(page.locator('[data-testid="perf-row"]').first()).toBeVisible()
  })

  test('Permissions → the keys each role\'s render consulted', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=danger-zone&p=permissions' })
    await expect(page.getByTestId('role-keys-viewer')).toHaveText('posts.read ✓ · posts.delete ✗')
  })

  test('Query → each state re-renders the component', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=project-list&p=data' })
    const preview = page.getByTestId('canvas-preview')
    await page.getByTestId('query-error').click()
    const errorText = await preview.innerText()
    await page.getByTestId('query-success').click()
    await expect.poll(() => preview.innerText()).not.toBe(errorText)
  })

  test('Store → says whether a store is loaded, never fakes a timeline', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=store' })
    await expect(
      page.getByTestId('store-unavailable').or(page.getByTestId('store-toggle')),
    ).toBeVisible()
  })

  test('Update cause → the chain behind a real update', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=toggle&p=why' })
    await page.locator('[data-testid="canvas-preview"] label').first().click()
    await page.getByTestId('why-refresh').click()
    await page.locator('[data-testid^="why-node-"]').first().click()
    await expect(page.getByTestId('why-summary')).toBeVisible()
  })

  test('Reactive coverage → a recorded session over a real graph', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=toggle&p=reactivity' })
    await page.getByTestId('coverage-toggle').click()
    await page.locator('[data-testid="canvas-preview"] label').first().click()
    await page.getByTestId('coverage-toggle').click()
    await expect(page.getByTestId('coverage-summary')).toContainText(/\d+\/[1-9]\d* of this component's reactive bindings fired/)
  })

  test('Lens → answers or says why it cannot (no dev server RPC under plain Vite)', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=lens' })
    await page.getByTestId('lens-analyse').click()
    await expect(
      page
        .getByTestId('lens-unavailable')
        .or(page.getByTestId('lens-clean'))
        .or(page.locator('[data-testid="lens-line"]').first()),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('Canvas → zoom, grid and measure act on the stage', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=canvas' })
    await page.getByTestId('grid-toggle').click()
    await expect(page.getByTestId('canvas-stage')).toHaveAttribute('data-grid', 'off')
    await page.getByTestId('zoom-200').click()
    await expect
      .poll(() => page.getByTestId('canvas-preview').evaluate((el) => getComputedStyle(el).transform))
      .toMatch(/matrix\(2/)
    await page.getByTestId('measure-toggle').click()
    await page.locator('[data-testid="canvas-preview"] button').hover()
    await expect(page.getByTestId('measure-label')).toBeVisible()
  })

  test('Addons → viewport, background, brand and locale reach the preview', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=addons' })
    await page.getByTestId('viewport-mobile').click()
    await expect(page.getByTestId('canvas-meta')).toContainText('375px')
    // The checker is a real conic-gradient grid, not a plain surface.
    await page.getByTestId('background-checker').click()
    await expect
      .poll(() => page.getByTestId('canvas-preview').evaluate((el) => getComputedStyle(el).backgroundImage))
      .toContain('conic-gradient')
    await page.getByTestId('brand-forest').click()
    await expect(page.getByTestId('canvas-meta')).toContainText('Forest')
    await page.getByTestId('locale-ar').click()
    await expect
      .poll(() => page.getByTestId('canvas-preview').evaluate((el) => getComputedStyle(el).direction))
      .toBe('rtl')
  })
})

/**
 * The design parts #4440 left out for want of a data source: the stage
 * layout, every role side by side with a policy verdict, each control's
 * provenance, and the coverage % bar. (The Lens "Fix:" line and "added N min
 * ago" need `atlas dev` — they are in `atlas-dev.spec.ts`.)
 *
 * Each part: real data, keyboard operable, no horizontal scroll at the five
 * audit widths, inside the drawer layout below 860px and under `?embed`.
 */
test.describe('the #4440 parts', () => {
  const box = (page: Page, sel: string) =>
    page.locator(sel).first().evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })

  test('Canvas → Layout moves the component and travels in the link', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=input&p=canvas' })
    const child = '[data-testid="canvas-preview"] > *'
    const centered = await box(page, child)
    const surface0 = await box(page, '[data-testid="canvas-preview"]')
    // Centered: the component sits in the middle of the surface.
    expect(Math.abs(centered.x + centered.w / 2 - (surface0.x + surface0.w / 2))).toBeLessThan(2)

    // Keyboard: focus the option and press Space.
    await page.getByTestId('layout-padded').focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('layout-padded')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => page.evaluate(() => location.search)).toContain('layout=padded')
    const surface = await box(page, '[data-testid="canvas-preview"]')
    const padded = await box(page, child)
    // Top-left, inside a 16px gutter (+1px surface edge).
    expect(padded.x - surface.x).toBeLessThanOrEqual(18)
    expect(padded.y - surface.y).toBeLessThanOrEqual(18)

    await page.getByTestId('layout-fullscreen').click()
    // Fullscreen: the surface fills the stage edge to edge.
    const stage = await box(page, '[data-testid="canvas-stage"]')
    await expect.poll(async () => (await box(page, '[data-testid="canvas-preview"]')).h).toBeGreaterThan(stage.h - 2)
    const full = await box(page, '[data-testid="canvas-preview"]')
    expect(Math.abs(full.x - stage.x)).toBeLessThan(2)
    expect(Math.abs(full.w - stage.w)).toBeLessThan(2)

    // A reload keeps it — the link carries the layout.
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByTestId('canvas-stage')).toHaveAttribute('data-layout', 'fullscreen')
  })

  test('Permissions → every role side by side, the missing guard flagged by policy', async ({ browser }) => {
    const { page, errors } = await open(browser, { path: '/?c=row-actions&p=permissions' })
    // Row actions guards Edit and forgets Delete: every role but admin is a
    // violation, named with the policy that withholds it.
    for (const id of ['anonymous', 'viewer', 'editor']) {
      await expect(page.getByTestId(`role-card-${id}`)).toHaveAttribute('data-verdict', 'violation')
      await expect(page.getByTestId(`role-verdict-${id}`)).toContainText(
        `"Delete" rendered for ${id} with no can() check · policy: admin only`,
      )
    }
    await expect(page.getByTestId('role-card-admin')).toHaveAttribute('data-verdict', 'ok')
    await expect(page.getByTestId('role-verdict-admin')).toContainText('matches policy')
    // Each card is the REAL render under that role: Edit only where granted.
    await expect(page.getByTestId('role-mini-viewer')).not.toContainText('Edit')
    await expect(page.getByTestId('role-mini-editor')).toContainText('Edit')
    // The violation card is the red one.
    const border = await page
      .getByTestId('role-card-viewer')
      .evaluate((el) => getComputedStyle(el).borderTopColor)
    const okBorder = await page.getByTestId('role-card-admin').evaluate((el) => getComputedStyle(el).borderTopColor)
    expect(border).not.toBe(okBorder)
    // The minis are pictures: nothing inside them takes focus.
    await expect(page.getByTestId('role-mini-admin')).toHaveAttribute('inert', '')

    // Keyboard: a role chip renders the CANVAS under that role.
    await page.getByTestId('role-admin').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('role-admin')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('canvas-preview')).toContainText('Edit')
    await expect.poll(() => page.evaluate(() => location.search)).toContain('role=admin')
    expect(errors).toEqual([])
  })

  test('Schema → each control names its source', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=schema' })
    await expect(page.locator('[data-testid="schema-field"]').first()).toBeVisible()
    await expect(page.locator('[data-testid="schema-source"]').first()).toHaveText('catalog')
    // A real <table>, with column headers for assistive tech.
    await expect(page.getByRole('columnheader', { name: 'source' })).toBeVisible()
  })

  test('Reactive coverage → the % bar is the recorded percentage', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=toggle&p=reactivity' })
    await page.getByTestId('coverage-toggle').click()
    await page.locator('[data-testid="canvas-preview"] label').first().click()
    await page.getByTestId('coverage-toggle').click()
    const pct = Number.parseFloat((await page.getByTestId('coverage-percent').textContent()) ?? '')
    expect(Number.isFinite(pct)).toBe(true)
    // The same rows' denominator, stated in the caption and the stats.
    await expect(page.getByTestId('coverage-head')).toContainText(/\d+\/[1-9]\d* of this component's reactive bindings fired/)
    const rows = await page.getByTestId('binding-row').count()
    const covered = await page.locator('[data-testid="binding-row"][data-status="covered"]').count()
    expect(pct).toBe(Math.round((covered / rows) * 100))
    // The fill's width IS that percentage of the track.
    await expect
      .poll(() => page.getByTestId('coverage-fill').evaluate((el) => (el as HTMLElement).style.width))
      .toBe(`${pct}%`)
    // Polled: the fill animates to its width.
    await expect
      .poll(async () => {
        const [fill, track] = await Promise.all([
          box(page, '[data-testid="coverage-fill"]'),
          box(page, '[data-testid="coverage-bar"]'),
        ])
        return Math.abs(fill.w - (track.w * pct) / 100) < 1.5
      })
      .toBe(true)
  })

  const PARTS = [
    { name: 'layout', path: '/?c=input&p=canvas&layout=fullscreen' },
    { name: 'permissions', path: '/?c=row-actions&p=permissions' },
    { name: 'schema', path: '/?c=badge&p=schema' },
  ]

  for (const theme of ['dark', 'light'] as const) {
    test(`${theme}: the new parts — no horizontal overflow, AA chrome text, drawer below 860, ?embed`, async ({
      browser,
    }) => {
      test.setTimeout(180_000)
      for (const width of WIDTHS) {
        for (const part of PARTS) {
          for (const embed of [false, true]) {
            const path = embed ? `${part.path}&embed` : part.path
            const { page, ctx } = await open(browser, { theme, width, path })
            const where = `${theme} @${width} ${part.name}${embed ? ' ?embed' : ''}`
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            )
            expect(overflow, `${where}: horizontal overflow`).toBeLessThanOrEqual(0)
            expect(await contrastFailures(page), where).toEqual([])
            if (embed) await expect(page.getByTestId('atlas-shell')).toHaveAttribute('data-embed', 'true')
            // Below 860 the catalog is a drawer: closed, behind its toggle.
            if (width < 860) {
              await expect(page.getByTestId('toggle-drawer')).toBeVisible()
              await expect(page.getByTestId('sidebar-drawer')).toBeHidden()
            }
            await ctx.close()
          }
        }
      }
    })
  }
})

/**
 * Reactive coverage → named bindings (#4440). The rows are the component's
 * real DOM bindings, read from the dev reactive graph; a control edit updates
 * the mounted component IN PLACE (it used to re-mount it, so every binding
 * only ever ran at mount and the panel read 0%).
 */
test.describe('Reactive coverage → named bindings', () => {
  const row = (page: Page, name: string) =>
    page.getByTestId('binding-row').filter({ has: page.getByTestId('binding-name').getByText(name, { exact: true }) })

  test('a binding is listed uncovered, then covered once the control that drives it changes', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=reactivity' })
    await page.getByTestId('coverage-toggle').click()

    const text = row(page, 'text ← label')
    await expect(text).toHaveAttribute('data-status', 'never')
    await expect(text.getByTestId('binding-fires')).toHaveText('0')
    await expect(text.getByTestId('binding-status')).toHaveText(/○\s*never fired/)
    await expect(text.getByTestId('binding-hint')).toHaveText('Change “Label” in Controls to exercise it.')
    // The class binding names the controls it reads (through the styler) and
    // the element it writes — a rocketstyle component's tag is a component,
    // so the element is named when its ref attaches.
    const cls = row(page, 'class ← variant, size, mode, theme')
    await expect(cls).toHaveCount(1)
    await expect(cls.getByTestId('binding-element')).toHaveText('<button>')

    // Mark the rendered element: an in-place update keeps it, a re-mount would not.
    await page.locator('[data-testid="canvas-preview"] button').evaluate((el) => {
      ;(el as HTMLElement & { __probe?: number }).__probe = 1
    })
    await page.getByTestId('addon-tab-controls').click()
    await page.locator('#addon-panel-controls input[placeholder]').first().fill('Saved')
    await expect(page.locator('[data-testid="canvas-preview"] button')).toHaveText('Saved')
    expect(
      await page
        .locator('[data-testid="canvas-preview"] button')
        .evaluate((el) => (el as HTMLElement & { __probe?: number }).__probe),
    ).toBe(1)
    await page.getByTestId('addon-tab-reactivity').click()

    await expect(text).toHaveAttribute('data-status', 'covered')
    await expect(text.getByTestId('binding-fires')).toHaveText('1')
    await expect(text.getByTestId('binding-status')).toHaveText(/✓\s*covered/)
    await expect(text.getByTestId('binding-hint')).toHaveCount(0)
    // Uncovered rows lead: the first row is not the one that just fired.
    await expect(page.getByTestId('binding-row').first()).toHaveAttribute('data-status', 'never')
  })

  test('the list follows interaction with the preview while recording', async ({ browser }) => {
    // Toggle's render reads `on` itself, so a click re-mounts the preview —
    // but its own `on` bindings are notified first, so they really fired.
    const { page } = await open(browser, { path: '/?c=toggle&p=reactivity' })
    await page.getByTestId('coverage-toggle').click()
    const track = row(page, 'class ← on, mode, theme').first()
    await expect(track).toHaveAttribute('data-status', 'never')
    await page.locator('[data-testid="canvas-preview"] label span').first().click()
    await expect(track).toHaveAttribute('data-status', 'covered')
    await expect(track).toContainText('2 mounts')
  })

  test('keyboard: Record / Stop and the node disclosure are operable without a pointer', async ({ browser }) => {
    const { page } = await open(browser, { path: '/?c=button&p=reactivity' })
    const toggle = page.getByTestId('coverage-toggle')
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('binding-row').first()).toBeVisible()
    const summary = page.locator('[data-testid="coverage-others"] summary')
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-testid="coverage-others"] details')).toHaveAttribute('open', '')
    await toggle.focus()
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    // Stopped: the reading stays on screen, frozen.
    await expect(page.getByTestId('binding-row').first()).toBeVisible()
  })

  for (const theme of ['dark', 'light'] as const) {
    test(`${theme}: the bindings table — no horizontal overflow and AA chrome text at every width`, async ({
      browser,
    }) => {
      test.setTimeout(120_000)
      for (const width of WIDTHS) {
        const { page, ctx } = await open(browser, { theme, width, path: '/?c=button&p=reactivity' })
        await page.getByTestId('coverage-toggle').click()
        await expect(page.getByTestId('binding-row').first()).toBeVisible()
        const where = `${theme} @${width} reactive coverage`
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, `${where}: horizontal overflow`).toBeLessThanOrEqual(0)
        expect(await contrastFailures(page), where).toEqual([])
        await ctx.close()
      }
    })
  }
})
