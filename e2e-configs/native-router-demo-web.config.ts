import { definePlaywrightConfig, viteDevServer } from '@pyreon/playwright-config'

/**
 * Real-Chromium gate locking the runtime contract for the Phase R1
 * multiplatform routing demo (R1.4). verify-modes (R1.5) asserts the
 * BUILD shape; this gate asserts the RUNTIME: home route at launch,
 * `useNavigate()` push → route change, `useParams()` reads `:id`,
 * 404 fallback for unmatched paths.
 *
 * CI: `bun run test:e2e:native-router-demo-web` (own step).
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [
    {
      name: 'native-router-demo-web',
      testMatch: /native-router-demo-web\.spec\.ts$/,
      port: 5203,
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [viteDevServer('@pyreon/example-native-router-demo-web', 5203)],
})
