import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate locking the runtime contract for the Phase D
 * canonical-primitives TodoMVC web example (PR #947). verify-modes
 * asserts the BUILD shape; this gate asserts the RUNTIME: mount → Field
 * onChangeText + onSubmit, Checkbox toggle, Button onPress filters,
 * clear-completed.
 *
 * CI: `bun run test:e2e:native-todomvc-web` (own step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [
    {
      name: 'native-todomvc-web',
      testMatch: /native-todomvc-web\.spec\.ts$/,
      port: 5202,
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [viteDevServer('@pyreon/example-native-todomvc-web', 5202)],
})
