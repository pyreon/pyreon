import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Playwright config — native-router-demo-web (R1.4).
 *
 * Real-Chromium gate locking the runtime contract for the Phase R1
 * multiplatform routing demo. The verify-modes cell (R1.5) asserts
 * the BUILD emits expected content; this gate asserts the RUNTIME:
 *
 *   - home route renders at launch (the iOS-equivalent of R1.1)
 *   - useNavigate() pushes new path → routes change → component updates
 *   - useParams() reads the :id param on /users/:id
 *   - 404 fallback renders for unmatched paths
 *
 * Together: verify-modes catches build-shape regressions; this gate
 * catches runtime regressions (e.g. useNavigate stops firing,
 * RouterView resolves the wrong component).
 *
 * Separate from main playwright.config.ts — Playwright boots ALL
 * listed webServers regardless of project selection. Same pattern as
 * native-todomvc-web (port 5202).
 *
 * Port 5203 — sits next to native-todomvc-web (5202).
 */
export default definePlaywrightConfig({
  projects: [
    {
      name: 'native-router-demo-web',
      testMatch: /\/native-router-demo-web\.spec\.ts$/,
      port: 5203,
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [viteDevServer('@pyreon/example-native-router-demo-web', 5203)],
})
