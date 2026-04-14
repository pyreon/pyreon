import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PackageManifest } from './types'

export interface LoadedManifest {
  path: string
  manifest: PackageManifest
}

/**
 * Derive the list of top-level package categories from the root
 * `package.json` `workspaces` globs. Previously hardcoded — with this
 * derivation, adding a new `packages/<category>/` directory doesn't
 * require editing the generator. Falls back to a conservative default
 * if parsing fails (e.g. non-standard workspaces shape).
 *
 * Only categories that match `packages/<name>/*` are extracted; other
 * glob shapes (e.g. `examples/*`) are ignored since they don't contain
 * manifests.
 *
 * @example
 * ```ts
 * import { getPackageCategories } from '@pyreon/manifest'
 *
 * const categories = getPackageCategories(process.cwd())
 * // → ['core', 'fundamentals', 'tools', 'ui-system', 'internals', 'zero']
 * ```
 */
export function getPackageCategories(repoRoot: string): readonly string[] {
  const fallback = ['core', 'fundamentals', 'tools', 'ui-system', 'internals', 'zero'] as const
  try {
    const pkgJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      workspaces?: string[] | { packages?: string[] }
    }
    const globs = Array.isArray(pkgJson.workspaces)
      ? pkgJson.workspaces
      : (pkgJson.workspaces?.packages ?? [])
    const categories = new Set<string>()
    for (const g of globs) {
      // Match `packages/<name>/*` shape (two-level glob).
      const match = /^packages\/([^/*]+)\/\*$/.exec(g)
      if (match && match[1]) categories.add(match[1])
    }
    return categories.size > 0 ? [...categories] : fallback
  } catch {
    return fallback
  }
}

/**
 * Walk `packages/<category>/<pkg>/src/manifest.ts` under the given
 * repo root and return every default-exported manifest. Categories
 * are derived from the root `package.json` workspaces at runtime, so
 * new top-level directories are picked up without editing the
 * generator. Dynamic imports run in parallel via `Promise.all` — for
 * large monorepos this matters.
 *
 * Throws if a manifest file exists but has no default export. Silent
 * "no default exported" was a foot-gun in the original generator.
 *
 * @example
 * ```ts
 * import { findManifests } from '@pyreon/manifest'
 *
 * const manifests = await findManifests(process.cwd())
 * for (const { manifest } of manifests) {
 *   console.log(manifest.name, '→', manifest.tagline)
 * }
 * ```
 */
export async function findManifests(repoRoot: string): Promise<LoadedManifest[]> {
  const categories = getPackageCategories(repoRoot)
  const candidatePaths: string[] = []

  for (const category of categories) {
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
        if (statSync(manifestPath).isFile()) candidatePaths.push(manifestPath)
      } catch {
        // no manifest — skip silently
      }
    }
  }

  // Load all discovered manifests in parallel — each is a dynamic
  // import; for 50+ packages this cuts discovery latency noticeably.
  const loaded = await Promise.all(
    candidatePaths.map(async (path) => {
      const mod = (await import(pathToFileURL(path).href)) as {
        default?: PackageManifest
      }
      if (!mod.default) {
        throw new Error(`[gen-docs] ${path} has no default export`)
      }
      return { path, manifest: mod.default } satisfies LoadedManifest
    }),
  )

  return loaded
}
