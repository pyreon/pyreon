/**
 * Tests for `pyreon/vitest-config-uses-shared`.
 *
 * Locks in PRs #914-#922 (the vitest-config migration). Without this
 * rule a future PR could hand-roll a vitest config that silently drifts
 * the merge order — exactly the systemic-flake cause documented in
 * `.claude/rules/testing.md` and surfaced empirically in #919's
 * `@pyreon/dnd` finding (silent 5s timeout under CI load).
 */
import type { LintConfig } from '../types'
import { vitestConfigUsesShared } from '../rules/architecture/vitest-config-uses-shared'
import { lintFile } from '../runner'

const ON: LintConfig = {
  rules: { 'pyreon/vitest-config-uses-shared': 'error' },
}

function lint(source: string, filePath: string, config: LintConfig = ON) {
  return lintFile(filePath, source, [vitestConfigUsesShared], config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

describe('pyreon/vitest-config-uses-shared', () => {
  // ── FIRES ────────────────────────────────────────────────────────────────
  it('FIRES on vitest.config.ts that does NOT import @pyreon/vitest-config', () => {
    const result = lint(
      `import { defineConfig } from 'vitest/config'
       export default defineConfig({ test: { globals: true } })`,
      'packages/some/pkg/vitest.config.ts',
    )
    expect(diagIds(result)).toContain('pyreon/vitest-config-uses-shared')
  })

  it('FIRES on the canonical regression shape (sharedConfig from deleted root)', () => {
    const result = lint(
      `import { createVitestConfig } from '@vitus-labs/tools-vitest'
       import { mergeConfig } from 'vite'
       import { sharedConfig } from '../../../vitest.shared'
       export default mergeConfig(createVitestConfig(), sharedConfig)`,
      'packages/some/pkg/vitest.config.ts',
    )
    expect(diagIds(result)).toContain('pyreon/vitest-config-uses-shared')
  })

  it('FIRES on vitest.browser.config.ts without the helper', () => {
    const result = lint(
      `import { playwright } from '@vitest/browser-playwright'
       export default { test: { browser: { enabled: true, provider: playwright() } } }`,
      'packages/some/pkg/vitest.browser.config.ts',
    )
    expect(diagIds(result)).toContain('pyreon/vitest-config-uses-shared')
  })

  // ── DOES NOT FIRE ────────────────────────────────────────────────────────
  it('does NOT fire when defineNodeConfig is imported from @pyreon/vitest-config', () => {
    const result = lint(
      `import { defineNodeConfig } from '@pyreon/vitest-config'
       export default defineNodeConfig({ category: 'core' })`,
      'packages/some/pkg/vitest.config.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/vitest-config-uses-shared')
  })

  it('does NOT fire when defineBrowserConfig is imported from @pyreon/vitest-config', () => {
    const result = lint(
      `import { playwright } from '@vitest/browser-playwright'
       import { defineBrowserConfig } from '@pyreon/vitest-config'
       export default defineBrowserConfig(playwright())`,
      'packages/some/pkg/vitest.browser.config.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/vitest-config-uses-shared')
  })

  it('does NOT fire on non-vitest.config files', () => {
    const result = lint(
      `import { defineConfig } from 'vite'
       export default defineConfig({})`,
      'packages/some/pkg/vite.config.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/vitest-config-uses-shared')
  })

  it('does NOT fire on src/ files even if they have similar imports', () => {
    const result = lint(
      `import { mergeConfig } from 'vite'
       export const config = mergeConfig({}, {})`,
      'packages/some/pkg/src/index.ts',
    )
    expect(diagIds(result)).not.toContain('pyreon/vitest-config-uses-shared')
  })

  // ── exemptPaths ──────────────────────────────────────────────────────────
  it('does NOT fire when the path is exempt', () => {
    const config: LintConfig = {
      rules: {
        'pyreon/vitest-config-uses-shared': ['error', { exemptPaths: ['packages/legacy/'] }],
      },
    }
    const result = lint(
      `import { defineConfig } from 'vitest/config'
       export default defineConfig({})`,
      'packages/legacy/pkg/vitest.config.ts',
      config,
    )
    expect(diagIds(result)).not.toContain('pyreon/vitest-config-uses-shared')
  })
})
