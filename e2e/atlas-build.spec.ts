import { expect, test } from '@playwright/test'

/**
 * `atlas build` — the STATIC site, served by a plain file server.
 *
 * What only this gate can catch: a built site has no Node, so the two
 * node-answered panels work only if the build baked their answers into the
 * page. Every unit test around the baking passes whether or not it is actually
 * wired into the emitted HTML, and the failure is the silent kind — the site
 * looks complete while its two most valuable views sit dark forever.
 */
test.describe('atlas build — static site', () => {
  test('boots the workbench with no server and no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await page.goto('/')
    await expect(page).toHaveTitle('Atlas E2E')
    // The catalog rendered: the sidebar carries the workshop's components.
    await expect(page.getByText('Button', { exact: true }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('the --title flag reaches the page title AND the chrome', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Atlas E2E')
    await expect(page.getByText('Atlas E2E').first()).toBeVisible()
  })

  test('groups match the dev server — the scan directory is not a group', async ({ page }) => {
    // Regression: the build passed the project ROOT as the group origin, so
    // every group was prefixed with the scan directory's own name (`Src/
    // Components`) and the built site's sidebar disagreed with `atlas dev`'s
    // for the same project.
    await page.goto('/')
    await expect(page.getByText('Components', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Src', { exact: true })).toHaveCount(0)
  })

  test('the Docs source block is BAKED — it loads without a server', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Docs', { exact: true }).first().click()
    await page.getByTestId('docs-source-load').click()
    const source = page.getByTestId('docs-source')
    await expect(source).toBeVisible()
    // Real source, not an error placeholder.
    await expect(source).toContainText('export')
  })

  test('the Reactivity Lens is BAKED — real compiler verdicts, no server', async ({ page }) => {
    // The Lens runs the TypeScript compiler API + oxc, which cannot run in a
    // page at all. Its presence here is the whole proof that baking works.
    await page.goto('/')
    await page.getByText('Lens', { exact: true }).first().click()
    await page.getByText('Analyse', { exact: true }).first().click()
    await expect(page.getByText(/reactive|static-text|footgun/).first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
