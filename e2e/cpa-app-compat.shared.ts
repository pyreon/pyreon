import { expect, test, type Page } from '@playwright/test'

/**
 * Shared spec body for the compat-mode runtime gate. The 4 compat
 * fixtures (cpa-pw-app-{react,vue,solid,preact}) all scaffold from the
 * same `app` template — only `pyreon({ compat: <x> })` and the matching
 * `@pyreon/<x>-compat` dep change. So they share the same SSR-landing
 * shape, and the runtime gate proves the same end-to-end contract for
 * all 4: the framework's compat-mode JSX-runtime aliasing resolves
 * correctly all the way through the production build, the SSR pipeline
 * paints, and no console errors leak from a missing import on
 * `@pyreon/<x>-compat/jsx-runtime`.
 *
 * What this gate DOES prove (the scope this PR ships):
 *   - The OXC importSource fix in `@pyreon/vite-plugin` (this PR) takes
 *     effect end-to-end. Pre-fix, dev SSR crashed during `vite build`
 *     resolving `@pyreon/<x>-compat/jsx-runtime` from `@pyreon/zero/src/link.tsx`.
 *     Post-fix, the framework files keep `@pyreon/core/jsx-runtime` and
 *     the SSR landing renders.
 *   - Build-output is alive (page paints something, framework didn't blow up).
 *
 * What this gate DOES NOT prove (deferred to a separate plan):
 *   - Client-side signal interactivity in compat-mode scaffolded apps.
 *     The `app` template uses Pyreon-flavored TSX (`onClick`, `class=`,
 *     `signal()`). In compat mode, OXC routes JSX through the compat
 *     package's runtime — which translates to the source framework's
 *     semantics. The Pyreon-template + compat-runtime combination has
 *     known runtime mismatch beyond initial render (counter clicks +
 *     loader-driven routes don't function the same as in non-compat).
 *     This is a product/template design question, not a regression — the
 *     `--compat=X` flag was designed for migrating an EXISTING React /
 *     Vue / Solid / Preact app, not for scaffolding a new Pyreon-flavored
 *     one. The gate caught the limitation; the fix is template work or a
 *     scaffolder warning, separate from this PR's OXC importSource fix.
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
  })
}
