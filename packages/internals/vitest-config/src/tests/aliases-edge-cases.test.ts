/**
 * The shapes `buildAliases` defends against, which the real repo never has.
 *
 * `aliases.test.ts` runs the builder against the ACTUAL monorepo, and that is
 * the right test for the contract it locks (every exported subpath is aliased,
 * ordered before its parent). But it can only ever exercise the shapes this
 * repo happens to contain — every package here has a well-formed manifest, a
 * `@pyreon/` name and real `exports` targets, so the builder's defensive arms
 * are unreachable BY CONSTRUCTION. They sat uncovered for that reason, not
 * because they were untestable.
 *
 * A synthetic package tree reaches them, and each case below is a shape a
 * consumer's workspace can genuinely hold: a scratch file beside the package
 * dirs, a half-written manifest, a `./*` subpath wildcard, an `exports` entry
 * pointing at a `.json` preset or a file that was deleted.
 *
 * The behaviour under test is that every one of these is SKIPPED rather than
 * throwing — `buildAliases` walks the whole workspace at config-load time, so
 * one malformed manifest anywhere must not take down every test run in the
 * repo.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildAliases } from '../aliases'

let root = ''

/** Write `packages/<category>/<dir>/package.json` (and any extra source files). */
function pkg(
  category: string,
  dir: string,
  manifest: unknown,
  files: Record<string, string> = {},
): string {
  const d = join(root, 'packages', category, dir)
  mkdirSync(d, { recursive: true })
  if (manifest !== undefined) {
    writeFileSync(
      join(d, 'package.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    )
  }
  for (const [rel, body] of Object.entries(files)) {
    const p = join(d, rel)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, body)
  }
  return d
}

const finds = (): string[] => buildAliases(root).map((a) => String(a.find))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-aliases-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('a workspace with no packages/ directory at all', () => {
  it('returns an empty map instead of throwing', () => {
    expect(buildAliases(root)).toEqual([])
  })
})

describe('entries that are not package directories', () => {
  it('skips a loose FILE sitting where a category directory would be', () => {
    mkdirSync(join(root, 'packages'), { recursive: true })
    writeFileSync(join(root, 'packages', '.DS_Store'), 'not a directory')
    pkg('core', 'real', { name: '@pyreon/real' }, { 'src/index.ts': '' })
    expect(finds()).toEqual(['@pyreon/real'])
  })

  it('skips a loose FILE sitting where a package directory would be', () => {
    pkg('core', 'real', { name: '@pyreon/real' }, { 'src/index.ts': '' })
    writeFileSync(join(root, 'packages', 'core', 'README.md'), '# notes')
    expect(finds()).toEqual(['@pyreon/real'])
  })

  it('skips a directory with no package.json', () => {
    mkdirSync(join(root, 'packages', 'core', 'empty'), { recursive: true })
    expect(buildAliases(root)).toEqual([])
  })
})

describe('manifests the builder must not choke on', () => {
  it('skips a MALFORMED package.json without throwing', () => {
    // The load-bearing case: this runs at vitest config load, so a throw here
    // takes down every suite in the repo, not just this package's.
    pkg('core', 'broken', '{ "name": "@pyreon/broken", ')
    pkg('core', 'real', { name: '@pyreon/real' }, { 'src/index.ts': '' })
    expect(() => buildAliases(root)).not.toThrow()
    expect(finds()).toEqual(['@pyreon/real'])
  })

  it('skips a manifest with no name field', () => {
    pkg('core', 'anon', { version: '1.0.0' }, { 'src/index.ts': '' })
    expect(buildAliases(root)).toEqual([])
  })

  it('skips a package outside the @pyreon scope', () => {
    pkg('core', 'other', { name: 'lodash' }, { 'src/index.ts': '' })
    expect(buildAliases(root)).toEqual([])
  })
})

describe('exports entries that cannot become a static alias', () => {
  it('skips ./package.json and wildcard subpaths', () => {
    pkg(
      'core',
      'a',
      {
        name: '@pyreon/a',
        exports: {
          '.': './src/index.ts',
          './package.json': './package.json',
          './*': './src/*.ts',
        },
      },
      { 'src/index.ts': '' },
    )
    // Both non-aliasable keys are dropped; only the root entry survives.
    expect(finds()).toEqual(['@pyreon/a'])
  })

  it('skips an entry whose value resolves to nothing', () => {
    pkg(
      'core',
      'a',
      { name: '@pyreon/a', exports: { '.': './src/index.ts', './dead': null } },
      { 'src/index.ts': '' },
    )
    expect(finds()).toEqual(['@pyreon/a'])
  })

  it('skips a non-TypeScript target such as a .json preset', () => {
    pkg(
      'core',
      'a',
      { name: '@pyreon/a', exports: { '.': './src/index.ts', './base': './base.json' } },
      { 'src/index.ts': '', 'base.json': '{}' },
    )
    expect(finds()).toEqual(['@pyreon/a'])
  })

  it('skips a target that does not exist on disk', () => {
    pkg(
      'core',
      'a',
      { name: '@pyreon/a', exports: { '.': './src/index.ts', './gone': './src/gone.ts' } },
      { 'src/index.ts': '' },
    )
    expect(finds()).toEqual(['@pyreon/a'])
  })
})

describe('condition resolution', () => {
  it('prefers bun, then import, then default', () => {
    pkg(
      'core',
      'a',
      {
        name: '@pyreon/a',
        exports: {
          '.': { bun: './src/index.ts', import: './lib/index.js' },
          './second': { import: './src/second.ts' },
          './third': { default: './src/third.ts' },
        },
      },
      { 'src/index.ts': '', 'src/second.ts': '', 'src/third.ts': '' },
    )
    const map = new Map(buildAliases(root).map((a) => [String(a.find), String(a.replacement)]))
    // `bun` wins over `import` — resolving to lib/ is the bug this map exists
    // to prevent, and `import` usually points there.
    expect(map.get('@pyreon/a')?.endsWith('/src/index.ts')).toBe(true)
    expect(map.get('@pyreon/a/second')?.endsWith('/src/second.ts')).toBe(true)
    expect(map.get('@pyreon/a/third')?.endsWith('/src/third.ts')).toBe(true)
  })
})

describe('the no-exports fallback', () => {
  it('falls back to src/index.ts when the manifest declares no exports', () => {
    pkg('core', 'a', { name: '@pyreon/a' }, { 'src/index.ts': '' })
    expect(finds()).toEqual(['@pyreon/a'])
  })

  it('adds a root alias when exports declare only SUBPATHS', () => {
    pkg(
      'core',
      'a',
      { name: '@pyreon/a', exports: { './sub': './src/sub.ts' } },
      { 'src/index.ts': '', 'src/sub.ts': '' },
    )
    // Subpath first, then the synthesised root — the ordering contract.
    expect(finds()).toEqual(['@pyreon/a/sub', '@pyreon/a'])
  })

  it('adds NO root alias when there is no src/index.ts to fall back to', () => {
    pkg('core', 'a', { name: '@pyreon/a', exports: { './sub': './src/sub.ts' } }, { 'src/sub.ts': '' })
    expect(finds()).toEqual(['@pyreon/a/sub'])
  })
})
