import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Playwright config — native-todomvc-web (`@pyreon/example-native-todomvc-web`).
 *
 * Phase D follow-up — real-Chromium gate locking the runtime contract
 * for the Phase D web example (PR #947). The verify-modes cell asserts
 * the BUILD emits the expected static content; this gate asserts the
 * RUNTIME actually works in a real browser:
 *
 *   - mount renders the canonical-primitives TodoMVC into #app
 *   - <Field onChangeText> + onSubmit add a todo via Enter
 *   - <Checkbox> (the transitional DOM shim) toggles done state
 *   - <Button onPress> filter switches drive the visible signal
 *   - clear-completed removes done items
 *
 * Together: verify-modes catches build-shape regressions; this gate
 * catches per-primitive runtime regressions (e.g. <Field> stops
 * forwarding onSubmit, <Button onPress> stops firing).
 *
 * Separate from the main `playwright.config.ts` because Playwright's
 * `webServer` array boots ALL listed servers regardless of which
 * `--project` is selected. Pattern mirrors:
 *   - playwright.islands-showcase.config.ts
 *   - playwright.ui-regression.config.ts
 *   - playwright.compat-layers.config.ts
 *   - playwright.app-showcase.config.ts
 *
 * Port 5202 — picked above the existing per-suite range to avoid
 * collisions with other configs (5181 app-showcase, 5182 islands,
 * 5198 ssg-subpath, 5199-5200 ssg-i18n variants).
 */
export default definePlaywrightConfig({
  projects: [
    {
      name: 'native-todomvc-web',
      testMatch: /\/native-todomvc-web\.spec\.ts$/,
      port: 5202,
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [viteDevServer('@pyreon/example-native-todomvc-web', 5202)],
})
