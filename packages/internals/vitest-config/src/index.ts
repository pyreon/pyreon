// Public API — every per-package vitest config imports from here.
//
// Relative imports use explicit `.ts` extensions because this module is
// imported from per-package `vitest.config.ts` files, which Vite's
// config bundler resolves through Node ESM. Node's strict ESM resolver
// requires explicit extensions for relative imports. TypeScript with
// `moduleResolution: 'Bundler'` allows the `.ts` form to typecheck.
export type { BrowserProviderFactory } from './browser.ts'
export { defineBrowserConfig, resolveTslibEsmEntry, tslibBrowserAlias } from './browser.ts'
export type { DefineNodeConfigOptions } from './node.ts'
export { defineNodeConfig } from './node.ts'
export type { CoverageThresholds, PackageCategory } from './thresholds.ts'
export { CATEGORY_DEFAULTS, resolveThresholds } from './thresholds.ts'
