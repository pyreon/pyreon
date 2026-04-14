import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
// Importing across packages by path: the helper lives at the repo root
// in `vitest.browser.ts`, alongside `vitest.shared.ts`. The relative
// path is stable because both files have shipped together since the
// browser-test infrastructure landed.
import { resolveTslibEsmEntry, tslibBrowserAlias } from '../../../../../vitest.browser'

// Tests for the `tslibBrowserAlias()` / `resolveTslibEsmEntry()` shared
// helpers used by `vitest.browser.config.ts` files in packages whose
// transitive deps include `tslib` (e.g. @pyreon/charts → echarts).
//
// Why this needs tests: the helper has branching logic (10-level walk
// up node_modules, createRequire fallback against echarts, no-op return
// when tslib isn't found). The happy path was empirically verified in
// PR #245, but the other branches (hoisted layout, missing tslib,
// malformed package.json) had no coverage. A future refactor of the
// helper could break a branch silently.

describe('resolveTslibEsmEntry', () => {
  it('returns the path to tslib.es6.js when tslib is hoisted in node_modules', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tslib-helper-hoisted-'))
    try {
      const tslibDir = path.join(dir, 'node_modules', 'tslib')
      mkdirSync(tslibDir, { recursive: true })
      writeFileSync(path.join(tslibDir, 'tslib.es6.js'), 'export function __extends(){}')

      const found = resolveTslibEsmEntry(dir)
      expect(found).toBe(path.join(tslibDir, 'tslib.es6.js'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('walks up to a parent node_modules (npm hoist target several dirs above)', () => {
    // pnpm/npm with hoisting can place tslib several levels above the
    // calling package — typically at the workspace root. Helper must
    // walk up to find it.
    const root = mkdtempSync(path.join(tmpdir(), 'tslib-helper-deep-'))
    try {
      const tslibDir = path.join(root, 'node_modules', 'tslib')
      mkdirSync(tslibDir, { recursive: true })
      writeFileSync(path.join(tslibDir, 'tslib.es6.js'), 'export function __extends(){}')

      // Caller is 5 directories deep — same shape as
      // `<root>/packages/fundamentals/charts/src/tests/`.
      const callerDir = path.join(root, 'packages', 'fundamentals', 'charts', 'src', 'tests')
      mkdirSync(callerDir, { recursive: true })

      const found = resolveTslibEsmEntry(callerDir)
      expect(found).toBe(path.join(tslibDir, 'tslib.es6.js'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns null when tslib is not installed anywhere on the path', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tslib-helper-missing-'))
    try {
      // Create an empty fixture with no tslib.
      mkdirSync(path.join(dir, 'src'), { recursive: true })
      const found = resolveTslibEsmEntry(path.join(dir, 'src'))
      expect(found).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null when only a partial tslib install exists (package.json present but tslib.es6.js missing)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tslib-helper-partial-'))
    try {
      const tslibDir = path.join(dir, 'node_modules', 'tslib')
      mkdirSync(tslibDir, { recursive: true })
      writeFileSync(path.join(tslibDir, 'package.json'), JSON.stringify({ name: 'tslib' }))
      // No tslib.es6.js file — install was corrupted or partial.

      const found = resolveTslibEsmEntry(dir)
      expect(found).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('finds tslib via createRequire(echarts) when called from @pyreon/charts package', () => {
    // Real-world Pyreon worktree case: tslib is nested inside
    // `node_modules/.bun/echarts@x.y.z/node_modules/tslib/` rather than
    // hoisted. The helper falls back to resolving via echarts.
    // Called from @pyreon/charts (which has echarts as a direct dep),
    // the createRequire fallback should find it.
    const here = path.dirname(fileURLToPath(import.meta.url))
    const chartsDir = path.resolve(here, '../../../../fundamentals/charts')
    const found = resolveTslibEsmEntry(chartsDir)
    expect(found).toBeTruthy()
    expect(found).toMatch(/tslib[\\/]tslib\.es6\.js$/)
  })
})

describe('tslibBrowserAlias', () => {
  it('returns { tslib: <path> } when called from a directory where tslib is reachable', () => {
    // Construct an `import.meta.url`-shaped URL pointing at @pyreon/charts
    // (which has echarts as a direct dep, so tslib is reachable via
    // the createRequire fallback). Called from this test file's own
    // directory, tslib is NOT reachable because @pyreon/test-utils
    // doesn't depend on echarts — that case is covered by the no-op
    // fallback test below.
    const here = path.dirname(fileURLToPath(import.meta.url))
    const chartsConfigPath = path.resolve(
      here,
      '../../../../fundamentals/charts/vitest.browser.config.ts',
    )
    const url = pathToFileURL(chartsConfigPath).href
    const alias = tslibBrowserAlias(url)
    expect(alias).toHaveProperty('tslib')
    expect(alias.tslib).toMatch(/tslib[\\/]tslib\.es6\.js$/)
  })

  it('returns {} when tslib cannot be resolved (consumer-safe no-op)', () => {
    // Manufacture an `import.meta.url`-shaped file URL pointing at a
    // tmpdir with no tslib anywhere. The helper must NOT throw.
    const dir = mkdtempSync(path.join(tmpdir(), 'tslib-alias-empty-'))
    try {
      mkdirSync(path.join(dir, 'src'), { recursive: true })
      const fakeFile = path.join(dir, 'src', 'fake.config.ts')
      writeFileSync(fakeFile, '// fake')
      const fakeUrl = pathToFileURL(fakeFile).href
      const alias = tslibBrowserAlias(fakeUrl)
      expect(alias).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// Regression guard: charts' vitest.browser.config.ts MUST use the helper.
// If a future PR accidentally inlines a hardcoded path or removes the
// alias entirely, this test catches it before the canvas tests fail
// downstream.
describe('@pyreon/charts vitest.browser.config integration', () => {
  it('imports and uses tslibBrowserAlias from the shared helper', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const configPath = path.resolve(
      here,
      '../../../../fundamentals/charts/vitest.browser.config.ts',
    )
    const source = readFileSync(configPath, 'utf8')

    // Asserts the import + the use site. Two separate matches so a
    // partial removal (import without use, or use without import)
    // surfaces clearly.
    expect(source).toMatch(/import\s*\{[^}]*tslibBrowserAlias[^}]*\}\s*from\s*['"][^'"]+vitest\.browser['"]/)
    expect(source).toMatch(/tslibBrowserAlias\s*\(\s*import\.meta\.url\s*\)/)
  })
})
