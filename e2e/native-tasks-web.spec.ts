import { expect, test } from '@playwright/test'

/**
 * native-tasks-web e2e — the WEB third of the tri-target proof.
 *
 * `examples/native-tasks/src/TasksApp.tsx` is compiled by PMTC for iOS and
 * Android and bundled by this web sibling. The device gates cover the two
 * native targets; the web target had only `check-shared-source-deps`, which
 * proves imports RESOLVE, not that anything renders.
 *
 * That gap matters most for the ToolkitScreen, which exists to exercise
 * packages that had only ever been proven by a registry snippet — i18n, toast,
 * a11y, url-state, query, state-tree, rx, sized-map, permissions, http, dnd,
 * table, kinetic. Each lowers to a native runtime type; on web each runs its
 * REAL implementation. A lowering can be correct and the web path still broken
 * (or vice versa), so neither target substitutes for the other.
 */

test.describe('native-tasks-web — the shared source renders on the third target', () => {
  test('the app boots and the login screen renders', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page.getByTestId('login-page')).toBeVisible()
  })

  // This spec is the reason three bugs got fixed. It ran the shared source in a
  // browser for the first time, the screen rendered nothing, and each fix
  // uncovered the next one:
  //
  //   1. `usePermissions(['tasks.write'])` — the seeded form PMTC lowers to
  //      threw `must be used within <PermissionsProvider>` on the web, so a
  //      gated screen ran on two targets and died on the third (#3056).
  //   2. `useQuery` needs `<QueryClientProvider>` on the web, and carrying that
  //      provider in shared source emitted a SwiftUI view existing on neither
  //      platform, with zero warnings (#3058).
  //   3. `<FadeIn>` with no `show` prop — the shape the preset docs show —
  //      crashed with `show is not a function` (#3055).
  //
  // None was reachable by any other check: PMTC passes unknown shapes through
  // verbatim, and the packages' own suites all passed. Only a browser saw them.
  //
  test('the auth gate opens and the toolkit screen renders every package', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/')
    // The store-backed auth flag gates /toolkit via beforeEnter, exactly as it
    // gates the native navigation stacks.
    await page.getByTestId('login-username').fill('ada')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('tasks-page')).toBeVisible()

    await page.getByTestId('tasks-toolkit').click()
    await expect(page.getByTestId('toolkit-page')).toBeVisible()

    // i18n: the translated title, not the key. A missing catalogue renders the
    // key itself, which a visibility-only assertion would happily accept.
    await expect(page.getByTestId('toolkit-title')).toHaveText('Toolkit')
    // url-state: the default reaches the DOM.
    await expect(page.getByTestId('toolkit-filter')).toHaveText('all')
    // state-tree, sized-map, table, permissions, dnd — each renders a value
    // derived from its own runtime, so an inert package shows as empty text.
    for (const id of [
      'toolkit-pagesize',
      'toolkit-cache',
      'toolkit-tablepages',
      'toolkit-perm',
      'toolkit-sortable',
      'toolkit-evens',
    ]) {
      await expect(page.getByTestId(id)).not.toBeEmpty()
    }
    // kinetic: the preset-animated container mounts its children.
    await expect(page.getByTestId('toolkit-fade')).toBeVisible()

    // The screen drives `useFetch` against a real absolute URL (the same
    // endpoint the native targets hit), so in a sandbox it fails on CORS or DNS
    // and @pyreon/http rejects. That rejection is the app's, not a framework
    // fault, and whether it lands before or after this line is a race — so
    // filter exactly that shape and let every OTHER page error fail the test.
    const unexpected = errors.filter((e) => !/failed before a response was received/.test(e))
    expect(unexpected, `page errors: ${unexpected.join(' | ')}`).toEqual([])
  })

  test('url-state writes through to the URL', async ({ page }) => {
    // The one behaviour that is genuinely web-specific: on native the router
    // holds the query, on web it must reach `location.search`. A lowering that
    // works on both devices says nothing about this.
    await page.goto('/')
    await page.getByTestId('login-username').fill('ada')
    await page.getByTestId('login-submit').click()
    await page.getByTestId('tasks-toolkit').click()

    await page.getByTestId('toolkit-filter-done').click()
    await expect(page.getByTestId('toolkit-filter')).toHaveText('done')
    await expect(page).toHaveURL(/filter=done/)
  })
})
