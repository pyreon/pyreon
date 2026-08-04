/**
 * `loom.devPaths` — the project declaring what is NOT shipping source.
 *
 * Loom classifies imports by surface: shipping source drives `phantom-dep`
 * and `prod-import-of-dev-dep` (both about what a CONSUMER receives), while
 * the dev surface only proves a dependency is used. It infers that surface
 * from path shape — tests, configs, scripts — which covers the common cases
 * and cannot cover a repo's own build conventions.
 *
 * The motivating case, measured on this monorepo: every package's
 * `src/manifest.ts` imports `@pyreon/manifest` at RUNTIME to feed gen-docs,
 * and `scripts/publish.ts` calls `stripSrcFromFiles`, so `src/` never reaches
 * a tarball. Loom was right by its own rules and wrong about the world —
 * 55 of the repo's 60 non-example gating warnings were that one convention,
 * which nothing in any manifest states.
 *
 * Declaring it takes the repo from 73 gating warnings to 18, with all 166
 * `unused-dep` findings byte-identically intact.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildReport, matchesPathGlob, scanPackageImports } from '../core'

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

/** A one-package workspace; `loom` is the root manifest's loom config. */
function workspace(
  files: Record<string, string>,
  pkgJson: Record<string, unknown> = {},
  loom?: Record<string, unknown>,
): string {
  const root = mkdtempSync(join(tmpdir(), 'loom-devpaths-'))
  roots.push(root)
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'r', workspaces: ['p/*'], ...(loom ? { loom } : {}) }),
  )
  mkdirSync(join(root, 'p/a/src'), { recursive: true })
  writeFileSync(
    join(root, 'p/a/package.json'),
    JSON.stringify({ name: 'a', version: '1.0.0', private: true, ...pkgJson }),
  )
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, 'p/a', rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

describe('matchesPathGlob', () => {
  it('matches an exact path and rejects a near miss', () => {
    expect(matchesPathGlob('src/manifest.ts', 'src/manifest.ts')).toBe(true)
    expect(matchesPathGlob('src/manifest.tsx', 'src/manifest.ts')).toBe(false)
    expect(matchesPathGlob('src/deep/manifest.ts', 'src/manifest.ts')).toBe(false)
  })

  it('`*` stays inside ONE segment', () => {
    expect(matchesPathGlob('src/gen.ts', 'src/*.ts')).toBe(true)
    // The whole point of segment-wise matching: a single star must not cross
    // a separator, or `src/*` would swallow the entire subtree.
    expect(matchesPathGlob('src/deep/gen.ts', 'src/*.ts')).toBe(false)
    expect(matchesPathGlob('src/deep/gen.ts', 'src/*/*.ts')).toBe(true)
  })

  it('`**` matches any depth INCLUDING zero', () => {
    expect(matchesPathGlob('manifest.ts', '**/manifest.ts')).toBe(true)
    expect(matchesPathGlob('src/manifest.ts', '**/manifest.ts')).toBe(true)
    expect(matchesPathGlob('a/b/c/manifest.ts', '**/manifest.ts')).toBe(true)
    expect(matchesPathGlob('src/other.ts', '**/manifest.ts')).toBe(false)
  })

  it('`**` works mid-pattern and as a trailing subtree', () => {
    expect(matchesPathGlob('src/a/b/x.gen.ts', 'src/**/*.gen.ts')).toBe(true)
    expect(matchesPathGlob('src/x.gen.ts', 'src/**/*.gen.ts')).toBe(true)
    expect(matchesPathGlob('src/anything/at/all.ts', 'src/**')).toBe(true)
    expect(matchesPathGlob('other/x.ts', 'src/**')).toBe(false)
  })

  it('regex metacharacters in a segment are literal, not a pattern', () => {
    expect(matchesPathGlob('src/a.b.ts', 'src/a.b.ts')).toBe(true)
    // `.` must not behave as "any char" — that would make near-misses match.
    expect(matchesPathGlob('src/axb.ts', 'src/a.b.ts')).toBe(false)
    expect(matchesPathGlob('src/a+b.ts', 'src/a+b.ts')).toBe(true)
  })
})

describe('loom.devPaths routes a declared file off the shipping surface', () => {
  it('a devPaths file lands in the dev bucket, not prod', () => {
    const root = workspace({
      'src/manifest.ts': `import { defineManifest } from '@scope/manifest'\nexport default defineManifest({})`,
      'src/index.ts': `import { real } from 'runtime-pkg'\nexport const x = real`,
    })
    const scan = scanPackageImports(join(root, 'p/a'), root, ['src/manifest.ts'])
    expect([...scan.dev.keys()]).toEqual(['@scope/manifest'])
    expect([...scan.prod.keys()]).toEqual(['runtime-pkg'])
  })

  it('end to end: the manifest-file shape stops being prod-import-of-dev-dep', () => {
    const files = {
      'src/manifest.ts': `import { defineManifest } from '@scope/manifest'\nexport default defineManifest({})`,
    }
    const pkg = { devDependencies: { '@scope/manifest': '^1.0.0' } }

    const without = buildReport(workspace(files, pkg))
    expect(without.issues.filter((i) => i.code === 'prod-import-of-dev-dep')).toHaveLength(1)

    const with_ = buildReport(workspace(files, pkg, { devPaths: ['src/manifest.ts'] }))
    expect(with_.issues.filter((i) => i.code === 'prod-import-of-dev-dep')).toHaveLength(0)
  })

  it('a declared path still counts as USED — no unused-dep is manufactured', () => {
    // The regression this feature could most easily introduce. Moving a file
    // off the shipping surface must not make its dependency look dead; the dev
    // bucket is evidence of use, which is exactly why devPaths extends the
    // dev-surface classifier instead of dropping the file from the scan.
    const report = buildReport(
      workspace(
        { 'src/manifest.ts': `import { defineManifest } from '@scope/manifest'\nexport default defineManifest({})` },
        { dependencies: { '@scope/manifest': '^1.0.0' } },
        { devPaths: ['src/manifest.ts'] },
      ),
    )
    expect(report.issues.filter((i) => i.code === 'unused-dep')).toHaveLength(0)
  })

  it('an undeclared runtime import in shipping source is still reported', () => {
    // The control. A config that quietly disarmed the detector would be worse
    // than the false positives it set out to remove.
    const report = buildReport(
      workspace(
        {
          'src/manifest.ts': `import { defineManifest } from '@scope/manifest'\nexport default defineManifest({})`,
          'src/index.ts': `import { x } from 'never-declared'\nexport const y = x`,
        },
        { devDependencies: { '@scope/manifest': '^1.0.0' } },
        { devPaths: ['src/manifest.ts'] },
      ),
    )
    expect(report.issues.filter((i) => i.code === 'phantom-dep').map((i) => i.dep)).toEqual([
      'never-declared',
    ])
  })

  it('globs apply across packages, not just an exact file', () => {
    const report = buildReport(
      workspace(
        { 'src/codegen/tables.gen.ts': `import { g } from '@scope/gen'\nexport const t = g` },
        { devDependencies: { '@scope/gen': '^1.0.0' } },
        { devPaths: ['**/*.gen.ts'] },
      ),
    )
    expect(report.issues.filter((i) => i.code === 'prod-import-of-dev-dep')).toHaveLength(0)
  })
})

describe('loom.devPaths validation', () => {
  const bad = (value: unknown): (() => unknown) => () =>
    buildReport(workspace({ 'src/i.ts': 'export const x = 1' }, {}, { devPaths: value }))

  it('a non-array is a loud error, not a silently-ignored config', () => {
    // Same rule as `loom.ignore`: a suppression that quietly does nothing is
    // worse than none, because the project believes it is configured.
    expect(bad('src/manifest.ts')).toThrow(/devPaths` must be an array/)
  })

  it('a non-string entry is named as the problem too', () => {
    expect(bad(['ok', 42])).toThrow(/devPaths` must be an array/)
  })

  it('omitting it entirely changes nothing', () => {
    const report = buildReport(workspace({ 'src/i.ts': 'export const x = 1' }))
    expect(report.issues.filter((i) => i.code === 'phantom-dep')).toHaveLength(0)
  })
})
