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
    // Each of these renders a value derived from its own runtime, and each is
    // asserted to the EXACT value that runtime should produce. `not.toBeEmpty()`
    // was the first version and is too weak to be worth much: a permissions
    // instance that wrongly DENIES renders `false`, which is not empty, and a
    // table with a broken page count renders some other number just as happily.
    const expected: Record<string, string> = {
      // state-tree: the model's declared default, read through its store.
      'toolkit-pagesize': '20',
      // sized-map: nothing has been cached yet, so the bounded map is empty.
      'toolkit-cache': '0',
      // table: one row at pageSize 10 is exactly one page.
      'toolkit-tablepages': '1',
      // permissions: seeded with 'tasks.write', so the check GRANTS.
      'toolkit-perm': 'true',
      // dnd: no drag in progress, so there is no active key.
      'toolkit-sortable': 'idle',
      // rx: [1,2,3,4] -> evens [2,4] -> doubled, so a length of 2.
      'toolkit-evens': '2',
      // sync: the CRDT counter at its seeded initial value.
      'toolkit-synced': '0',
      // sync: convergence through the map handle -- the key is written ONLY on a
      // peer doc, so this is true only if applyOps actually merged its ops in.
      'toolkit-crdt-map': 'true',
      // crash: fresh session, nothing recorded yet.
      'toolkit-crash-had': 'false',
      'toolkit-crash-note': 'idle',
      // machine: the declared initial state.
      'toolkit-machine': 'off',
      // storage: the default, since nothing has persisted a value yet.
      'toolkit-storage': 'light',
    }
    for (const [id, value] of Object.entries(expected)) {
      await expect(page.getByTestId(id), `${id} should render ${value}`).toHaveText(value)
    }
    // crash reporting: the app must SURVIVE recording an error -- a reporter
    // that takes the process down with it is worse than none. The persistence
    // half is device-only (iOS across a real terminate+relaunch, Android by
    // reading the file the reporter wrote); the web half proves the same call
    // is safe and that the shared source's shape works on all three targets.
    await page.getByTestId('toolkit-crash-record').click()
    await expect(page.getByTestId('toolkit-crash-note')).toHaveText('survived')

    // kinetic: the preset-animated container mounts its children.
    await expect(page.getByTestId('toolkit-fade')).toBeVisible()

    // toast + a11y: the two feedback channels a real mutation uses. Both were
    // CALLED by this screen and asserted by nothing, which is how the app
    // shipped with no <Toaster> mounted — `toast()` wrote to its store and
    // nothing rendered, on web only. Clicking the button is what proves it.
    // ui-system: styler + elements. Both lower to native view modifiers, and
    // until now the whole tier rested on a compiler snippet — the emit compiled
    // and nothing had rendered one. On the web the styling is OBSERVABLE, so
    // assert the computed value rather than mere presence: a wrapper that
    // renders its children while applying no CSS passes a visibility check and
    // fails this one. That is not hypothetical — it is what rocketstyle's
    // `.theme()` does here, which is why this uses `styled`.
    await expect(page.getByTestId('toolkit-card-text')).toBeVisible()
    const card = page.getByTestId('toolkit-card')
    expect(
      await card.evaluate((el) => getComputedStyle(el).backgroundColor),
      'styled() background did not reach the DOM',
    ).toBe('rgb(107, 114, 128)')
    expect(await card.evaluate((el) => getComputedStyle(el).padding)).toBe('8px')
    // attrs: the prop-defaulting HOC renders its child, with the baked default.
    await expect(page.getByTestId('toolkit-attrs-text')).toBeVisible()
    expect(
      await page.getByTestId('toolkit-attrs').evaluate((el) => getComputedStyle(el).gap),
      'attrs() .attrs({ gap: 2 }) default did not reach the DOM',
    ).toBe('8px')
    // coolgrid: Container > Row > Col nests and renders the leaf.
    await expect(page.getByTestId('toolkit-grid-cell')).toBeVisible()

    // rocketstyle: a `.theme()` chain with NO `.styles()`. This is the shape
    // that used to render completely unstyled here while being fully styled on
    // both native targets — so assert the COMPUTED value, which is the only
    // thing that can tell "rendered" from "rendered AND themed".
    await expect(page.getByTestId('toolkit-rocket-text')).toBeVisible()
    expect(
      await page.getByTestId('toolkit-rocket').evaluate((el) => getComputedStyle(el).backgroundColor),
      'rocketstyle .theme() did not reach the DOM',
    ).toBe('rgb(51, 65, 85)')

    // elements: the flex primitive renders BOTH children and applies its gap.
    await expect(page.getByTestId('toolkit-el-a')).toBeVisible()
    await expect(page.getByTestId('toolkit-el-b')).toBeVisible()

    // hotkeys: press the real combo and require the counter to MOVE. A rendered
    // initial value proves nothing — the handler is the thing being tested.
    await expect(page.getByTestId('toolkit-hotkey')).toHaveText('0')
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByTestId('toolkit-hotkey')).toHaveText('1')

    // validation: the schema-driven form must actually REJECT and then ACCEPT.
    // A rendered `isValid` alone proves nothing, and its INITIAL value proves
    // nothing either — `isValid` is derived from errors, and an untouched field
    // has none, so it starts `true` by design. The schema has to MOVE it.
    // Schema validation runs on BLUR (that is `runSchemaForField`'s path), so
    // the field has to lose focus for the schema to have an opinion.
    // Submit is what runs the schema (`isValid` is derived from errors, and an
    // untouched field has none — so its initial `true` proves nothing).
    await page.getByTestId('toolkit-schema-name').fill('ab')
    await page.getByTestId('toolkit-schema-submit').click()
    await expect(page.getByTestId('toolkit-schema-valid')).toHaveText('false')
    await page.getByTestId('toolkit-schema-name').fill('ada')
    await page.getByTestId('toolkit-schema-submit').click()
    await expect(page.getByTestId('toolkit-schema-valid')).toHaveText('true')

    // WebView bridge — the mechanism charts / code / flow / rich-text ride on.
    // The hosted page echoes the host-pushed `__pyreonData` back over the
    // reverse channel, so BOTH directions are proven by one assertion made
    // OUTSIDE the frame. Asserting inside it is the part the device suites
    // cannot do, which is why the page is written to echo.
    await expect(page.getByTestId('toolkit-bridge')).toHaveText('ping')

    // machine: a transition must actually MOVE the state — the initial value
    // alone would pass against a machine that ignores every event.
    await page.getByTestId('toolkit-machine-toggle').click()
    await expect(page.getByTestId('toolkit-machine')).toHaveText('on')

    await page.getByTestId('toolkit-save').click()
    // Scope each assertion to the DOM its OWN package owns. A plain
    // `getByText('Saved')` passes with no <Toaster> at all, because announce()'s
    // live region carries the same string — the two channels have to be
    // distinguished or one of them is unproven (bisect caught exactly that).
    await expect(page.locator('.pyreon-toast__message', { hasText: 'Saved' })).toBeVisible()
    await expect(page.locator('[aria-live]').filter({ hasText: 'Saved' })).toHaveCount(1)

    // Settle first, or this asserts before the screen's request has had a
    // chance to fail and passes for the wrong reason.
    await page.waitForTimeout(1500)
    // NO page errors at all. This needed an exemption until #3063: the screen
    // drives `useFetch(getTask({ params }))` — the shape the multiplatform docs
    // prescribe — which handed `useFetch` a promise where it wanted a URL and
    // left the endpoint's rejection unhandled. The hook adopts a promise source
    // now, so a failing request lands in `error()` and nothing escapes.
    expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([])
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
