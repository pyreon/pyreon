import { configDefaults, type ViteUserConfig as VitestUserConfig } from 'vitest/config'
import type { CoverageThresholds } from './thresholds.ts'

/**
 * The per-package test block every Node config starts from.
 *
 * This used to come from `@vitus-labs/tools-vitest`'s `createVitestConfig`.
 * It was a 60-line factory of which Pyreon used four inputs, so it lives here
 * now — the SAME defaults, value for value, so no package's resolved config
 * moved (`tests/base-config.test.ts` pins the output).
 *
 * The options that factory also offered (`aliases`, `plugins`, `pool`, `css`,
 * `include`, `exclude`, `coverageInclude`, `testTimeout`) were never passed
 * by `defineNodeConfig`; anything of that kind goes through its `overrides`.
 */
export interface BaseConfigOptions {
  environment: 'node' | 'happy-dom' | 'jsdom'
  coverageThresholds: CoverageThresholds
  setupFiles?: string[]
  coverageExclude?: string[]
}

/** Coverage never measures tests, re-export barrels, or bins. */
export const DEFAULT_COVERAGE_EXCLUDE: readonly string[] = [
  'src/**/*.test.ts',
  'src/**/*.test.tsx',
  'src/**/index.ts',
  'src/bin/**',
]

export const DEFAULT_COVERAGE_INCLUDE: readonly string[] = ['src/**/*.ts', 'src/**/*.tsx']

export function createBaseConfig(opts: BaseConfigOptions): VitestUserConfig {
  return {
    test: {
      globals: true,
      environment: opts.environment,
      mockReset: true,
      ...(opts.setupFiles && { setupFiles: opts.setupFiles }),
      // Non-scoped class names so a test can select what the component wrote.
      css: { modules: { classNameStrategy: 'non-scoped' } },
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      exclude: [...configDefaults.exclude, 'lib/**'],
      coverage: {
        provider: 'v8',
        include: [...DEFAULT_COVERAGE_INCLUDE],
        exclude: [...DEFAULT_COVERAGE_EXCLUDE, ...(opts.coverageExclude ?? [])],
        thresholds: {
          statements: opts.coverageThresholds.statements,
          branches: opts.coverageThresholds.branches,
          functions: opts.coverageThresholds.functions,
          lines: opts.coverageThresholds.lines,
        },
      },
    },
  }
}
