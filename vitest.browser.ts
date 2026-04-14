import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
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

/**
 * Resolve a path to `tslib.es6.js` — the flat-ESM tslib file that works
 * around the broken `tslib/modules/index.js` destructure-from-CJS-default
 * issue. See `packages/fundamentals/charts/vitest.browser.config.ts` for
 * the full investigation + microsoft/tslib#189 link.
 *
 * Returns `null` if tslib isn't installed (most browser packages don't
 * need it), so callers can spread `tslibBrowserAlias()` conditionally
 * without requiring every package to have tslib as a dep.
 *
 * Walks common install layouts (bun nested, npm/pnpm/yarn hoisted) from
 * the calling package directory.
 */
export function resolveTslibEsmEntry(fromDir: string): string | null {
  // 1. Direct: tslib sibling of fromDir (hoisted node_modules or
  //    package's own node_modules/tslib/).
  const candidates: string[] = []
  let dir = fromDir
  for (let i = 0; i < 10; i++) {
    candidates.push(path.join(dir, 'node_modules', 'tslib', 'tslib.es6.js'))
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // 2. Nested via echarts (bun's .bun/echarts@x.y.z/node_modules/tslib/tslib.es6.js).
  try {
    const require = createRequire(path.join(fromDir, 'package.json'))
    const echartsPkg = require.resolve('echarts/package.json')
    candidates.push(path.resolve(path.dirname(echartsPkg), '../tslib/tslib.es6.js'))
  } catch {
    // echarts not installed or not resolvable — fine, try other candidates.
  }
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

/**
 * Returns `resolve.alias` config entries for packages whose transitive
 * deps include `tslib` (e.g. echarts, zrender, rxjs). Applying the
 * alias makes `import { __extends } from "tslib"` resolve to the flat
 * ESM file instead of the broken `./modules/index.js` wrapper.
 *
 * No-op if tslib can't be found — returns `{}`.
 *
 * Usage in a per-package `vitest.browser.config.ts`:
 *
 *   import { defineBrowserConfig, tslibBrowserAlias } from '../../../vitest.browser'
 *   export default defineBrowserConfig(playwright(), {
 *     resolve: { alias: { ...tslibBrowserAlias(import.meta.url) } },
 *   })
 */
export function tslibBrowserAlias(importMetaUrl: string): Record<string, string> {
  const here = path.dirname(new URL(importMetaUrl).pathname)
  const esm = resolveTslibEsmEntry(here)
  return esm ? { tslib: esm } : {}
}

export const defineBrowserConfig = (provider: BrowserProviderFactory, overrides?: unknown) => {
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
  return overrides ? mergeConfig(base, overrides) : base
}
