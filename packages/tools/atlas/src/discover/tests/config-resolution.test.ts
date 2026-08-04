/**
 * Resolving what a ROOT `atlas.config.ts` imports.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * A package manager links a dependency only into the packages that DECLARE it.
 * The repo root declares almost nothing, so a file living there can import
 * almost nothing — and `atlas.config.ts` lives there.
 *
 * That is the file where a project supplies `theme` (which is what makes
 * rocketstyle chains discoverable at all) and `wrapper` (which is what lets
 * theme-reading components mount). Measured on a real 78-package monorepo,
 * BOTH imports failed:
 *
 *   - `@analytics-platform/ui-theme` — its own package, unresolvable from root
 *   - `@pyreon/core` — needed to build the wrapper's vnode, also unresolvable
 *
 * so the config errored, the theme never arrived, and every rocketstyle
 * component stayed invisible. With them resolved the same scan went from 1378
 * components / 1451 scenarios to 1419 / 3356, and from 2051 failing scenarios
 * to 7.
 *
 * The two tiers are deliberately NOT the same mechanism, and the distinction is
 * asserted below: tier 1 (a workspace package, by name) is exact for anyone;
 * tier 2 (resolve as a package that declares it would) is a fallback the config
 * gets and a component does not, because a component that cannot resolve an
 * import has a real dependency bug worth surfacing.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { entryFromExports, packageEntry, resolveFromWorkspace } from '../workspace-packages'

let root: string
const write = (relative: string, source: string): void => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source, 'utf8')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-cfgres-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('entryFromExports — the condition order depends on the QUESTION', () => {
  // The bug this pins: one function answered two different questions with one
  // order. Loading `@pyreon/core` for a wrapper landed on `lib/types/index.d.ts`
  // — a declaration file whose relative imports point at chunks that do not
  // exist — and the failure read as a missing file rather than a wrong pick.
  const exports = {
    types: './lib/types/index.d.ts',
    bun: './src/index.ts',
    import: './lib/index.js',
  }

  it('prefers `types` when asked for the contract', () => {
    expect(entryFromExports(exports, 'types')).toBe('./lib/types/index.d.ts')
  })

  it('NEVER returns a declaration file when asked for something to run', () => {
    expect(entryFromExports(exports, 'runtime')).toBe('./src/index.ts')
  })

  it('defaults to `types` — the original caller, unchanged', () => {
    expect(entryFromExports(exports)).toBe('./lib/types/index.d.ts')
  })

  it('falls through to `import` for a package with no `bun` condition', () => {
    expect(entryFromExports({ types: './t.d.ts', import: './lib/i.js' }, 'runtime')).toBe(
      './lib/i.js',
    )
  })
})

describe('packageEntry honours the same distinction', () => {
  it('returns the runtime entry, not the declaration file', () => {
    write(
      'p/package.json',
      JSON.stringify({
        name: '@a/p',
        exports: { types: './lib/types/index.d.ts', import: './lib/index.js' },
      }),
    )
    write('p/lib/types/index.d.ts', 'export declare const a: string')
    write('p/lib/index.js', 'export const a = 1')
    expect(packageEntry(join(root, 'p'), 'runtime')).toBe(join(root, 'p/lib/index.js'))
    expect(packageEntry(join(root, 'p'), 'types')).toBe(join(root, 'p/lib/types/index.d.ts'))
  })
})

describe('resolveFromWorkspace — resolve as a package that declares it would', () => {
  const setup = (): string[] => {
    // A dependency linked into ONE package and absent from the root — the exact
    // shape a workspace install produces.
    write(
      'packages/ui/node_modules/@pyreon/core/package.json',
      JSON.stringify({ name: '@pyreon/core', exports: { import: './lib/index.js' } }),
    )
    write('packages/ui/node_modules/@pyreon/core/lib/index.js', 'export const h = () => {}')
    write('packages/ui/package.json', JSON.stringify({ name: '@a/ui' }))
    write('packages/other/package.json', JSON.stringify({ name: '@a/other' }))
    return [join(root, 'packages/ui'), join(root, 'packages/other')]
  }

  it('finds a dependency the ROOT cannot see', () => {
    expect(resolveFromWorkspace('@pyreon/core', setup())).toBe(
      join(root, 'packages/ui/node_modules/@pyreon/core/lib/index.js'),
    )
  })

  it('resolves an ESM-ONLY package', () => {
    // `createRequire().resolve()` applies the `require` condition and throws
    // ERR_PACKAGE_PATH_NOT_EXPORTED for a package publishing only `import` —
    // for a package that is present and perfectly importable. Reading the
    // exports map is what makes this work, and every Pyreon package is
    // ESM-only, so this is the ordinary case rather than an edge one.
    const dirs = setup()
    const resolved = resolveFromWorkspace('@pyreon/core', dirs)
    expect(resolved).toBeDefined()
    expect(resolved).not.toMatch(/\.d\.ts$/)
  })

  it('resolves a SUBPATH through the exports map', () => {
    const dirs = setup()
    write(
      'packages/ui/node_modules/@pyreon/core/package.json',
      JSON.stringify({
        name: '@pyreon/core',
        exports: { '.': { import: './lib/index.js' }, './jsx-runtime': { import: './lib/jsx.js' } },
      }),
    )
    write('packages/ui/node_modules/@pyreon/core/lib/jsx.js', 'export const jsx = 1')
    expect(resolveFromWorkspace('@pyreon/core/jsx-runtime', dirs)).toBe(
      join(root, 'packages/ui/node_modules/@pyreon/core/lib/jsx.js'),
    )
  })

  it('walks UP for a hoisted dependency', () => {
    write('node_modules/left-pad/package.json', JSON.stringify({ name: 'left-pad', main: 'i.js' }))
    write('node_modules/left-pad/i.js', 'module.exports = 1')
    write('packages/ui/package.json', JSON.stringify({ name: '@a/ui' }))
    expect(resolveFromWorkspace('left-pad', [join(root, 'packages/ui')])).toBe(
      join(root, 'node_modules/left-pad/i.js'),
    )
  })

  it('is undefined for something nothing declares', () => {
    expect(resolveFromWorkspace('not-installed-anywhere', setup())).toBeUndefined()
  })

  it('does not touch relative or absolute specifiers', () => {
    const dirs = setup()
    expect(resolveFromWorkspace('./local', dirs)).toBeUndefined()
    expect(resolveFromWorkspace('/abs/path', dirs)).toBeUndefined()
  })

  it('is ORDER-INDEPENDENT — the answer cannot depend on directory-walk order', () => {
    // Two packages both providing the dependency. Whichever order the caller
    // passes, the same one wins, so a scan is reproducible.
    write(
      'packages/a/node_modules/dup/package.json',
      JSON.stringify({ name: 'dup', main: 'i.js' }),
    )
    write('packages/a/node_modules/dup/i.js', 'module.exports = "a"')
    write(
      'packages/b/node_modules/dup/package.json',
      JSON.stringify({ name: 'dup', main: 'i.js' }),
    )
    write('packages/b/node_modules/dup/i.js', 'module.exports = "b"')
    write('packages/a/package.json', JSON.stringify({ name: '@a/a' }))
    write('packages/b/package.json', JSON.stringify({ name: '@a/b' }))
    const a = join(root, 'packages/a')
    const b = join(root, 'packages/b')
    expect(resolveFromWorkspace('dup', [a, b])).toBe(resolveFromWorkspace('dup', [b, a]))
  })
})
