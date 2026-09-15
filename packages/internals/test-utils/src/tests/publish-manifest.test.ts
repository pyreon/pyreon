import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { classifyPublishFailure } from '../../../../../scripts/publish-classify'
import {
  orphanedByPublishStrip,
  packageBuildsToLib,
  publishedFiles,
  stripSrcFromFiles,
} from '../../../../../scripts/strip-bun-condition'

function findRepoRoot(from: string): string {
  let dir = from
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, '.changeset', 'config.json'))) return dir
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  throw new Error('repo root not found')
}
const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const readPkg = (rel: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, rel, 'package.json'), 'utf8')) as Record<string, unknown>

// ---------------------------------------------------------------------------
// `src` stripping is only valid for a package that BUILDS to `lib/`.
//
// The two Kotlin runtimes SHIP SOURCE: a scaffolded Android app adds
// `node_modules/@pyreon/native-runtime-kotlin/src/main/kotlin` as a Gradle
// `srcDir`. Stripping `src` from their `files` left a 3-file tarball
// (package.json + README + LICENSE) — verified with `npm pack --dry-run`.
// ---------------------------------------------------------------------------
describe('packageBuildsToLib', () => {
  it('is TRUE for a package whose exports point at lib/', () => {
    expect(packageBuildsToLib({ exports: { '.': { bun: './src/index.ts', import: './lib/index.js' } } })).toBe(true)
  })

  it('is TRUE for a bare `main` pointing at lib/', () => {
    expect(packageBuildsToLib({ main: './lib/index.js' })).toBe(true)
  })

  it('is TRUE for a `bin` pointing at lib/ (a CLI with no exports map)', () => {
    expect(packageBuildsToLib({ bin: { 'pyreon-x': './lib/cli.js' } })).toBe(true)
  })

  it('is FALSE for a source-shipping package — no main, no exports, no JS at all', () => {
    expect(packageBuildsToLib({})).toBe(false)
  })

  it('is FALSE when the only entry points at src/ (nothing is built)', () => {
    expect(packageBuildsToLib({ main: './src/index.ts' })).toBe(false)
  })
})

describe('publishedFiles', () => {
  it('drops `src` from a lib/-building package', () => {
    expect(
      publishedFiles({
        files: ['lib', 'src', 'README.md'],
        exports: { '.': { import: './lib/index.js' } },
      }),
    ).toEqual(['lib', 'README.md'])
  })

  it('KEEPS `src` for a source-shipping package', () => {
    expect(publishedFiles({ files: ['src', 'README.md', 'LICENSE'] })).toEqual([
      'src',
      'README.md',
      'LICENSE',
    ])
  })

  it('leaves the SwiftPM `Sources` convention alone either way', () => {
    // The Swift twins escaped the pre-fix unconditional strip only because
    // `stripSrcFromFiles` does not match `Sources` — an accident, not a rule.
    expect(stripSrcFromFiles(['Package.swift', 'Sources', 'README.md'])).toEqual([
      'Package.swift',
      'Sources',
      'README.md',
    ])
  })
})

describe('orphanedByPublishStrip', () => {
  it('flags a native source dir the strip would remove', () => {
    expect(
      orphanedByPublishStrip({
        name: '@x/kotlin',
        files: ['src', 'README.md'],
        // With no entry points this package does not build to lib/ — but if a
        // future edit made it look like it does, the strip would orphan the
        // Gradle srcDir. Model that here by giving it a lib/ entry.
        main: './lib/index.js',
        pyreon: { native: { kotlin: { dir: 'src/main/kotlin' } } },
      }),
    ).toEqual(['src/main/kotlin'])
  })

  it('is silent for the real source-shipping shape (no strip applies)', () => {
    expect(
      orphanedByPublishStrip({
        name: '@x/kotlin',
        files: ['src', 'README.md'],
        pyreon: { native: { kotlin: { dir: 'src/main/kotlin' } } },
      }),
    ).toEqual([])
  })

  it('is silent for an ordinary lib/-building package', () => {
    expect(
      orphanedByPublishStrip({
        name: '@x/lib',
        files: ['lib', 'src', 'README.md'],
        exports: { '.': { bun: './src/index.ts', import: './lib/index.js' } },
      }),
    ).toEqual([])
  })

  it('ignores the `bun` condition, which publish strips from exports too', () => {
    // `bun: './src/index.ts'` must NOT count as a post-publish requirement —
    // otherwise every package in the repo would report an orphan.
    expect(
      orphanedByPublishStrip({
        name: '@x/lib',
        files: ['lib', 'src'],
        exports: { './sub': { bun: './src/sub.ts', import: './lib/sub.js' } },
      }),
    ).toEqual([])
  })
})

describe('the real manifests this bug shipped against', () => {
  for (const rel of ['packages/native/runtime-kotlin', 'packages/native/router-kotlin']) {
    it(`${rel} keeps its Gradle srcDir in the published tarball`, () => {
      const pkg = readPkg(rel)
      expect(packageBuildsToLib(pkg)).toBe(false)
      expect(publishedFiles(pkg)).toContain('src')
      expect(orphanedByPublishStrip(pkg)).toEqual([])
    })
  }

  it('an ordinary built package still has `src` stripped', () => {
    const pkg = readPkg('packages/core/reactivity')
    expect(packageBuildsToLib(pkg)).toBe(true)
    expect(publishedFiles(pkg)).not.toContain('src')
  })
})

// ---------------------------------------------------------------------------
// npm's 404-on-PUT covers TWO cases; routing both to "needs bootstrap" made a
// permission failure a warn-and-skip with exit 0. That is how
// @pyreon/native-router-swift sat at 0.50.0 through the whole 0.51.0 release.
// ---------------------------------------------------------------------------
const PUT_404 = [
  'npm error code E404',
  'npm error 404 Not Found - PUT https://registry.npmjs.org/@pyreon/native-router-swift',
  "npm error 404 '@pyreon/native-router-swift@0.51.0' is not in this registry.",
  'npm error 404 The package could not be found or you do not have permission to access it.',
].join('\n')

describe('classifyPublishFailure', () => {
  it('routes a 404-on-PUT for an ABSENT package to needsBootstrap', () => {
    expect(classifyPublishFailure(PUT_404, false).kind).toBe('needsBootstrap')
  })

  it('routes a 404-on-PUT for an EXISTING package to failed, naming Trusted Publisher', () => {
    const v = classifyPublishFailure(PUT_404, true)
    expect(v.kind).toBe('failed')
    expect(v.reason).toMatch(/Trusted Publisher/)
    expect(v.reason).toMatch(/ALREADY EXISTS/)
  })

  it('degrades to needsBootstrap when existence is UNKNOWN (lookup failed)', () => {
    expect(classifyPublishFailure(PUT_404, undefined).kind).toBe('needsBootstrap')
  })

  it('treats a publish-over conflict as an already-published SKIP, regardless of existence', () => {
    const stderr = 'npm error 403 You cannot publish over the previously published versions: 0.51.0.'
    expect(classifyPublishFailure(stderr, true).kind).toBe('alreadyPublished')
    expect(classifyPublishFailure(stderr, false).kind).toBe('alreadyPublished')
  })

  it('treats any other failure as failed', () => {
    expect(classifyPublishFailure('npm error 500 Internal Server Error', false).kind).toBe('failed')
    expect(classifyPublishFailure('npm error code ENEEDAUTH', undefined).kind).toBe('failed')
  })

  it('does not mistake a GET 404 for the PUT signature', () => {
    // `npm view` misses print a 404 too; only a PUT is a publish refusal.
    const getMiss = 'npm error 404 Not Found - GET https://registry.npmjs.org/@pyreon/x\nnpm error 404 The package could not be found or you do not have permission to access it.'
    expect(classifyPublishFailure(getMiss, true).kind).toBe('failed')
  })
})
