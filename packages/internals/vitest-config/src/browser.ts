import { mergeConfig } from 'vite'
import type { ViteUserConfig as VitestUserConfig } from 'vitest/config'
import { sharedConfig } from './internals.ts'

// Shared base for per-package browser test suites. Each package supplies the
// playwright provider in its own `vitest.browser.config.ts` so vite's static
// resolver can find it from the package directory.
//
// Runs real Chromium via @vitest/browser + playwright. Unlike happy-dom, this
// catches environment-divergence bugs: `typeof process` dead code, real
// IntersectionObserver timing, computed styles, Vite's `import.meta.env`
// in browser context. See .agents/rules/test-environment-parity.md.

export type BrowserProviderFactory = () => unknown

/**
 * Define a browser-test vitest config. Wraps the playwright provider in
 * the shared base (aliases + bun condition + CI retry + timeout) plus
 * the browser-runner config.
 *
 * `overrides` is applied LAST via `mergeConfig` — same semantics as
 * `defineNodeConfig`.
 */
export function defineBrowserConfig(
  provider: BrowserProviderFactory,
  overrides?: VitestUserConfig,
): VitestUserConfig {
  const base = mergeConfig(sharedConfig, {
    test: {
      globals: true,
      // Only `.browser.test.ts(x)` files run under this config.
      // Packages keep their node/happy-dom tests in `.test.ts(x)` (handled by
      // each package's existing `vitest.config.ts`).
      include: ['**/*.browser.test.{ts,tsx}'],
      browser: {
        enabled: true,
        headless: true,
        provider,
        instances: [{ browser: 'chromium' }],
      },
    },
  })
  /* v8 ignore next — `overrides` parameter is optional defensive surface; both branches are exercised but counted as one */
  return overrides ? mergeConfig(base, overrides) : base
}
