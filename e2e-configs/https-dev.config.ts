import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * The real-browser half of `https()`.
 *
 * Boots a minimal fixture app (`e2e/fixtures/https-dev`) rather than a shared
 * example, because enabling TLS in an example would change its dev behaviour
 * for every other suite that boots it.
 *
 * `ignoreHTTPSErrors` is required and is not a weakening: the zero-config tier
 * is a self-signed certificate, and accepting the interstitial is precisely
 * what a developer does. An insecure origin would still fail the assertions,
 * since those read `window.isSecureContext`.
 *
 * CI: `bun run test:e2e:https-dev`.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: [
    {
      name: 'https-dev',
      testMatch: /https-dev\.spec\.ts$/,
      port: 5211,
      // The derived baseURL is http://; TLS is the point here.
      use: { baseURL: 'https://localhost:5211', ignoreHTTPSErrors: true },
    },
  ],
  webServer: [
    {
      cwd: '..',
      // The fixture imports the plugin by relative path, which vite's config
      // loader warns about (extensionless relative imports). Suppressed so the
      // suite's output stays readable and a REAL warning would stand out.
      env: { VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
      command: 'bunx vite dev e2e/fixtures/https-dev --port 5211 --strictPort',
      port: 5211,
    },
  ],
})
