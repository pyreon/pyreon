import { mergeConfig } from 'vite'
import { sharedConfig } from './vitest.shared'

// Shared base for per-package browser test suites. Each package supplies the
// playwright provider in its own `vitest.browser.config.ts` so vite's static
// resolver can find it from the package directory.
//
// Runs real Chromium via @vitest/browser + playwright. Unlike happy-dom, this
// catches environment-divergence bugs: `typeof process` dead code, real
// IntersectionObserver timing, computed styles, Vite's `import.meta.env`
// in browser context. See .claude/rules/test-environment-parity.md.

export interface BrowserProviderFactory {
  (): unknown
}

export const defineBrowserConfig = (provider: BrowserProviderFactory) =>
  mergeConfig(sharedConfig, {
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
