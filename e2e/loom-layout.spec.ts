/**
 * The tool-app layout of `loom dev`, in real Chromium over the real monorepo:
 * the design's breakpoints, no horizontal page scroll at the five audit
 * widths in both themes, real report data in the chrome, keyboard operation,
 * the shared `pyreon-theme` preference, and the loading + scan-error states.
 */
import { expect, test, type Page } from '@playwright/test'
import type { LoomReport } from '../packages/tools/loom/src/core/types'

const WIDTHS = [320, 390, 768, 1024, 1440] as const
const VIEWS = ['graph', 'matrix', 'cycles', 'impact', 'table'] as const

async function open(page: Page, theme?: 'dark' | 'light') {
  if (theme) await page.addInitScript((t) => localStorage.setItem('pyreon-theme', t), theme)
  await page.goto('/')
  await expect(page.getByTestId('loom-shell')).toBeVisible({ timeout: 30_000 })
}

const report = async (page: Page) =>
  (await (await page.request.get('/@loom/report.json')).json()) as LoomReport

for (const theme of ['dark', 'light'] as const) {
  for (const width of WIDTHS) {
    test(`${theme} @ ${width}px: every view fits the width, the theme follows pyreon-theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, theme)
      await expect(page.getByTestId('loom-shell')).toHaveAttribute('data-lm-theme', theme)
      for (const view of VIEWS) {
        // A narrow view switch scrolls sideways inside itself; reach the tab.
        await page.getByTestId(`view-${view}`).scrollIntoViewIfNeeded()
        await page.getByTestId(`view-${view}`).click()
        await expect(page.getByTestId(`view-${view}`)).toHaveAttribute('aria-pressed', 'true')
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        expect(overflow, `${view} overflows by ${overflow}px`).toBeLessThanOrEqual(0)
      }
    })
  }
}

test('the design breakpoints: rail ≤1100, list drawer ≤860, detail drawer ≤760', async ({ page }) => {
  await open(page)
  const width = (id: string) =>
    page.getByTestId(id).evaluate((el) => Math.round(el.getBoundingClientRect().width))

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByTestId('loom-health')).toBeVisible()
  expect(await width('loom-sidebar')).toBe(240)
  expect(await width('loom-panel')).toBe(340)

  await page.setViewportSize({ width: 1024, height: 900 })
  await expect(page.getByTestId('loom-health')).toBeHidden()
  expect(await width('loom-panel')).toBe(290)

  await page.setViewportSize({ width: 800, height: 900 })
  await expect(page.getByTestId('loom-sidebar')).toHaveCount(0)
  await expect(page.getByTestId('nav-toggle')).toBeVisible()
  await expect(page.getByTestId('loom-panel')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('loom-panel')).toHaveCount(0)
  await page.getByTestId('panel-toggle').click()
  await expect(page.getByTestId('loom-panel')).toBeVisible()
  // Escape closes an open drawer.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('loom-panel')).toHaveCount(0)
})

test('the chrome shows the report: workspace, counts, depth groups, blast radius', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  const r = await report(page)
  await expect(page.getByTestId('workspace-name')).toHaveText(r.model.root.name!)
  await expect(page.getByTestId('loom-status')).toContainText(
    `${r.stats.internal} packages · ${r.stats.edges} runtime edges · depth ${r.stats.depth}`,
  )
  // One graph box per internal package — externals live in the matrix.
  await expect(page.locator('[data-testid^="gnode-"]')).toHaveCount(r.model.packages.length)
  // The list's depth groups are the report's depths.
  const depths = [...new Set(Object.values(r.graph.depths))].sort((a, b) => a - b)
  const heads = await page.locator('.lm-pk-g > span:first-child').allTextContents()
  expect(heads.map((h) => h.toLowerCase())).toEqual([...depths.map((d) => `depth ${d}`), 'external'])
  // Selecting a package: the rail's blast number is the report's reach, and
  // the graph lights that many boxes besides the selection.
  await page.getByTestId('pkg-@pyreon/reactivity').click()
  await expect(page.getByTestId('panel-blast')).toHaveText(String(r.graph.reach['@pyreon/reactivity']))
  await expect(page.getByTestId('pkg-@pyreon/reactivity')).toHaveAttribute('aria-current', 'true')
  const lit = await page.locator('.lm-gbox').evaluateAll(
    (els) => els.filter((e) => getComputedStyle(e).strokeOpacity === '0.55').length,
  )
  expect(lit).toBe(r.graph.reach['@pyreon/reactivity'])
})

test('version matrix: drift rows by default, every external on demand', async ({ page }) => {
  await open(page)
  const r = await report(page)
  await page.getByTestId('view-matrix').click()
  const drifting = r.issues.filter((i) => i.code === 'version-drift').length
  const grid = page.getByTestId('version-grid')
  await expect(grid.locator('.lm-vm-rl')).toHaveCount(drifting)
  await page.getByTestId('drift-toggle').click()
  expect(await grid.locator('.lm-vm-rl').count()).toBeGreaterThanOrEqual(r.external.length)
  // Only declared cells exist — never rows × columns.
  const cells = await grid.locator('.lm-vm-c').count()
  // One cell per (package, dependency) — a package declaring it in two
  // fields gets both ranges in one cell.
  const declared = r.external.reduce(
    (n, e) => n + new Set(Object.values(e.ranges).flat().map((u) => u.user)).size,
    0,
  )
  expect(cells).toBeGreaterThanOrEqual(declared)
  expect(cells).toBeLessThan(declared * 2)
})

test('keyboard: the view switch, the graph tab stop, and ↑↓ through the list', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  // View switch: real buttons, Enter activates.
  await page.getByTestId('view-impact').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('impact-view')).toBeVisible()
  await page.getByTestId('view-graph').focus()
  await page.keyboard.press('Enter')
  // The graph has ONE tab stop and it is a real one (a lowercase `tabindex`
  // attribute; Chromium ignores `tabIndex` on SVG, pyreon/pyreon#4466).
  // Nothing is selected on open, so it is the first box.
  const stops = page.locator('[data-testid^="gnode-"][tabindex="0"]')
  await expect(stops).toHaveCount(1)
  const first = (await stops.getAttribute('data-testid'))!.slice('gnode-'.length)
  await stops.focus()
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(`gnode-${first}`)
  // Enter on the focused box selects it; the rail switches to its detail.
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('panel-name')).toHaveText(first)
  // ↓ moves the selection, and the tab stop follows it.
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('panel-name')).not.toHaveText(first)
  const next = await page.getByTestId('panel-name').textContent()
  await expect(stops).toHaveAttribute('data-testid', `gnode-${next}`)
  // Escape returns to the workspace overview.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('panel-overview-body')).toBeVisible()
  // ↑↓ also work from the filter field, over the filtered list.
  await page.getByTestId('pkg-filter').fill('router')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('panel-name')).toContainText('router')
})

test('dev edges are an opt-in layer, drawn without rebuilding the graph', async ({ page }) => {
  await open(page)
  const svg = page.locator('svg.lm-g')
  const handle = await svg.elementHandle()
  await expect(svg).toHaveAttribute('data-dev', 'off')
  await expect(page.locator('.lm-gdevs')).toBeHidden()
  await page.getByTestId('dev-toggle').click()
  await expect(svg).toHaveAttribute('data-dev', 'on')
  await expect(page.getByTestId('graph-legend')).toContainText('dev edge')
  expect(await page.locator('.lm-gdev').count()).toBeGreaterThan(0)
  expect(await svg.evaluate((el, prev) => el === prev, handle)).toBe(true)
})

test('loading: the boot line shows in the theme while the scan runs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pyreon-theme', 'light'))
  let release!: () => void
  const held = new Promise<void>((r) => {
    release = r
  })
  await page.route('**/@loom/report.json', async (route) => {
    await held
    await route.continue()
  })
  await page.goto('/')
  await expect(page.locator('.lm-boot')).toContainText('scanning the workspace')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(
    'rgb(250, 245, 235)',
  )
  release()
  await expect(page.getByTestId('loom-shell')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.lm-boot')).toHaveCount(0)
})

test('a failed scan renders the reason in the theme, with a way to retry', async ({ page }) => {
  await page.route('**/@loom/report.json', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'packages/x/package.json: Unexpected token } in JSON' }),
    }),
  )
  await page.goto('/')
  const err = page.getByTestId('scan-error')
  await expect(err).toBeVisible()
  await expect(err.getByRole('alert')).toContainText('Unexpected token } in JSON')
  await expect(err.getByRole('button', { name: 'Reload' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('manifest: the report excerpt is this scan, and the download is the full report', async ({ page }) => {
  await open(page)
  const r = await report(page)
  await page.getByTestId('view-table').click()
  await expect(page.getByTestId('report-excerpt')).toContainText(`"packages": ${r.stats.internal}`)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('report-download').click(),
  ])
  expect(download.suggestedFilename()).toBe('loom-report.json')
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  const saved = JSON.parse(readFileSync(path, 'utf8')) as LoomReport
  expect(saved.stats).toEqual(r.stats)
})

test('first view: nothing selected, the graph at its start, the workspace overview in the rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  const r = await report(page)
  await expect(page).not.toHaveURL(/#/)
  await expect(page.getByTestId('panel-name')).toHaveCount(0)
  await expect(page.locator('.lm-pk[aria-current="true"]')).toHaveCount(0)
  expect(await page.getByTestId('loom-canvas').evaluate((el) => el.scrollLeft)).toBe(0)
  // The overview is the report.
  await expect(page.getByTestId('overview-name')).toHaveText(r.model.root.name!)
  await expect(page.getByTestId('overview-stats')).toContainText(String(r.stats.internal))
  await expect(page.getByTestId('overview-stats')).toContainText(String(r.stats.edges))
  await expect(page.getByTestId('overview-error')).toContainText(String(r.stats.errors))
  await expect(page.getByTestId('overview-info')).toContainText(String(r.stats.infos))
  await expect(page.getByTestId('overview-cycles')).toContainText(String(r.stats.cycles))
  await expect(page.getByTestId('overview-gate')).toHaveText(`exit ${r.gate!.exit}`)
  // Top 5 by blast radius, platform binaries ranked under their parent.
  const top = page.getByTestId('overview-top').locator('button')
  await expect(top).toHaveCount(5)
  expect((await top.allTextContents()).join(' ')).not.toMatch(/compiler-(darwin|linux|win32)/)
  // A row is a way in: it selects the package.
  const firstTitle = (await top.first().getAttribute('title'))!.split(' ')[0]!
  await top.first().click()
  await expect(page.getByTestId('panel-name')).toHaveText(firstTitle)
  await page.getByTestId('panel-overview').click()
  await expect(page.getByTestId('panel-overview-body')).toBeVisible()
})

test('graph box labels: cut at the end, the full id in the tooltip and the accessible name', async ({ page }) => {
  await open(page)
  const box = page.getByTestId('gnode-@pyreon/compiler-darwin-arm64')
  await expect(box.locator('.lm-glabel')).toHaveText('compiler-darwin-arm64')
  await expect(box.locator('title')).toHaveText('@pyreon/compiler-darwin-arm64')
  await expect(box).toHaveAttribute('aria-label', /^@pyreon\/compiler-darwin-arm64,/)
  // The longest names: the readable start survives, never a middle cut.
  const labels = await page.locator('.lm-glabel').allTextContents()
  expect(labels.filter((l) => l.includes('…')).every((l) => l.endsWith('…'))).toBe(true)
})
