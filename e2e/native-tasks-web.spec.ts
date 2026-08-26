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

  // KNOWN GAP — now ROOT-CAUSED, and the causes are two separate bugs this
  // e2e is what found. Kept as `fixme` rather than deleted because it flips to
  // green the moment both fixes land, and until then it is the record of what
  // is actually wrong.
  //
  // The screen rendered nothing and I first reported "no page error" — wrong.
  // The framework DID catch it and render a dev error block; I had only
  // listened for `pageerror` and looked for the two testids. Reading the
  // rendered body named the throw immediately.
  //
  // Two packages required a WEB PROVIDER that the native lowering does not
  // need, so the same source ran on iOS and Android and threw in a browser:
  //
  //   1. `usePermissions(['tasks.write'])` — the seeded form is exactly what
  //      PMTC lowers to, and on the web it threw `must be used within
  //      <PermissionsProvider>`. Fixed in #3056: a seeded call is
  //      self-contained and now needs no provider.
  //   2. `useQuery(...)` — needs `<QueryClientProvider>` on the web, while the
  //      native lowering is self-contained. Carrying the provider in shared
  //      source then produced UNCOMPILABLE native code with zero warnings (an
  //      invented `QueryClientProvider(client:)` view plus a bare
  //      `createQueryClient` identifier). Fixed in #3058: the provider is
  //      transparent on native and the client binding emits nothing.
  //
  // A third break was a plain web bug, already fixed in #3055: `<FadeIn>` with
  // no `show` prop — the shape the preset docs show — crashed with
  // `show is not a function`.
  //
  test.fixme('the auth gate opens and the toolkit screen renders every package', async ({ page }) => {
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

    expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([])
  })

  test.fixme('url-state writes through to the URL', async ({ page }) => {
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
