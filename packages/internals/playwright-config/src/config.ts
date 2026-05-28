import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'
import type { E2eWebServer } from './servers.ts'

type ProjectUse = NonNullable<PlaywrightTestConfig['use']>

/**
 * A single Playwright project. `port` is expanded to
 * `use.baseURL = http://localhost:<port>` so each config states the port
 * once (the dev/preview server runs on the same port).
 */
export interface E2eProject {
  name: string
  testMatch: RegExp | string
  port: number
  /** Extra per-project `use` overrides, merged OVER the derived
   * `{ baseURL }` (e.g. `{ viewport: { width, height } }`). */
  use?: ProjectUse
}

export interface DefinePlaywrightConfigOptions {
  projects: E2eProject[]
  webServer: E2eWebServer[]
  /** Per-test timeout in ms. Default `30_000`; SSG gates use `60_000`. */
  timeout?: number
  /** Worker count. Omit for Playwright's default; set `1` for gates whose
   * spec mutates committed shared state (e.g. zero-hmr). */
  workers?: number
}

const DEFAULT_TEST_TIMEOUT = 30_000
const DEFAULT_WEBSERVER_TIMEOUT = 120_000

/**
 * The single canonical Playwright config factory for every root-level
 * `playwright.*.config.ts`. Bakes the shared defaults so individual configs
 * carry only what actually differs (projects + webServer):
 *
 *  - `testDir: './e2e'`
 *  - `retries: process.env.CI ? 2 : 0` — a single flake self-heals within
 *    its CI job; a real bug fails all attempts. Local stays 0 for honest,
 *    fast feedback.
 *  - `use: { headless: true, browserName: 'chromium' }`
 *  - per-webServer `reuseExistingServer: !process.env.CI` + a default
 *    `timeout`.
 *
 * Mirrors `@pyreon/vitest-config`'s `defineNodeConfig` — one private,
 * internal source of truth, consumed via a package import (no relative
 * `../shared` paths, no per-config duplication).
 */
export function definePlaywrightConfig(opts: DefinePlaywrightConfigOptions): PlaywrightTestConfig {
  return defineConfig({
    testDir: './e2e',
    timeout: opts.timeout ?? DEFAULT_TEST_TIMEOUT,
    retries: process.env.CI ? 2 : 0,
    ...(opts.workers !== undefined ? { workers: opts.workers } : {}),
    use: {
      headless: true,
      browserName: 'chromium',
    },
    projects: opts.projects.map((p) => ({
      name: p.name,
      testMatch: p.testMatch,
      use: { baseURL: `http://localhost:${p.port}`, ...p.use },
    })),
    webServer: opts.webServer.map((w) => ({
      command: w.command,
      port: w.port,
      ...(w.cwd !== undefined ? { cwd: w.cwd } : {}),
      ...(w.env !== undefined ? { env: w.env } : {}),
      timeout: w.timeout ?? DEFAULT_WEBSERVER_TIMEOUT,
      reuseExistingServer: !process.env.CI,
    })),
  })
}
