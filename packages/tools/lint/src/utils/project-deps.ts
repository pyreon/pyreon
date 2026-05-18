/**
 * Project-dependency detection for library-scoped best-practice rules.
 *
 * Library best-practice rules (`@pyreon/query`, `@pyreon/rx`,
 * `@pyreon/form`, …) should only run when the linted project actually
 * depends on that library — a project that doesn't use `@pyreon/query`
 * must never see query rules (zero noise, zero config required). This
 * walks up from the linted file to the nearest `package.json` and
 * checks `dependencies` + `devDependencies` + `peerDependencies`.
 *
 * Results are cached per resolved `package.json` path so a full-repo
 * lint doesn't re-stat/parse the manifest once per file.
 *
 * Auto-detection is a DEFAULT, not a lock: the user can always force a
 * rule on/off via `.pyreonlintrc.json` severity regardless of deps —
 * this util only governs the rule's *implicit* activation.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** dir → resolved package.json path (or null if none up the tree). */
const manifestPathCache = new Map<string, string | null>()
/** package.json path → Set of every declared dependency name. */
const depsCache = new Map<string, Set<string>>()

function findNearestManifest(fromDir: string): string | null {
  let dir = resolve(fromDir)
  const seen: string[] = []
  for (;;) {
    const cached = manifestPathCache.get(dir)
    if (cached !== undefined) {
      // Backfill the walked dirs with the resolved answer.
      for (const d of seen) manifestPathCache.set(d, cached)
      return cached
    }
    seen.push(dir)
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) {
      for (const d of seen) manifestPathCache.set(d, candidate)
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) {
      for (const d of seen) manifestPathCache.set(d, null)
      return null
    }
    dir = parent
  }
}

function readDeclaredDeps(manifestPath: string): Set<string> {
  const cached = depsCache.get(manifestPath)
  if (cached) return cached
  const names = new Set<string>()
  try {
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
      string,
      unknown
    >
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const block = pkg[field]
      if (block && typeof block === 'object') {
        for (const name of Object.keys(block as Record<string, unknown>)) {
          names.add(name)
        }
      }
    }
    // A workspace package depends on itself implicitly (its own
    // source uses its own APIs) — treat `pkg.name` as present so the
    // library's own source is covered by its best-practice rules.
    if (typeof pkg.name === 'string') names.add(pkg.name)
  } catch {
    // Unparseable/missing manifest → treat as "no deps known"; the
    // rule simply stays inactive (safe default — never false-fire).
  }
  depsCache.set(manifestPath, names)
  return names
}

/**
 * True when the project owning `filePath` declares a dependency on
 * `pkgName` (in deps / devDeps / peerDeps / optionalDeps), or `filePath`
 * lives inside that package's own source tree. Returns `false` when no
 * manifest is found (conservative: a rule that can't prove the dep
 * stays silent rather than false-firing).
 */
export function isProjectDependency(
  filePath: string,
  pkgName: string,
): boolean {
  const manifest = findNearestManifest(dirname(resolve(filePath)))
  if (!manifest) return false
  return readDeclaredDeps(manifest).has(pkgName)
}

/** Test-only: clear the memoized manifest/deps caches. */
export function _resetProjectDepsCache(): void {
  manifestPathCache.clear()
  depsCache.clear()
}
