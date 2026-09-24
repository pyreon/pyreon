/**
 * How `pyreon doctor` decides which files it looks at.
 *
 * This is the module that exists because the whole thing failed once: in
 * a foreign workspace the scan roots were hardcoded to this repo's own
 * `packages/<cat>/<pkg>/src` shape, so every file-scanning gate found
 * ZERO files — and the aggregate still reported 100/100, Grade A. An
 * empty scan that reads as a clean pass is the worst answer a gate can
 * give, because it is indistinguishable from a healthy project.
 *
 * So every failure here is silent in the same way. A glob that fails to
 * match means a package is never audited; one that over-matches pulls
 * `node_modules` into the scan and the run takes minutes. Neither
 * reports anything.
 *
 * The pnpm parser is a hand-rolled reader over the one shape pnpm
 * documents — the class this repo's notes flag as bracket-arithmetic
 * prone. It has to find the packages it should and, just as importantly,
 * stop at the end of the block rather than swallowing the rest of the
 * file as globs.
 */
import { describe, expect, it } from 'vitest'
import {
  globMatchesDir,
  workspaceGlobsFromPackageJson,
  workspaceGlobsFromPnpmYaml,
} from '../doctor/utils/workspace-roots'
import {
  isAuditableSourceFile,
  isPackageConfigFile,
  isTestSourceFile,
} from '../doctor/utils/walk'

describe('workspace globs are read from either package.json shape', () => {
  it('reads the ARRAY form', () => {
    // The control.
    expect(workspaceGlobsFromPackageJson({ workspaces: ['packages/*'] }))
      .toEqual(['packages/*'])
  })

  it('reads the OBJECT form yarn uses', () => {
    // `{ workspaces: { packages: [...], nohoist: [...] } }`. Missing it
    // means a yarn monorepo scans nothing and scores 100.
    expect(workspaceGlobsFromPackageJson({
      workspaces: { packages: ['apps/*', 'libs/*'], nohoist: ['**/x'] },
    })).toEqual(['apps/*', 'libs/*'])
  })

  it('drops non-string entries rather than passing them downstream', () => {
    // A number or an object in that array becomes a path join against
    // `undefined` several layers later.
    expect(workspaceGlobsFromPackageJson({ workspaces: ['ok', 42, null, { a: 1 }] }))
      .toEqual(['ok'])
  })

  for (const [label, pkg] of [
    ['no workspaces key', {}],
    ['an empty array', { workspaces: [] }],
    ['an empty packages list', { workspaces: { packages: [] } }],
    ['a string instead of a list', { workspaces: 'packages/*' }],
    ['null', { workspaces: null }],
    ['an object with no packages', { workspaces: { nohoist: ['x'] } }],
  ] as Array<[string, Record<string, unknown>]>) {
    it(`returns NULL for ${label}`, () => {
      // Null means "not a workspace" and the caller falls back to
      // scanning the single project. An empty ARRAY would mean "a
      // workspace with no members", i.e. scan nothing — which is the
      // 100/100 bug.
      expect(workspaceGlobsFromPackageJson(pkg), label).toBeNull()
    })
  }
})

describe('the pnpm-workspace.yaml reader', () => {
  it('reads bare and quoted entries', () => {
    expect(workspaceGlobsFromPnpmYaml(
      "packages:\n  - packages/*\n  - 'apps/*'\n  - \"libs/*\"\n",
    )).toEqual(['packages/*', 'apps/*', 'libs/*'])
  })

  it('STOPS at the end of the packages block', () => {
    // A key at column 0 ends it. Swallowing the rest of the file turns
    // every later setting into a scan glob, and the run then walks
    // directories nobody asked for.
    expect(workspaceGlobsFromPnpmYaml(
      'packages:\n  - packages/*\nshamefullyHoist: true\nother:\n  - not-a-package\n',
    )).toEqual(['packages/*'])
  })

  it('ignores a leading comment and blank lines', () => {
    expect(workspaceGlobsFromPnpmYaml(
      '# a comment\n\npackages:\n\n  - packages/*\n\n',
    )).toEqual(['packages/*'])
  })

  it('returns NULL when there is no packages key', () => {
    expect(workspaceGlobsFromPnpmYaml('shamefullyHoist: true\n')).toBeNull()
    expect(workspaceGlobsFromPnpmYaml('')).toBeNull()
  })

  it('returns NULL for an EMPTY packages block', () => {
    // Same distinction as above: no globs means "not a workspace", not
    // "a workspace with nothing in it".
    expect(workspaceGlobsFromPnpmYaml('packages:\nother: 1\n')).toBeNull()
  })
})

describe('globMatchesDir', () => {
  it('matches a literal path and a single-segment star', () => {
    expect(globMatchesDir('packages/core', 'packages/core')).toBe(true)
    expect(globMatchesDir('packages/*', 'packages/core')).toBe(true)
  })

  it('does NOT let a single star cross a separator', () => {
    // `packages/*` must not match `packages/core/reactivity`, or a
    // two-level layout is scanned twice and every finding is doubled.
    expect(globMatchesDir('packages/*', 'packages/core/reactivity')).toBe(false)
  })

  it('lets ** cross any number of segments, including zero', () => {
    expect(globMatchesDir('packages/**', 'packages')).toBe(true)
    expect(globMatchesDir('packages/**', 'packages/a')).toBe(true)
    expect(globMatchesDir('packages/**', 'packages/a/b/c')).toBe(true)
  })

  it('matches a ** in the MIDDLE', () => {
    expect(globMatchesDir('packages/**/src', 'packages/a/b/src')).toBe(true)
    expect(globMatchesDir('packages/**/src', 'packages/src')).toBe(true)
    expect(globMatchesDir('packages/**/src', 'packages/a/src/x')).toBe(false)
  })

  it('does not match a shorter or longer path', () => {
    expect(globMatchesDir('packages/*', 'packages')).toBe(false)
    expect(globMatchesDir('packages/*/src', 'packages/a')).toBe(false)
  })

  it('normalises backslashes and trailing slashes', () => {
    // A Windows path or a config entry written `packages/*/`. Failing to
    // normalise means the whole workspace scans nothing on Windows.
    expect(globMatchesDir('packages\\*', 'packages/core')).toBe(true)
    expect(globMatchesDir('packages/*/', 'packages/core')).toBe(true)
    expect(globMatchesDir('packages/*', 'packages/core/')).toBe(true)
  })

  it('handles a MANY-SLASH path without going quadratic', () => {
    // The normalisation is a linear char-walk rather than an
    // end-anchored `/\/+$/`, which CodeQL flags as polynomial on
    // adversarial input — and these globs come from a repo's own files.
    const started = Date.now()
    expect(globMatchesDir(`packages/*${'/'.repeat(50_000)}`, 'packages/core')).toBe(true)
    expect(Date.now() - started, 'must be linear').toBeLessThan(2000)
  })
})

describe('which files count as auditable source', () => {
  it('accepts the source extensions', () => {
    for (const f of ['/p/src/a.ts', '/p/src/a.tsx', '/p/src/a.js', '/p/src/a.jsx']) {
      expect(isAuditableSourceFile(f), f).toBe(true)
    }
  })

  it('rejects a declaration file', () => {
    // A `.d.ts` has no runtime behaviour to audit, and every ambient
    // declaration would produce noise.
    expect(isAuditableSourceFile('/p/src/types.d.ts')).toBe(false)
  })

  it('rejects a FIXTURE directory', () => {
    // Detector fixtures hold anti-patterns deliberately. Auditing them
    // reports the repo's own test data as findings.
    expect(isAuditableSourceFile('/p/src/__fixtures__/bad.ts')).toBe(false)
    expect(isAuditableSourceFile('/p/src/fixtures/bad.ts')).toBe(false)
  })

  it('rejects a non-source extension', () => {
    for (const f of ['/p/src/a.md', '/p/src/a.json', '/p/src/a.css', '/p/src/README']) {
      expect(isAuditableSourceFile(f), f).toBe(false)
    }
  })

  it('classifies test files separately from source', () => {
    // Some rules are ABOUT test files and some must never see them; one
    // predicate answering for both is how a rule ends up scanning
    // nothing (or everything).
    expect(isTestSourceFile('/p/src/a.test.ts')).toBe(true)
    expect(isTestSourceFile('/p/src/a.spec.tsx')).toBe(true)
    expect(isTestSourceFile('/p/src/tests/a.ts')).toBe(true)
    expect(isTestSourceFile('/p/src/a.ts')).toBe(false)
  })

  it('recognises a package config file', () => {
    expect(isPackageConfigFile('/p/vitest.config.ts')).toBe(true)
    expect(isPackageConfigFile('/p/src/a.ts')).toBe(false)
  })
})
