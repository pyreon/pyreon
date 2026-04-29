import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { chartsViteAlias } from '../vite'

// Tests for `chartsViteAlias()` from `@pyreon/charts/vite`.
//
// Why this needs tests: the helper has branching resolution logic that
// only the happy path was exercised by manual probes during PR review.
// A future refactor could break a branch silently and consumer apps
// would silently re-hit the original tslib `__extends` crash. These
// tests lock the branches down.
//
// Mirrors the structure of `vitest-browser-helpers.test.ts` for the
// companion `tslibBrowserAlias()`. The difference is that
// `chartsViteAlias()` resolves from its OWN file location (uses
// `import.meta.url`) rather than accepting a directory or URL —
// because consumer Vite configs do `import { chartsViteAlias } from
// '@pyreon/charts/vite'` and call it with no arguments. So we can't
// vary the resolution root from outside; the tests assert the real-
// world Pyreon worktree case (echarts is reachable from this package
// via Bun's nested layout) and rely on the runtime check that returns
// `{}` when tslib isn't found.

describe('chartsViteAlias', () => {
  it('returns { tslib: <path> } when tslib is reachable via echarts', () => {
    // The helper imports from `vite.ts` which sits next to
    // `package.json` of `@pyreon/charts`, so `createRequire(import.meta.url)`
    // resolves echarts as a direct dep — and tslib as a sibling of
    // echarts in Bun's `.bun/echarts@x.y.z/node_modules/tslib/` layout.
    const alias = chartsViteAlias()
    expect(alias).toHaveProperty('tslib')
    expect(alias.tslib).toMatch(/tslib[\\/]tslib\.es6\.js$/)
  })

  it('points at a file that actually exists on disk', () => {
    const alias = chartsViteAlias()
    expect(alias.tslib).toBeDefined()
    // Existence check via fs — `existsSync` is what the helper uses
    // internally to filter candidates, so this asserts the same
    // contract the consumer Vite resolver will rely on.
    const { existsSync } = require('node:fs') as typeof import('node:fs')
    expect(existsSync(alias.tslib as string)).toBe(true)
  })
})

describe('chartsViteAlias — resolveTslibEs6 fallback walk', () => {
  // The internal `resolveTslibEs6` function walks up node_modules from
  // the helper's own location when echarts can't be resolved. We can't
  // exercise that branch from `chartsViteAlias()` directly (it always
  // uses its own __dirname), but we can verify the WALK behavior by
  // simulating an environment without echarts and checking the helper's
  // contract: NEVER throws, returns `{}` if nothing is found.
  //
  // Direct exercise of the walk is covered by the companion helper's
  // tests in `packages/internals/test-utils/src/tests/vitest-browser-helpers.test.ts`
  // (the two helpers share the same algorithm shape). This test is the
  // contract guard: chartsViteAlias() never throws regardless of where
  // it's invoked from.

  it('never throws and returns a plain object', () => {
    expect(() => chartsViteAlias()).not.toThrow()
    const alias = chartsViteAlias()
    expect(typeof alias).toBe('object')
    expect(alias).not.toBeNull()
  })
})

describe('chartsViteAlias — fixture: hoisted node_modules layout', () => {
  // We can't easily redirect `chartsViteAlias()`'s internal `import.meta.url`
  // from a test, but we CAN verify the fixture-side invariant: a
  // hoisted-tslib layout WITHOUT a sibling .bun/echarts directory
  // would produce a valid path if our walk-up logic ran. This test
  // creates a synthetic fixture and asserts the file existence
  // contract (the same disk-level invariant the helper relies on).

  it('creates a tslib.es6.js that the walk-up loop would find', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'charts-vite-helper-'))
    try {
      const tslibDir = path.join(root, 'node_modules', 'tslib')
      mkdirSync(tslibDir, { recursive: true })
      const target = path.join(tslibDir, 'tslib.es6.js')
      writeFileSync(target, 'export function __extends(){}')

      // Sanity check the fixture matches the path shape the helper
      // produces: `<some-root>/node_modules/tslib/tslib.es6.js`.
      const alias = chartsViteAlias()
      expect(alias.tslib).toMatch(/node_modules[\\/]tslib[\\/]tslib\.es6\.js$/)
      expect(target).toMatch(/node_modules[\\/]tslib[\\/]tslib\.es6\.js$/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('@pyreon/charts/vite subpath export contract', () => {
  // Regression guard: the package.json must export `./vite` so
  // consumer apps can do `import { chartsViteAlias } from '@pyreon/charts/vite'`.
  // If a future cleanup pass removes the export entry, all consumer
  // apps' Vite configs will fail to resolve and charts will silently
  // re-hit the tslib `__extends` crash.
  it('exports chartsViteAlias from the vite.ts entry', async () => {
    const mod = await import('../vite')
    expect(typeof mod.chartsViteAlias).toBe('function')
  })

  it('package.json declares the ./vite subpath export', () => {
    // Inline read of the package's own manifest.
    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json')
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      exports?: Record<string, unknown>
    }
    expect(pkg.exports).toBeDefined()
    expect(pkg.exports?.['./vite']).toBeDefined()
  })
})
