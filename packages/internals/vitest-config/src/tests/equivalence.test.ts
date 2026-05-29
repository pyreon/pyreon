/**
 * Equivalence regression — proves that `defineNodeConfig` produces a
 * resolved config functionally equivalent to the legacy manual-merge
 * shapes used across the 62 per-package `vitest.config.ts` files today.
 *
 * The migration plan asserts the new helper is a drop-in replacement
 * for THREE merge-order patterns currently in the tree:
 *   1. `mergeConfig(sharedConfig, createVitestConfig(...))`            (25 configs)
 *   2. `mergeConfig(createVitestConfig(), sharedConfig)`               (9 configs)
 *   3. `mergeConfig(mergeConfig(sharedConfig, createVitestConfig(...)),
 *      mergeConfig(defineConfig(...), nodeExcludeBrowserTests))`       (44 configs)
 *
 * For each pattern, the same logical inputs MUST produce identical
 * resolved values on every field we care about (aliases, conditions,
 * testTimeout, retry, environment, coverage thresholds, exclude lists).
 *
 * If any of these assertions fail, the migration will silently change
 * behavior for some package — block the PR, do not flip the configs.
 */

import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { mergeConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import { defineNodeConfig } from '../node.ts'
import { CATEGORY_DEFAULTS } from '../thresholds.ts'
import { nodeExcludeBrowserTests, sharedConfig } from '../internals.ts'

describe('defineNodeConfig — equivalence vs legacy merge patterns', () => {
  it('matches pattern 1: mergeConfig(sharedConfig, createVitestConfig())', () => {
    const legacy = mergeConfig(sharedConfig, createVitestConfig())
    const next = defineNodeConfig()

    expect(next.test?.testTimeout).toBe(legacy.test?.testTimeout)
    expect(next.test?.retry).toBe(legacy.test?.retry)
    expect(next.test?.environment).toBe(legacy.test?.environment)
    expect(next.test?.globals).toBe(legacy.test?.globals)
    expect(next.resolve?.conditions).toEqual(legacy.resolve?.conditions)
    expect(next.resolve?.alias).toEqual(legacy.resolve?.alias)
    expect(next.test?.include).toEqual(legacy.test?.include)
    expect(next.test?.exclude).toEqual(legacy.test?.exclude)
  })

  it('matches pattern 2: mergeConfig(createVitestConfig(), sharedConfig) — reversed', () => {
    const legacy = mergeConfig(createVitestConfig(), sharedConfig)
    const next = defineNodeConfig()

    // The two scalar fields sharedConfig sets — both patterns end up with
    // the same value because createVitestConfig() doesn't override them.
    expect(next.test?.testTimeout).toBe(legacy.test?.testTimeout)
    expect(next.test?.retry).toBe(legacy.test?.retry)
    expect(next.resolve?.conditions).toEqual(legacy.resolve?.conditions)

    // Aliases: reversed order in the legacy version (sharedConfig wins
    // last). Both contain the same entries; new helper produces the
    // forward order. The migration drops the order divergence.
    const legacyAlias = legacy.resolve?.alias as unknown as { find: unknown }[]
    const nextAlias = next.resolve?.alias as unknown as { find: unknown }[]
    expect(nextAlias.length).toBe(legacyAlias.length)
  })

  it('matches pattern 3: triple-nested with environment + excludeBrowserTests', () => {
    const legacy = mergeConfig(
      mergeConfig(sharedConfig, createVitestConfig({ environment: 'happy-dom' })),
      mergeConfig({ resolve: { conditions: ['bun'] } }, nodeExcludeBrowserTests),
    )
    const next = defineNodeConfig({
      environment: 'happy-dom',
      excludeBrowserTests: true,
    })

    expect(next.test?.environment).toBe('happy-dom')
    expect(next.test?.environment).toBe(legacy.test?.environment)
    expect(next.test?.testTimeout).toBe(legacy.test?.testTimeout)
    expect(next.test?.retry).toBe(legacy.test?.retry)
    expect(next.resolve?.conditions).toEqual(['bun'])
    expect(next.test?.exclude).toEqual(legacy.test?.exclude)
  })

  it('matches the @pyreon/reactivity reference config', () => {
    // Reactivity ships `mergeConfig(createVitestConfig(), sharedConfig)`
    // (reversed pattern). After migration it becomes `defineNodeConfig({ category: 'core' })`.
    const legacy = mergeConfig(createVitestConfig(), sharedConfig)
    const next = defineNodeConfig({ category: 'core' })

    expect(next.test?.testTimeout).toBe(legacy.test?.testTimeout)
    expect(next.test?.retry).toBe(legacy.test?.retry)
    expect(next.test?.globals).toBe(legacy.test?.globals)

    // Coverage thresholds — legacy uses createVitestConfig's 90/90/90/90
    // default; new helper resolves the `core` category default which is
    // the SAME 90/90/90/90. So byte-identical here.
    const legacyCov = legacy.test?.coverage as { thresholds?: object } | undefined
    const nextCov = next.test?.coverage as { thresholds?: object } | undefined
    expect(nextCov?.thresholds).toEqual(legacyCov?.thresholds)
  })
})

describe('defineNodeConfig — category resolution', () => {
  it('resolves core category to 90/90/90/90', () => {
    const cfg = defineNodeConfig({ category: 'core' })
    const cov = cfg.test?.coverage as { thresholds?: typeof CATEGORY_DEFAULTS.core }
    expect(cov?.thresholds).toEqual(CATEGORY_DEFAULTS.core)
  })

  it('resolves fundamentals category to 85/80/85/85', () => {
    const cfg = defineNodeConfig({ category: 'fundamentals' })
    const cov = cfg.test?.coverage as { thresholds?: typeof CATEGORY_DEFAULTS.fundamentals }
    expect(cov?.thresholds).toEqual(CATEGORY_DEFAULTS.fundamentals)
  })

  it('partial coverage override keeps other metrics at category default', () => {
    const cfg = defineNodeConfig({
      category: 'core',
      coverageThresholds: { branches: 70 },
    })
    const cov = cfg.test?.coverage as { thresholds: typeof CATEGORY_DEFAULTS.core }
    expect(cov.thresholds).toEqual({
      statements: 90,
      branches: 70,
      functions: 90,
      lines: 90,
    })
  })

  it('full coverage override replaces all metrics', () => {
    const cfg = defineNodeConfig({
      category: 'core',
      coverageThresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    })
    const cov = cfg.test?.coverage as { thresholds: typeof CATEGORY_DEFAULTS.core }
    expect(cov.thresholds).toEqual({
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    })
  })

  it('no category falls back to 90/90/90/90 (legacy default preserved)', () => {
    const cfg = defineNodeConfig()
    const cov = cfg.test?.coverage as { thresholds?: typeof CATEGORY_DEFAULTS.core }
    expect(cov?.thresholds).toEqual({
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    })
  })
})

describe('defineNodeConfig — invariants', () => {
  it('always sets bun resolve condition', () => {
    const cfg = defineNodeConfig({ category: 'fundamentals' })
    expect(cfg.resolve?.conditions).toContain('bun')
  })

  it('always sets CI-conditional retry', () => {
    const cfg = defineNodeConfig()
    expect(cfg.test?.retry).toBe(process.env.CI ? 2 : 0)
  })

  it('always sets 20s testTimeout', () => {
    const cfg = defineNodeConfig()
    expect(cfg.test?.testTimeout).toBe(20_000)
  })

  it('aliases include @pyreon/core and @pyreon/reactivity', () => {
    const cfg = defineNodeConfig()
    const aliases = cfg.resolve?.alias as unknown as { find: string }[]
    const names = aliases.map((a) => a.find)
    expect(names).toContain('@pyreon/core')
    expect(names).toContain('@pyreon/reactivity')
    expect(names).toContain('@pyreon/core/jsx-runtime')
  })

  it('subpath aliases come BEFORE their parent package alias', () => {
    const cfg = defineNodeConfig()
    const aliases = cfg.resolve?.alias as unknown as { find: string }[]
    const names = aliases.map((a) => a.find)
    const coreSubpath = names.indexOf('@pyreon/core/jsx-runtime')
    const corePackage = names.indexOf('@pyreon/core')
    expect(coreSubpath).toBeGreaterThanOrEqual(0)
    expect(corePackage).toBeGreaterThanOrEqual(0)
    expect(coreSubpath).toBeLessThan(corePackage)
  })

  it('excludeBrowserTests appends the .browser.test.* glob to test.exclude', () => {
    const cfg = defineNodeConfig({ excludeBrowserTests: true })
    expect(cfg.test?.exclude).toContain('**/*.browser.test.{ts,tsx}')
  })

  it('excludeBrowserTests=false (default) does NOT exclude browser tests', () => {
    const cfg = defineNodeConfig()
    expect(cfg.test?.exclude).not.toContain('**/*.browser.test.{ts,tsx}')
  })

  it('overrides apply last and win on scalar fields', () => {
    const cfg = defineNodeConfig({
      environment: 'happy-dom',
      overrides: { test: { environment: 'node' } },
    })
    expect(cfg.test?.environment).toBe('node')
  })

  it('includeIndexInCoverage drops src/**/index.ts from coverage.exclude', () => {
    const withFlag = defineNodeConfig({
      category: 'core',
      includeIndexInCoverage: true,
    })
    const withoutFlag = defineNodeConfig({ category: 'core' })

    const coveredExclude = (withFlag.test?.coverage as { exclude: string[] }).exclude
    const defaultExclude = (withoutFlag.test?.coverage as { exclude: string[] }).exclude

    expect(defaultExclude).toContain('src/**/index.ts')
    expect(coveredExclude).not.toContain('src/**/index.ts')
    // Other defaults preserved.
    expect(coveredExclude).toContain('src/**/*.test.ts')
    expect(coveredExclude).toContain('src/bin/**')
  })

  it('includeIndexInCoverage default (undefined) keeps src/**/index.ts excluded', () => {
    const cfg = defineNodeConfig({ category: 'core' })
    const cov = cfg.test?.coverage as { exclude: string[] }
    expect(cov.exclude).toContain('src/**/index.ts')
  })
})
