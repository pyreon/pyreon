/**
 * Which `@pyreon/*` packages the workbench must keep to ONE runtime instance
 * (#3846).
 *
 * ── The bug ───────────────────────────────────────────────────────────────
 *
 * `atlas dev` runs Vite with `optimizeDeps.entries: []` (the workbench entry is
 * virtual), so nothing is pre-bundled up front: dependencies are discovered as
 * the browser imports them. `@pyreon/vite-plugin` excludes `@pyreon/*` from the
 * optimizer — but only the ones the ROOT manifest declares directly. A workspace
 * root declares the plugin's peers and little else; a package such as
 * `@pyreon/store` that only a COMPONENT package depends on was therefore not
 * excluded. On a cold cache the first import was served raw
 * (`node_modules/.bun/…/lib/index.js`), Vite then discovered the dependency,
 * optimized it and rewrote later imports to
 * `node_modules/.cache/atlas-vite/deps/@pyreon_store.js` — two module instances
 * of one package, which the singleton sentinel correctly refuses. A warm cache
 * already holds the optimized copy, so the failure only ever shows on the FIRST
 * start, which is why a warm-only check never saw it.
 *
 * ── The fix is a CLASS, not a package ─────────────────────────────────────
 *
 * Every `@pyreon/*` package a workspace package declares or has installed beside
 * it is excluded from the optimizer and deduped, no matter which manifest
 * declares it. The set is DERIVED from the workspace (declared dependencies of
 * every package, plus what its `node_modules` links) — never a hard-coded list,
 * so a new framework package needs no change here.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

/** How far up from a package a `node_modules/@pyreon` link is looked for. */
const MAX_WALK_UP = 12

/** The `@pyreon/*` names a manifest declares, in any dependency field. */
function declaredPyreonDeps(dir: string): string[] {
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
  } catch {
    return []
  }
  const names: string[] = []
  for (const field of DEP_FIELDS) {
    const deps = pkg[field]
    if (deps && typeof deps === 'object') {
      for (const name of Object.keys(deps)) if (name.startsWith('@pyreon/')) names.push(name)
    }
  }
  return names
}

/** The `@pyreon/*` names linked into any `node_modules` at or above `dir`. */
function installedPyreonPackages(dir: string, seen: Set<string>): string[] {
  const names: string[] = []
  let current = dir
  for (let i = 0; i < MAX_WALK_UP; i++) {
    const scope = join(current, 'node_modules', '@pyreon')
    if (!seen.has(scope)) {
      seen.add(scope)
      if (existsSync(scope)) {
        try {
          for (const entry of readdirSync(scope, { withFileTypes: true })) {
            if (entry.isDirectory() || entry.isSymbolicLink()) names.push(`@pyreon/${entry.name}`)
          }
        } catch {
          // an unreadable scope contributes nothing; the declared deps still count
        }
      }
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return names
}

/**
 * The sorted, de-duplicated `@pyreon/*` package names reachable from `dirs`
 * (the workspace's package directories, the root, Atlas's own directory).
 */
export function collectPyreonPackages(dirs: readonly string[]): string[] {
  const names = new Set<string>()
  const seen = new Set<string>()
  for (const dir of dirs) {
    for (const name of declaredPyreonDeps(dir)) names.add(name)
    for (const name of installedPyreonPackages(dir, seen)) names.add(name)
  }
  return [...names].sort()
}
