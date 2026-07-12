/**
 * Tests for `pyreon/vitest-config-uses-shared`.
 *
 * Locks in PRs #914-#922 (the vitest-config migration). Without this
 * rule a future PR could hand-roll a vitest config that silently drifts
 * the merge order — exactly the systemic-flake cause documented in
 * `.claude/rules/testing.md` and surfaced empirically in #919's
 * `@pyreon/dnd` finding (silent 5s timeout under CI load).
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { LintConfig } from '../types'
import { vitestConfigUsesShared } from '../rules/architecture/vitest-config-uses-shared'
import { lintFile } from '../runner'
import { _resetProjectDepsCache } from '../utils/project-deps'

const ON: LintConfig = {
  rules: { 'pyreon/vitest-config-uses-shared': 'error' },
}

// This rule now gates on `isProjectDependency(filePath, '@pyreon/vitest-config')`
// so it never fires in a consumer project that can't install that PRIVATE
// package. The specs therefore run inside a temp project whose manifest DOES
// declare it (mirroring the monorepo, which self-depends). The relative
// `filePath` is preserved under the temp root so substring `exemptPaths`
// cases still match. A dedicated spec below asserts the consumer-silent path.
let tmpRoot: string
const tmpDirsToClean: string[] = []
beforeAll(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-lt9-vitest-')))
  fs.writeFileSync(
    path.join(tmpRoot, 'package.json'),
    JSON.stringify({ name: 'fixture', devDependencies: { '@pyreon/vitest-config': '*' } }),
  )
  tmpDirsToClean.push(tmpRoot)
})
afterAll(() => {
  for (const d of tmpDirsToClean) fs.rmSync(d, { recursive: true, force: true })
})
beforeEach(() => {
  _resetProjectDepsCache()
})

function lint(
  source: string,
  filePath: string,
  config: LintConfig = ON,
  root: string = tmpRoot,
) {
  const abs = path.join(root, filePath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, source)
  return lintFile(abs, source, [vitestConfigUsesShared], config)
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
    expect(diagIds(result)).not.toContain(
      'pyreon/vitest-config-uses-shared',
    )
  })

  it('does NOT fire when defineBrowserConfig is imported from @pyreon/vitest-config', () => {
    const result = lint(
      `import { playwright } from '@vitest/browser-playwright'
       import { defineBrowserConfig } from '@pyreon/vitest-config'
       export default defineBrowserConfig(playwright())`,
      'packages/some/pkg/vitest.browser.config.ts',
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/vitest-config-uses-shared',
    )
  })

  it('does NOT fire on non-vitest.config files', () => {
    const result = lint(
      `import { defineConfig } from 'vite'
       export default defineConfig({})`,
      'packages/some/pkg/vite.config.ts',
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/vitest-config-uses-shared',
    )
  })

  it('does NOT fire on src/ files even if they have similar imports', () => {
    const result = lint(
      `import { mergeConfig } from 'vite'
       export const config = mergeConfig({}, {})`,
      'packages/some/pkg/src/index.ts',
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/vitest-config-uses-shared',
    )
  })

  // ── exemptPaths ──────────────────────────────────────────────────────────
  it('does NOT fire when the path is exempt', () => {
    const config: LintConfig = {
      rules: {
        'pyreon/vitest-config-uses-shared': [
          'error',
          { exemptPaths: ['packages/legacy/'] },
        ],
      },
    }
    const result = lint(
      `import { defineConfig } from 'vitest/config'
       export default defineConfig({})`,
      'packages/legacy/pkg/vitest.config.ts',
      config,
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/vitest-config-uses-shared',
    )
  })

  // ── Consumer-project gate (the fix for the upstream 0.43.1 finding) ────────
  it('does NOT fire in a project that does not declare @pyreon/vitest-config', () => {
    // `@pyreon/vitest-config` is PRIVATE — a consumer can't install it, so
    // this error-level rule must be silent in a project that doesn't depend
    // on it. Point a fresh temp project (no such dep) at the same config.
    const consumer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-lt9-consumer-')))
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({ name: 'consumer-app', devDependencies: { vitest: '^3.0.0' } }),
    )
    tmpDirsToClean.push(consumer)
    const result = lint(
      `import { defineConfig } from 'vitest/config'
       export default defineConfig({})`,
      'vitest.config.ts',
      ON,
      consumer,
    )
    expect(diagIds(result)).not.toContain('pyreon/vitest-config-uses-shared')
  })
})
