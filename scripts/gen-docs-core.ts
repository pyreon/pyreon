/**
 * gen-docs core — filesystem-walking + orchestration for the generator.
 *
 * Pure rendering lives in `@pyreon/manifest` (`src/render.ts`): a
 * manifest → llms.txt bullet is a type-level concern, reusable by any
 * caller that wants to render without dragging in `fs` / `path`.
 *
 * This file owns:
 * - `findManifests(repoRoot)` — walks `packages/<cat>/<pkg>/src/manifest.ts`
 * - `regenerateLlmsTxt(contents, manifests)` — replaces matched bullets
 *
 * Consumers:
 * - `scripts/gen-docs.ts` — CLI entry
 * - `packages/internals/manifest/src/tests/generator.test.ts` — tests
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderLlmsTxtLine } from '../packages/internals/manifest/src/render'
// Relative import (not `@pyreon/manifest`) because scripts/ lives
// outside any package — bun resolves workspace specifiers from a
// package's node_modules, scripts/ has none. Type-only.
import type { PackageManifest } from '../packages/internals/manifest/src/types'

export const PACKAGE_CATEGORIES = [
  'core',
  'fundamentals',
  'tools',
  'ui-system',
  'internals',
  'zero',
] as const

export interface LoadedManifest {
  path: string
  manifest: PackageManifest
}

/**
 * Walk `packages/<category>/<pkg>/src/manifest.ts` under the given repo
 * root. Returns every default-exported manifest it finds. Throws if a
 * manifest file exists but has no default export — silent "no default
 * exported" was a foot-gun in the original generator.
 *
 * Manifests live under `src/` so they respect each package's
 * `rootDir: "./src"` tsconfig constraint.
 */
export async function findManifests(repoRoot: string): Promise<LoadedManifest[]> {
  const found: LoadedManifest[] = []
  for (const category of PACKAGE_CATEGORIES) {
    const categoryDir = join(repoRoot, 'packages', category)
    let pkgs: string[]
    try {
      pkgs = readdirSync(categoryDir)
    } catch {
      continue
    }
    for (const pkg of pkgs) {
      const pkgDir = join(categoryDir, pkg)
      try {
        if (!statSync(pkgDir).isDirectory()) continue
      } catch {
        continue
      }
      const manifestPath = join(pkgDir, 'src', 'manifest.ts')
      try {
        if (!statSync(manifestPath).isFile()) continue
      } catch {
        continue
      }
      const mod = (await import(pathToFileURL(manifestPath).href)) as {
        default?: PackageManifest
      }
      if (!mod.default) {
        throw new Error(`[gen-docs] ${manifestPath} has no default export`)
      }
      found.push({ path: manifestPath, manifest: mod.default })
    }
  }
  return found
}

export interface RegenerateResult {
  contents: string
  changedLines: number
  missingEntries: string[]
}

/**
 * Replace existing `- <name> —` bullets in llms.txt with regenerated
 * content from the manifests. Returns the list of manifest names whose
 * bullet line could NOT be found in llms.txt — the caller should treat
 * this as a hard error (manifests without a landing line produce
 * silent no-ops that drift untracked).
 */
export function regenerateLlmsTxt(
  contents: string,
  manifests: LoadedManifest[],
): RegenerateResult {
  let next = contents
  let changedLines = 0
  const missingEntries: string[] = []
  for (const { manifest } of manifests) {
    const targetLine = renderLlmsTxtLine(manifest)
    const bulletPrefix = `- ${manifest.name} —`
    const escaped = bulletPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`^${escaped}.*$`, 'm')
    if (!re.test(next)) {
      missingEntries.push(manifest.name)
      continue
    }
    const prev = next
    next = next.replace(re, targetLine)
    if (prev !== next) changedLines++
  }
  return { contents: next, changedLines, missingEntries }
}

// Re-export for test convenience — keeps a single import origin for
// consumers that don't care about the physical split between pure
// render and orchestration.
export { formatLineDiff, renderLlmsTxtLine } from '../packages/internals/manifest/src/render'
