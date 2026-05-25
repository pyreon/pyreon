import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { mergeConfig } from 'vite'
import type { ViteUserConfig as VitestUserConfig } from 'vitest/config'
import { nodeExcludeBrowserTests, sharedConfig } from './internals.ts'
import {
  type CoverageThresholds,
  type PackageCategory,
  resolveThresholds,
} from './thresholds.ts'

export interface DefineNodeConfigOptions {
  /**
   * Package category. Drives the coverage-threshold default
   * (see `CATEGORY_DEFAULTS` in `./thresholds`). Omit for a
   * package that doesn't fit any category — the legacy 90/90/90/90
   * default applies.
   */
  category?: PackageCategory
  /**
   * Test runtime environment. Default `'node'` (matches
   * `createVitestConfig`'s default). Set to `'happy-dom'` for any
   * package that touches the DOM (runtime-dom, router, ui-system,
   * compat layers, hooks, ...).
   */
  environment?: 'node' | 'happy-dom' | 'jsdom'
  /**
   * Append `**\/*.browser.test.{ts,tsx}` to the Node runner's exclude
   * list. Required when the package ALSO ships a sibling
   * `vitest.browser.config.ts` — otherwise the Node runner would try
   * to execute browser-only tests under happy-dom and fail in confusing
   * ways. Default `false`.
   */
  excludeBrowserTests?: boolean
  /**
   * Per-package coverage-threshold overrides. Merges OVER the category
   * default — partial overrides (`{ branches: 70 }`) keep the other 3
   * metrics at the category default.
   */
  coverageThresholds?: Partial<CoverageThresholds>
  /**
   * Extra files to exclude from coverage measurement. Appended to
   * `createVitestConfig`'s defaults
   * (`src/**\/*.test.{ts,tsx}`, `src/**\/index.ts`, `src/bin/**`).
   */
  coverageExclude?: string[]
  /**
   * Vitest `setupFiles` — forwarded verbatim to `createVitestConfig`.
   */
  setupFiles?: string[]
  /**
   * Escape hatch for per-package quirks (extra plugins, custom
   * resolver options, alias overrides, etc.). Applied LAST via
   * `mergeConfig`, so this wins last on scalar fields and appends on
   * array fields (vitest's standard merge semantics).
   */
  overrides?: VitestUserConfig
}

/**
 * Define a vitest config for a Pyreon package — single canonical shape
 * that absorbs the chaotic merge-order patterns the 62 per-package
 * configs grew organically.
 *
 * Internally executes the merge in ONE canonical order:
 *
 *   mergeConfig(sharedConfig, createVitestConfig(...))   then
 *   mergeConfig(...above, nodeExcludeBrowserTests if requested)   then
 *   mergeConfig(...above, overrides)
 *
 * `sharedConfig` first means its aliases + bun condition + retry +
 * timeout form the BASE; the category defaults from
 * `createVitestConfig` come next (so they can extend sharedConfig's
 * `test` block without overwriting its scalar fields); browser-test
 * exclusion is appended after; per-package overrides are last.
 *
 * The merge order is documented + locked by
 * `src/tests/byte-identical.test.ts` — a regression test that snapshots
 * the resolved config for a reference package per category and asserts
 * it byte-matches the pre-migration manual merge.
 */
export function defineNodeConfig(
  opts: DefineNodeConfigOptions = {},
): VitestUserConfig {
  const thresholds = resolveThresholds(opts.category, opts.coverageThresholds)
  // Build createVitestConfig's options conditionally — root tsconfig's
  // `exactOptionalPropertyTypes: true` means we can't pass `undefined`
  // to an optional field that doesn't list `undefined` in its type.
  // Spreading conditionally omits the keys entirely when undefined.
  const base = createVitestConfig({
    environment: opts.environment ?? 'node',
    coverageThresholds: thresholds,
    ...(opts.setupFiles && { setupFiles: opts.setupFiles }),
    ...(opts.coverageExclude && { coverageExclude: opts.coverageExclude }),
  })

  let merged = mergeConfig(sharedConfig, base)
  if (opts.excludeBrowserTests) {
    merged = mergeConfig(merged, nodeExcludeBrowserTests)
  }
  if (opts.overrides) {
    merged = mergeConfig(merged, opts.overrides)
  }
  return merged
}
