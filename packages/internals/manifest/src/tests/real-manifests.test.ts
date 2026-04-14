import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PackageManifest } from '../types'

/**
 * Integration test: iterate every real `manifest.ts` across the
 * monorepo and assert it conforms to `PackageManifest`. Today there
 * are zero manifests — the test is a no-op but present so the day
 * the first manifest lands, it gets validated without another PR.
 *
 * The test walks `packages/<category>/<pkg>/manifest.ts` (not
 * `packages/<category>/<pkg>/src/manifest.ts`) because the generator
 * looks at the package root for the manifest file.
 */

const REPO_ROOT = join(__dirname, '../../../../..')
const CATEGORIES = ['core', 'fundamentals', 'tools', 'ui-system', 'internals', 'zero']

function findManifestFiles(): string[] {
  const results: string[] = []
  for (const category of CATEGORIES) {
    const categoryDir = join(REPO_ROOT, 'packages', category)
    let pkgs: string[]
    try {
      pkgs = readdirSync(categoryDir)
    } catch {
      continue // category dir may not exist (future additions)
    }
    for (const pkg of pkgs) {
      const pkgDir = join(categoryDir, pkg)
      try {
        if (!statSync(pkgDir).isDirectory()) continue
      } catch {
        continue
      }
      const manifestPath = join(pkgDir, 'manifest.ts')
      try {
        if (statSync(manifestPath).isFile()) results.push(manifestPath)
      } catch {
        // no manifest in this package — skip silently
      }
    }
  }
  return results
}

describe('real-manifests — every packages/*/*/manifest.ts conforms to PackageManifest', () => {
  const manifestPaths = findManifestFiles()

  it('scanner finds the manifest directory structure', () => {
    // Sanity: at least one category directory exists. This catches
    // the case where REPO_ROOT resolution breaks and we silently
    // find zero manifests forever.
    const corePath = join(REPO_ROOT, 'packages', 'core')
    expect(statSync(corePath).isDirectory()).toBe(true)
  })

  // If no manifests exist yet, emit a single no-op test to signal
  // the scanner ran. Once the first manifest lands, the `it.each`
  // block below starts generating a test per manifest.
  if (manifestPaths.length === 0) {
    it.skip('no manifests to validate yet — first consumer PR activates this suite', () => {
      // Expected state until T2.1 Phase 2 ships the first manifest.
    })
  } else {
    it.each(manifestPaths)('conforms to PackageManifest: %s', async (manifestPath) => {
      const mod = (await import(manifestPath)) as { default?: PackageManifest }
      expect(mod.default).toBeDefined()
      const m = mod.default!
      // Load-bearing invariants the type already enforces at compile
      // time but we re-assert at runtime as a belt-and-suspenders
      // guard in case someone casts past the type.
      expect(typeof m.name).toBe('string')
      expect(m.name.startsWith('@pyreon/')).toBe(true)
      expect(typeof m.tagline).toBe('string')
      expect(typeof m.description).toBe('string')
      expect(['browser', 'server', 'universal']).toContain(m.category)
      expect(Array.isArray(m.features)).toBe(true)
      expect(Array.isArray(m.api)).toBe(true)
    })
  }
})
