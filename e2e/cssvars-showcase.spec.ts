import { type Browser, expect, type Page, test } from '@playwright/test'

// Real-app dogfood for the CSS-variables theming mode. `examples/cssvars-bench`
// mounts a grid of REAL @pyreon/ui-components Buttons + genuinely mode-varying
// `mode(a, b)` boxes under <PyreonUI mode={signal}> and exposes a visible
// dark/light toggle. This gate proves the mode works END-TO-END in a real app
// in real Chromium — not just in unit/measured harnesses:
//
//   ?vars=1 (cssVariables): a toggle is ONE documentElement[data-theme] write —
//     the cascade re-resolves mode(a,b) vars (sentinel color flips) while the
//     Buttons' classNames DON'T change (the no-re-render contract), zero errors.
//   ?vars=0 (classic): the same toggle still works (components re-resolve), but
//     PyreonUI writes NO documentElement attribute — the distinguishing shape.

const isViteNoise = (t: string): boolean => /Outdated Optimize Dep|ERR_ABORTED|\b504\b/.test(t)

async function open(browser: Browser, query: string, errors: string[]): Promise<Page> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' && !isViteNoise(m.text())) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`/?${query}`, { waitUntil: 'networkidle' })
  await expect(page.getByTestId('mode-label')).toBeVisible()
  return page
}

const sentinelBg = (page: Page): Promise<string> =>
  page.evaluate(() => getComputedStyle(document.getElementById('sentinel')!).backgroundColor)
const htmlTheme = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'))

test.describe('cssVariables real-app dogfood', () => {
  test('cssVariables mode: toggle = one documentElement write, sentinel flips, Button classes unchanged', async ({
    browser,
  }) => {
    const errors: string[] = []
    const page = await open(browser, 'vars=1&n=60', errors)
    await expect(page.getByTestId('css-mode')).toHaveText('cssVariables')
    await expect(page.getByTestId('mode-label')).toHaveText('mode: light')

    // Real components render + resolve real CSS through the var indirection.
    const btn = page.locator('[data-i="0"]').first()
    const btnClassBefore = await btn.getAttribute('class')
    expect(await sentinelBg(page)).toBe('rgb(16, 185, 129)') // mode('light' value)
    expect(await htmlTheme(page)).toBe('light')

    await page.getByTestId('mode-toggle').click()

    await expect(page.getByTestId('mode-label')).toHaveText('mode: dark')
    expect(await htmlTheme(page)).toBe('dark') // ONE attribute write at :root
    await expect.poll(() => sentinelBg(page)).toBe('rgb(239, 68, 68)') // cascade re-resolved the var
    // the no-re-render contract: the Button's className did NOT change on flip
    expect(await btn.getAttribute('class')).toBe(btnClassBefore)

    await page.getByTestId('mode-toggle').click()
    expect(await htmlTheme(page)).toBe('light')
    await expect.poll(() => sentinelBg(page)).toBe('rgb(16, 185, 129)')

    expect(errors, errors.join('\n')).toEqual([])
    await page.context().close()
  })

  test('classic mode: same toggle works (re-resolve), but NO documentElement attribute', async ({
    browser,
  }) => {
    const errors: string[] = []
    const page = await open(browser, 'vars=0&n=60', errors)
    await expect(page.getByTestId('css-mode')).toHaveText('classic')
    expect(await sentinelBg(page)).toBe('rgb(16, 185, 129)')
    // classic PyreonUI does NOT write documentElement — the var-mode-only shape
    expect(await htmlTheme(page)).toBeNull()

    await page.getByTestId('mode-toggle').click()
    await expect(page.getByTestId('mode-label')).toHaveText('mode: dark')
    await expect.poll(() => sentinelBg(page)).toBe('rgb(239, 68, 68)') // classic re-resolve
    expect(await htmlTheme(page)).toBeNull() // still no attribute in classic

    expect(errors, errors.join('\n')).toEqual([])
    await page.context().close()
  })
})
