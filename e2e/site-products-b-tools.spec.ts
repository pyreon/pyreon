import { expect, type Locator, type Page, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { waitForIslands } from './site-islands'

/**
 * Interaction for the six tool demos (ai, atlas, lathe, loom, tooling,
 * migrate) in real Chromium against the production build: each is operated
 * by keyboard AND by pointer, the visible result is asserted, and so is the
 * label that says where the text came from. Plus: reduced motion shows a
 * replay at once, and the SSG HTML already holds each demo's full output.
 * Page-level checks (hydration, widths, contrast, heavy timing) are in
 * site-products-b.spec.ts.
 */
test.use({ viewport: { width: 1440, height: 900 } })

const demo = (page: Page) => page.locator('#demo')

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`/products/${id}`)
  await waitForIslands(page)
  await demo(page).scrollIntoViewIfNeeded()
}

/**
 * Islands hydrate when they near the viewport, and an action on the server
 * DOM before that is swallowed: retry the action until its effect shows.
 */
async function until(action: () => Promise<void>, check: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await action()
    await check()
  }).toPass({ timeout: 15_000 })
}

const press = (page: Page, target: Locator, key = 'Enter') => async () => {
  await target.focus()
  await page.keyboard.press(key)
}

/** Click a toggle only while it is still off, so a retry never flips it back. */
const turnOn = (target: Locator, act: () => Promise<void>) => async () => {
  if ((await target.getAttribute('aria-pressed')) !== 'true') await act()
}

const log = (page: Page) => demo(page).locator('section[aria-label]').last()
const showAll = (page: Page) => demo(page).getByRole('button', { name: 'Show all', exact: true })

test.describe('ai', () => {
  test('pointer: a question replays its real validate output; Show all completes it', async ({ page }) => {
    await open(page, 'ai')
    const q = demo(page).getByRole('button', { name: 'Is this list right?' })
    await until(() => q.click(), () => expect(q).toHaveAttribute('aria-pressed', 'true'))
    await showAll(page).click()
    await expect(demo(page).locator('[data-pending]')).toHaveCount(0)
    await expect(log(page)).toContainText('→ validate({ filename: "TodoList.tsx", code })')
    await expect(log(page)).toContainText('1. **array-map-jsx** (line 4)')
    await expect(demo(page).getByText('simulated conversation, real tool output')).toBeVisible()
  })

  test('keyboard: Enter on a question and Space on Show all', async ({ page }) => {
    await open(page, 'ai')
    const q = demo(page).getByRole('button', { name: 'How do I write to a signal?' })
    await until(press(page, q), () => expect(q).toHaveAttribute('aria-pressed', 'true'))
    await showAll(page).focus()
    await page.keyboard.press('Space')
    await expect(demo(page).locator('[data-pending]')).toHaveCount(0)
    await expect(log(page)).toContainText('## @pyreon/reactivity — signal')
  })
})

test.describe('atlas', () => {
  test('the workbench loads only after scrolling, from this origin only', async ({ page }) => {
    const urls: string[] = []
    page.on('request', (r) => urls.push(r.url()))
    await page.goto('/products/atlas')
    await waitForIslands(page)
    await page.waitForTimeout(1500)
    expect(urls.filter((u) => u.includes('/demos/atlas/'))).toEqual([])
    await demo(page).scrollIntoViewIfNeeded()
    await expect(demo(page).locator('iframe')).toHaveCount(1, { timeout: 15_000 })
    const frame = page.frameLocator('#demo iframe')
    await expect(frame.getByText('Empty', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
    expect(urls.some((u) => u.includes('/demos/atlas/assets/'))).toBe(true)
    expect(urls.filter((u) => !/^(https?:\/\/(localhost|127\.0\.0\.1)[:/]|data:|blob:|about:)/.test(u))).toEqual([])
    await expect(demo(page).getByText('real workbench')).toBeVisible()
  })

  test('pointer and keyboard: Button → Empty names the missing accessible name', async ({ page }) => {
    await open(page, 'atlas')
    const frame = page.frameLocator('#demo iframe')
    const empty = frame.getByText('Empty', { exact: true }).first()
    await expect(empty).toBeVisible({ timeout: 20_000 })
    await empty.click()
    // Keyboard: focus the A11y tab and activate it with Enter.
    const tab = frame.getByRole('tab', { name: 'A11y' }).or(frame.getByText('A11y', { exact: true })).first()
    await tab.focus()
    await page.keyboard.press('Enter')
    await expect(frame.getByText('interactive element with no name', { exact: false })).toBeVisible()
  })
})

test.describe('lathe', () => {
  const count = (page: Page) => demo(page).locator('p[aria-live]')
  const toggle = (page: Page, name: string) => demo(page).getByRole('button', { name: new RegExp(`^${name}\\b`) })

  test('pointer: queries alone is 17 files, all ten plugins are 29', async ({ page }) => {
    await open(page, 'lathe')
    await expect(count(page)).toHaveText('17 files')
    const types = toggle(page, 'types')
    await until(turnOn(types, () => types.click()), () => expect(count(page)).toHaveText('18 files'))
    for (const p of ['schemas', 'client', 'mocks', 'faker', 'components', 'atlas', 'docs', 'mcp']) await toggle(page, p).click()
    await expect(count(page)).toHaveText('29 files')
    await showAll(page).click()
    await expect(log(page)).toContainText('29 of 29 file(s) written')
    await expect(demo(page).getByText(/^real output, replayed/)).toBeVisible()
  })

  test('keyboard: atlas pulls in its dependencies and says so', async ({ page }) => {
    await open(page, 'lathe')
    await until(turnOn(toggle(page, 'atlas'), press(page, toggle(page, 'atlas'))), () => expect(toggle(page, 'atlas')).toHaveAttribute('aria-pressed', 'true'))
    await expect(count(page)).toHaveText('22 files')
    await showAll(page).focus()
    await page.keyboard.press('Enter')
    await expect(log(page)).toContainText('plugins: queries, atlas (+schemas, +client, +components, +mocks - required by them)')
  })
})

test.describe('loom', () => {
  const view = (page: Page, name: string) => demo(page).getByRole('button', { name, exact: true })

  test('pointer: packages, matrix and cycles views', async ({ page }) => {
    await open(page, 'loom')
    const forms = demo(page).getByRole('button', { name: 'forms', exact: true })
    await until(() => forms.click(), () => expect(demo(page).getByRole('heading', { name: '@acme/forms' })).toBeVisible())
    await expect(demo(page)).toContainText('4 packages depend on it, directly or through others.')
    await view(page, 'matrix').click()
    await expect(demo(page).getByRole('table')).toContainText('Row depends on column at runtime.')
    await view(page, 'cycles').click()
    await expect(demo(page)).toContainText('Runtime dependency cycle: @acme/forms → @acme/validation → @acme/i18n → @acme/forms')
    await expect(demo(page).getByText(/^real output · the/)).toBeVisible()
  })

  test('keyboard: the impact view ranks by blast radius', async ({ page }) => {
    await open(page, 'loom')
    await until(press(page, view(page, 'impact')), () => expect(view(page, 'impact')).toHaveAttribute('aria-pressed', 'true'))
    await expect(demo(page)).toContainText('blast radius · packages that depend on each one')
    await expect(demo(page).locator('li').first()).toContainText('core')
  })
})

test.describe('tooling', () => {
  const step = (page: Page, n: number) => demo(page).locator('fieldset button').nth(n)
  const score = (page: Page) => log(page).locator('[data-k]').filter({ hasText: /Score:/ })

  test('pointer: the four real doctor runs score 67 → 81 → 88 → 96', async ({ page }) => {
    await open(page, 'tooling')
    const expected = ['67/100   Grade: D', '81/100   Grade: B', '88/100   Grade: B', '96/100   Grade: A']
    for (const [i, s] of expected.entries()) {
      await until(() => step(page, i).click(), () => expect(step(page, i)).toHaveAttribute('aria-pressed', 'true'))
      await expect(score(page)).toContainText(s)
    }
    await expect(demo(page).getByText(/^real output, replayed/)).toBeVisible()
  })

  test('keyboard: --fix shows the auto-fixed className', async ({ page }) => {
    await open(page, 'tooling')
    await until(press(page, step(page, 1)), () => expect(step(page, 1)).toHaveAttribute('aria-pressed', 'true'))
    await showAll(page).focus()
    await page.keyboard.press('Enter')
    await expect(log(page)).toContainText('ℹ Auto-fixed: className → class  react-patterns/auto-fixed-replace')
  })
})

test.describe('migrate', () => {
  const fw = (page: Page, name: string) => demo(page).getByRole('button', { name, exact: true })

  test('pointer: Vue swaps the import; pyreon check output is replayed', async ({ page }) => {
    await open(page, 'migrate')
    await until(() => fw(page, 'Vue').click(), () => expect(fw(page, 'Vue')).toHaveAttribute('aria-pressed', 'true'))
    await expect(demo(page)).toContainText("import { computed, ref, watch } from '@pyreon/vue-compat'")
    await showAll(page).click()
    await expect(log(page)).toContainText('[react:use-state]')
    await expect(log(page)).toContainText('✓ no Pyreon anti-patterns in 1 file')
    await expect(demo(page).getByText(/illustrative diff/).first()).toBeVisible()
  })

  test('keyboard: Solid swaps the Vite plugin line', async ({ page }) => {
    await open(page, 'migrate')
    await until(press(page, fw(page, 'Solid')), () => expect(fw(page, 'Solid')).toHaveAttribute('aria-pressed', 'true'))
    await expect(demo(page)).toContainText("plugins: [pyreon({ compat: 'solid' })]")
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('a replay shows everything at once', async ({ page }) => {
    await open(page, 'lathe')
    const t = demo(page).getByRole('button', { name: /^types\b/ })
    await until(turnOn(t, () => t.click()), () => expect(t).toHaveAttribute('aria-pressed', 'true'))
    // No Show all: the new output is complete immediately.
    await expect(demo(page).locator('[data-pending]')).toHaveCount(0)
    await expect(log(page)).toContainText('18 of 18 file(s) written')
  })
})

test.describe('SSG HTML holds the full final output', () => {
  const html = (id: string) => readFileSync(resolve(__dirname, `../docs/dist/products/${id}/index.html`), 'utf8')
  const cases: Record<string, string[]> = {
    ai: ['Reactivity map for Counter.tsx — 2 live · 1 baked-static · 1 footgun', 'simulated conversation, real tool output'],
    atlas: ['open full screen', 'real workbench'],
    lathe: ['17 of 17 file(s) written', 'verify SKIPPED no native modules were generated', 'real output, replayed'],
    loom: ['14 packages', 'phantom-dep', 'real output'],
    tooling: ['Score:  67/100   Grade: D', '4 errors · 9 warnings · 7 gates', 'real output, replayed'],
    migrate: ['illustrative diff', 'no Pyreon anti-patterns in 1 file', '3 findings in 1 file'],
  }
  for (const [id, needles] of Object.entries(cases)) {
    test(id, () => {
      const page = html(id)
      for (const n of needles) expect(page).toContain(n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    })
  }
})
