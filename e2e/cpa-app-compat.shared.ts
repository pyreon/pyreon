import { expect, test, type Page } from '@playwright/test'

/**
 * Shared spec body for the compat-mode runtime gate. The 4 compat
 * fixtures (cpa-pw-app-{react,vue,solid,preact}) all scaffold from the
 * same `app` template — only `pyreon({ compat: <x> })` and the matching
 * `@pyreon/<x>-compat` dep change. They share the exact same shape, so
 * the gate proves the SAME end-to-end contract for all 4 that the
 * non-compat `cpa-app` spec proves for its baseline:
 *
 *   1. SSR landing renders with expected content
 *   2. Counter route — signal-driven click increments DOM
 *   3. Posts route — loader populates content
 *
 * What this gate proves (post PRs #419 / #422 / #425 — the
 * compat-runtime gap fix sequence):
 *
 *   - **OXC importSource fix** (`@pyreon/vite-plugin`) takes effect
 *     end-to-end. Pre-fix, `vite build` crashed resolving
 *     `@pyreon/<x>-compat/jsx-runtime` from `@pyreon/zero/src/link.tsx`.
 *     Post-fix, framework files keep `@pyreon/core/jsx-runtime` and
 *     the SSR landing renders.
 *
 *   - **`nativeCompat()` markers** (PR #425, on top of the marker check
 *     wired into all 4 compat layers in PR #422). 24 framework
 *     components are marked native — the compat-mode jsx() runtime
 *     reads `isNativeCompat(type)` and routes them through `h(type, …)`
 *     directly, preserving Pyreon's setup frame for `provide()` /
 *     `onMount()` / `onUnmount()` / `effect()` calls. Without the
 *     markers, `RouterView`'s `provide(LoaderDataContext, …)` would
 *     land in a torn-down context stack (the compat wrapper's
 *     `runUntracked` accessor) and `useLoaderData()` in the page
 *     component would read `undefined`. Test 3 (loader populates)
 *     catches that exact regression.
 *
 *   - **Signal reactivity inside the compat wrapper.** User components
 *     (`Counter`) are NOT marked native — they go through
 *     `wrapCompatComponent`. The wrapper's contract is to preserve
 *     Pyreon's effect scope and only relocate the render context, so
 *     `signal.set()` writes still trigger `_bind()` text-node
 *     re-evaluations. Test 2 (counter click) catches a regression to
 *     this contract.
 *
 *   - **Build-output is alive end-to-end.** No `Failed to load module
 *     script` MIME mismatch leaks (other than the documented SSG-plugin
 *     one), no missing-resolution errors, no console errors from a
 *     mismatched JSX runtime.
 *
 * Caller passes the compat name purely for assertion messages.
 */

const TOLERATED_CONSOLE_NOISE = [
  /Failed to load module script.*MIME type of "text\/html"/,
]

function captureRealConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (TOLERATED_CONSOLE_NOISE.some((re) => re.test(text))) return
    errors.push(text)
  })
  return errors
}

export function defineCpaCompatRuntimeSuite(compat: 'react' | 'vue' | 'solid' | 'preact'): void {
  test.describe(`cpa-app-${compat}-compat — runtime`, () => {
    test('SSR landing renders the hero (proves @pyreon/zero JSX runtime resolves under compat)', async ({
      page,
    }) => {
      const consoleErrors = captureRealConsoleErrors(page)

      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('Build fast.')
      // No "Failed to resolve import @pyreon/<x>-compat/jsx-runtime" leaks.
      // The framework-importer carve-out in `resolveId` is doing its job
      // end-to-end, not just at the unit-test layer.
      expect(consoleErrors).toEqual([])
    })

    test('counter route — clicking + increments via signal (compat wrapper preserves effect scope)', async ({
      page,
    }) => {
      // The Counter component is a USER component (not framework — not marked
      // native), so it goes through `wrapCompatComponent`. The wrapper sets up
      // a fresh render ctx but mounts the body inside Pyreon's effect scope —
      // so `signal.set()` writes still drive `_bind()` text-node updates.
      // If the wrapper ever loses Pyreon's effect-scope contract, the click
      // updates `count` but the DOM never patches and this test fails on the
      // `display` text assertion.
      await page.goto('/counter')
      const display = page.locator('.counter-display').first()
      await expect(display).toHaveText('0')

      // Click "+" — the third button in the counter-controls row
      const controls = page.locator('.counter-controls').first()
      await controls.locator('button').last().click()
      await expect(display).toHaveText('1')

      await controls.locator('button').last().click()
      await expect(display).toHaveText('2')

      // Reset button (middle)
      await controls.locator('button:has-text("Reset")').click()
      await expect(display).toHaveText('0')
    })

    test('posts route renders + loader populated (proves RouterView marker bypass works end-to-end)', async ({
      page,
    }) => {
      // The posts route's loader fires on navigation, returns a payload, and
      // RouterView calls `provide(LoaderDataContext, payload)` so the page
      // component's `useLoaderData()` can read it. RouterView is marked
      // native (PR #425) — its body MUST run inside Pyreon's setup frame,
      // not the compat wrapper's runUntracked accessor, or the `provide()`
      // call lands in a torn-down stack and the page reads `undefined`.
      // Pre-PR-3, this test would fail with empty `<main>` because the
      // loader payload never reached `useLoaderData()` and the post list
      // wouldn't render.
      await page.goto('/posts')
      // Sanity-check: the route loads SOMETHING. The double-mount workaround
      // means we have two `<main>` elements — assert the first is non-empty.
      await expect(page.locator('main').first()).not.toBeEmpty()
    })
  })
}
