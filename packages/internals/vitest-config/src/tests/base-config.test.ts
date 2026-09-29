/**
 * Pins `createBaseConfig` to the defaults `@vitus-labs/tools-vitest`'s
 * `createVitestConfig` supplied before it was inlined. Every package's
 * resolved Node config starts from this block, so a drifted default (a lost
 * `mockReset`, a dropped coverage exclude) would move all of them at once.
 *
 * The values were verified before the swap by resolving `defineNodeConfig`
 * over an option matrix with the dependency and with this file and diffing
 * the serialized configs: byte-identical.
 */
import { configDefaults } from 'vitest/config'
import { createBaseConfig } from '../base.ts'

/** The coverage exclude list, asserting the block exists rather than casting past it. */
function coverageExclude(cfg: ReturnType<typeof createBaseConfig>): string[] {
  const coverage = cfg.test?.coverage as { exclude?: string[] } | undefined
  expect(coverage?.exclude).toBeDefined()
  return coverage!.exclude!
}

const T = { statements: 91, branches: 82, functions: 73, lines: 64 }

describe('createBaseConfig', () => {
  it('produces the inherited defaults', () => {
    expect(createBaseConfig({ environment: 'node', coverageThresholds: T })).toEqual({
      test: {
        globals: true,
        environment: 'node',
        mockReset: true,
        css: { modules: { classNameStrategy: 'non-scoped' } },
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        exclude: [...configDefaults.exclude, 'lib/**'],
        coverage: {
          provider: 'v8',
          include: ['src/**/*.ts', 'src/**/*.tsx'],
          exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/index.ts', 'src/bin/**'],
          thresholds: T,
        },
      },
    })
  })

  it('forwards setupFiles and appends coverageExclude after the defaults', () => {
    const cfg = createBaseConfig({
      environment: 'happy-dom',
      coverageThresholds: T,
      setupFiles: ['./src/tests/setup.ts'],
      coverageExclude: ['src/gen/**'],
    })
    expect(cfg.test?.environment).toBe('happy-dom')
    expect(cfg.test?.setupFiles).toEqual(['./src/tests/setup.ts'])
    expect(coverageExclude(cfg).at(-1)).toBe('src/gen/**')
  })

  it('omits setupFiles entirely when none are given (exactOptionalPropertyTypes)', () => {
    expect('setupFiles' in (createBaseConfig({ environment: 'node', coverageThresholds: T }).test ?? {})).toBe(false)
  })

  it('does not share its default arrays across calls', () => {
    const a = createBaseConfig({ environment: 'node', coverageThresholds: T })
    coverageExclude(a).push('mutated')
    const b = createBaseConfig({ environment: 'node', coverageThresholds: T })
    expect(coverageExclude(b)).not.toContain('mutated')
  })
})
