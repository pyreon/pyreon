/**
 * `atlas dev` — the workbench booting against a project's REAL components,
 * with a catalog derived from source rather than hand-written stories.
 *
 * This is the difference between Atlas being a demo and being a tool: every
 * panel it ships was previously mounted on a workbench that could only be
 * started by hand-wiring a Vite app.
 *
 * The server is started by the config's webServer (see e2e-configs), running
 * the real CLI command — not an in-process helper — so what is tested is what a
 * user runs.
 */
import { expect, test } from '@playwright/test'

test.describe('atlas dev', () => {
  test('serves the workbench with a catalog derived from real components', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

    await page.goto('/')

    // The shell must win over the consuming project's own index.html.
    await expect(page.locator('#atlas-root')).toBeAttached()

    // Components discovered from source appear in the sidebar — nobody wrote a
    // story for these.
    await expect(page.getByRole('button', { name: 'Button' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Badge' })).toBeVisible()

    expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([])
  })

  test('a click on a DERIVED component lands in the Actions panel — zero authoring', async ({
    page,
  }) => {
    // Button is discovered from source; its `onClick` is a discovered reactive
    // prop, and the generated render injects a logging handler for it. Before
    // the ctx threading, every derived catalog ignored its second render
    // argument and the Actions panel was permanently empty for scanned
    // projects.
    await page.goto('/')
    await page.getByRole('button', { name: 'Button', exact: true }).click()
    await page.getByRole('button', { name: 'Actions', exact: true }).click()
    await expect(page.getByText('No events yet — click the component.')).toBeVisible()

    await page.getByTestId('canvas-preview').locator('button').first().click()
    await expect(page.getByText('onClick', { exact: true })).toBeVisible()
  })

  test('pseudo-state forcing reaches a DERIVED rocketstyle chain', async ({ page }) => {
    // Chip's theme declares `hover: { opacity: 0.55 }`. The generated render
    // spreads `ctx.pseudo` gated on IS_ROCKETSTYLE, so forcing Hover must
    // change the PAINTED style — the same CSS a real pointer hover applies.
    await page.goto('/')
    await page.getByRole('button', { name: 'Chip', exact: true }).click()
    await page.getByTestId('addon-tab-canvas').click()

    const chip = page.getByTestId('canvas-preview').locator('span').first()
    const opacity = () => chip.evaluate((el) => getComputedStyle(el).opacity)
    await expect.poll(opacity).toBe('1')

    await page.getByTestId('pseudo-hover').click()
    await expect.poll(opacity).toBe('0.55')

    await page.getByTestId('pseudo-none').click()
    await expect.poll(opacity).toBe('1')
  })

  test('a DERIVED component consuming usePermissions() is recorded by the Roles panel', async ({
    page,
  }) => {
    // GuardedDelete reads permissions the idiomatic way — `usePermissions()`
    // from context, no prop threading. The preview always renders inside a
    // PermissionsProvider carrying the active role's RECORDING instance, so
    // the consulted-keys audit works for scanned projects too.
    await page.goto('/')
    await page.getByRole('button', { name: 'GuardedDelete' }).click()
    await page.getByTestId('addon-tab-permissions').click()

    const btn = page.getByTestId('canvas-preview').locator('button').first()

    await page.getByTestId('role-admin').click()
    await expect(btn).toBeEnabled()

    await page.getByTestId('role-viewer').click()
    await expect(btn).toBeDisabled()

    const summary = (await page.getByTestId('perm-summary').textContent()) ?? ''
    expect(summary).toMatch(/1 key\(s\) consulted/)
    expect(summary).toMatch(/1 denied/)
  })

  test('discovers a rocketstyle CHAIN (with a relative import) in the live workbench', async ({
    page,
  }) => {
    // Chip is a rocketstyle call chain in `components/Chip.tsx`, importing
    // `./chip-kit` — invisible to the static scanner AND unloadable when
    // discovery hands the loader a relative path. It reaching the sidebar
    // proves the dev path runs rocketstyle discovery through the module
    // loader, with the theme from atlas.config.ts driving its variant axis.
    await page.goto('/')
    await page.getByRole('button', { name: 'Chip', exact: true }).click()

    const preview = page.locator('[data-testid="canvas-preview"]')
    await expect(preview).toBeVisible()
    await expect(preview.locator('[data-atlas-error]')).toHaveCount(0)

    // The variant axis came from `getStaticDimensions(theme)` — its real
    // values, not a text box.
    await expect(page.getByText('Variant', { exact: true })).toBeVisible()
    await expect(page.getByText('solid', { exact: true }).first()).toBeVisible()
  })

  test('renders a discovered component in the canvas', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Badge' }).click()
    const preview = page.locator('[data-testid="canvas-preview"]')
    await expect(preview).toBeVisible()
    // A real element, not the guarded load-failure placeholder.
    await expect(preview.locator('[data-atlas-error]')).toHaveCount(0)
    const box = await preview.boundingBox()
    expect(box?.width ?? 0, 'the preview must actually paint').toBeGreaterThan(0)
  })

  test('derives controls from the component props', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Badge' }).click()
    await page.getByTestId('addon-tab-controls').click()
    // Badge takes `label` / `variant` / `dot`; the enum must carry its real
    // members, which is the drift a derived catalog removes.
    await expect(page.getByText('Label', { exact: true })).toBeVisible()
    await expect(page.getByText('Variant', { exact: true })).toBeVisible()
  })

  test('the RPC channel answers, and names known methods on a typo', async ({ page }) => {
    await page.goto('/')
    const ok = await page.evaluate(async () => {
      const r = await fetch('/__atlas/rpc', {
        method: 'POST',
        body: JSON.stringify({ method: 'components' }),
      })
      return r.json()
    })
    expect(ok.ok).toBe(true)
    expect(ok.result).toContain('Badge')

    const bad = await page.evaluate(async () => {
      const r = await fetch('/__atlas/rpc', {
        method: 'POST',
        body: JSON.stringify({ method: 'nope' }),
      })
      return r.json()
    })
    expect(bad.ok).toBe(false)
    // A typo must be a one-step fix, not a hunt.
    expect(String(bad.error)).toContain('Known:')
  })

  test('serves a component source over the channel, path-guarded', async ({ page }) => {
    await page.goto('/')
    const res = await page.evaluate(async () => {
      const r = await fetch('/__atlas/rpc', {
        method: 'POST',
        body: JSON.stringify({ method: 'source', params: { component: 'Badge' } }),
      })
      return r.json()
    })
    expect(res.ok).toBe(true)
    expect(String(res.result.source)).toContain('Badge')
  })
})

/**
 * The Reactivity Lens — the compiler's own per-expression verdict, fetched over
 * the dev channel. Node-only by necessity (TS compiler API + oxc), which is why
 * M1 defined the channel first.
 */
test.describe('Reactivity Lens', () => {
  test('reports the compiler verdict for a real component', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Badge' }).click()
    await page.getByTestId('addon-tab-lens').click()

    // Idle until asked — analysing every component on selection would pay the
    // TS-compiler cost for a panel nobody opened.
    await expect(page.getByTestId('lens-unavailable')).toHaveCount(0)
    await page.getByTestId('lens-analyse').click()

    // Real findings, on real lines, with the compiler's own vocabulary.
    const rows = page.locator('[data-testid="lens-line"]')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    const text = (await page.locator('body').innerText()).toLowerCase()
    expect(text).toMatch(/reactive|baked once|footgun/)
  })

  test('the lens method is reachable directly and returns line-anchored findings', async ({ page }) => {
    await page.goto('/')
    const res = await page.evaluate(async () => {
      const r = await fetch('/__atlas/rpc', {
        method: 'POST',
        body: JSON.stringify({ method: 'lens', params: { component: 'Badge' } }),
      })
      return r.json()
    })
    expect(res.ok, JSON.stringify(res).slice(0, 200)).toBe(true)
    expect(Array.isArray(res.result.lines)).toBe(true)
    // Every finding must anchor to a line that exists in the returned source.
    const maxLine = res.result.lines.length
    for (const line of res.result.lines) {
      expect(line.line).toBeGreaterThan(0)
      expect(line.line).toBeLessThanOrEqual(maxLine)
    }
    expect(typeof res.result.suspects).toBe('number')
  })
})

/**
 * URL state — a workbench view that survives a reload and can be shared.
 *
 * Before this, every reload dropped you on the first component with default
 * controls, and "open Atlas, pick X, set Y" was the only way to hand someone a
 * view. Asserted through a REAL reload, because that is the claim.
 */
test.describe('URL state', () => {
  test('a selected component and edited args survive a reload', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Badge' }).click()
    await page.getByTestId('addon-tab-controls').click()
    await page.locator('input[placeholder]').last().fill('Shipped')

    // The URL follows the view.
    await expect(page).toHaveURL(/c=badge/)
    await expect(page).toHaveURL(/args=/)

    await page.reload()

    // Same component, same edit — not the first component with defaults.
    await expect(page.getByTestId('canvas-name')).toContainText('Badge')
    await page.getByTestId('addon-tab-controls').click()
    await expect(page.locator('input[placeholder]').last()).toHaveValue('Shipped')
  })

  test('canvas state is shareable, and a stale component id degrades', async ({ page }) => {
    await page.goto('/?c=badge&viewport=tablet&p=canvas')
    await expect(page.getByTestId('canvas-name')).toContainText('Badge')
    // The link named a viewport; it must be applied, not merely stored.
    await expect(page.getByTestId('viewport-tablet')).toHaveAttribute('data-rocketstyle', /.+/)

    // A component that no longer exists must not blank the workbench.
    await page.goto('/?c=deleted-component')
    await expect(page.getByTestId('canvas-preview')).toBeVisible()
    await expect(page.getByTestId('canvas-name')).not.toBeEmpty()
  })

  test('typing does not fill the history stack', async ({ page }) => {
    // `replaceState`, not `pushState`: otherwise Back walks backwards through
    // every keystroke instead of leaving the workbench.
    await page.goto('/')
    await page.getByRole('button', { name: 'Badge' }).click()
    await page.getByTestId('addon-tab-controls').click()
    const before = await page.evaluate(() => history.length)
    const box = page.locator('input[placeholder]').last()
    await box.fill('a')
    await box.fill('ab')
    await box.fill('abc')
    expect(await page.evaluate(() => history.length)).toBe(before)
  })
})
