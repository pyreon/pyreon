#!/usr/bin/env bun
/**
 * Bootstrap script — ensures compiled `lib/` directories exist AND ARE FRESH
 * for packages that Vite's config bundler needs during `vite build`.
 *
 * ## Why this is needed
 *
 * All workspace packages export `"bun": "./src/index.ts"` for Bun-native
 * development (no build step needed). But when Vite builds an app (e.g.,
 * `examples/app-showcase`), it resolves `vite.config.ts` imports using the
 * `import` condition, which points to `./lib/index.js`. This is because:
 *
 *   1. Vite's config bundler hardcodes `conditions: ["node"]` — it cannot
 *      be overridden by vite.config.ts (circular: the config file itself
 *      is being resolved).
 *   2. The bundled config is then executed by Node's ESM loader (even when
 *      invoked via `bun run`), and Node cannot import `.ts` files.
 *
 * So `import: "./lib/index.js"` must exist AND must reflect the current
 * source. In a fresh git worktree (or after `git clean`), it doesn't exist
 * — because no build has been run yet. After a `git pull` that touches
 * source, it exists but is STALE — which silently breaks builds with
 * confusing errors (e.g. `MISSING_EXPORT` for routes that the source
 * correctly filters but the stale lib doesn't).
 *
 * ## When it runs
 *
 * As the root `postinstall` hook — automatically after `bun install`.
 * Also safe to run manually: `bun scripts/bootstrap.ts`.
 *
 * ## What it does
 *
 * 1. Scans all workspace packages under `packages/` (not `examples/`).
 * 2. For each package with `./lib/` in exports AND a real build script,
 *    checks (a) does `lib/` exist, and (b) is its newest file older than
 *    the package's newest source file (= stale).
 * 3. If ANY package is missing OR stale, runs the workspace build filter
 *    `bun run --filter='./packages/<category>/<pkg>' build` to compile all
 *    packages (not examples — those aren't imported by others).
 * 4. If all `lib/` directories exist AND are fresh, exits immediately (~80ms no-op).
 *
 * ## Performance
 *
 * - Fresh worktree: ~45s (packages-only build, no examples).
 * - Stale lib (post-pull): same ~45s, but now we catch it instead of failing later.
 * - Subsequent installs (no source changes): ~80ms (mtime walk over packages).
 * - Triggered by: fresh clone, fresh worktree, `git clean -fdx`, OR any package
 *   source touched since its last build.
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

interface MissingPackage {
  name: string
  path: string
  reason: 'missing' | 'stale'
}

/**
 * Find workspace packages under `packages/` that have `./lib/` in their
 * exports AND a real build script (not a no-op echo).
 */
function findBuildablePackages(): Array<{ name: string; path: string; hasLib: boolean }> {
  const result: Array<{ name: string; path: string; hasLib: boolean }> = []
  const packagesRoot = join(ROOT, 'packages')

  for (const category of readdirSync(packagesRoot)) {
    const categoryPath = join(packagesRoot, category)
    if (!statSync(categoryPath).isDirectory()) continue

    for (const pkg of readdirSync(categoryPath)) {
      const pkgPath = join(categoryPath, pkg)
      if (!statSync(pkgPath).isDirectory()) continue

      const pkgJsonPath = join(pkgPath, 'package.json')
      if (!existsSync(pkgJsonPath)) continue

      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
      const exports = pkgJson.exports
      if (!exports) continue

      // Check if any export condition references `lib/`
      const exportsStr = JSON.stringify(exports)
      if (!exportsStr.includes('./lib/')) continue

      // Check the build script is real (not a no-op echo or empty)
      const buildScript = pkgJson.scripts?.build as string | undefined
      const hasRealBuild =
        buildScript != null &&
        !buildScript.startsWith('echo ') &&
        buildScript !== 'true' &&
        buildScript !== ''

      if (!hasRealBuild) continue

      const hasLib = existsSync(join(pkgPath, 'lib'))
      result.push({
        name: pkgJson.name as string,
        path: pkgPath,
        hasLib,
      })
    }
  }

  return result
}

/**
 * Walk a directory recursively and return the newest mtime found across
 * all regular files. Skips test fixtures, node_modules, and dotfiles —
 * test changes shouldn't trigger a rebuild, but src/ changes should.
 *
 * Returns 0 if the directory doesn't exist (caller treats as "no signal").
 */
function maxFileMtime(dir: string): number {
  if (!existsSync(dir)) return 0
  let max = 0
  const stack: string[] = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      // Skip noise: hidden files, node_modules, nested lib/, generated dirs.
      // Also skip __tests__ and tests/ — test edits shouldn't trigger rebuilds.
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'lib' ||
        entry.name === '__tests__' ||
        entry.name === 'tests' ||
        entry.name === '__snapshots__' ||
        entry.name.endsWith('.test.ts') ||
        entry.name.endsWith('.test.tsx') ||
        entry.name.endsWith('.test.js')
      ) {
        continue
      }
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile()) {
        try {
          const m = statSync(full).mtimeMs
          if (m > max) max = m
        } catch {
          // Ignore
        }
      }
    }
  }
  return max
}

// ── Main ────────────────────────────────────────────────────────────────────

const packages = findBuildablePackages()

// Two failure modes both require a rebuild:
// (1) Package has no `lib/` at all (fresh clone / fresh worktree)
// (2) Package has `lib/` but its newest file is older than the newest src/
//     file — i.e. someone changed source without rebuilding (post-pull,
//     post-checkout-between-branches, or just developer iteration).
const dirty: MissingPackage[] = []
for (const pkg of packages) {
  if (!pkg.hasLib) {
    dirty.push({ name: pkg.name, path: relative(ROOT, pkg.path), reason: 'missing' })
    continue
  }
  const srcDir = join(pkg.path, 'src')
  const libDir = join(pkg.path, 'lib')
  const srcM = maxFileMtime(srcDir)
  const libM = maxFileMtime(libDir)
  // Only flag stale when src is meaningfully newer (>2s tolerance covers
  // filesystem-level mtime quirks across remounts / git checkout races).
  if (srcM > 0 && libM > 0 && srcM > libM + 2_000) {
    dirty.push({ name: pkg.name, path: relative(ROOT, pkg.path), reason: 'stale' })
  }
}

if (dirty.length === 0) {
  // All lib/ dirs exist AND are fresh — instant no-op.
  process.exit(0)
}

// Log which packages need rebuilding and why.
const missingCount = dirty.filter((p) => p.reason === 'missing').length
const staleCount = dirty.filter((p) => p.reason === 'stale').length
const reasonStr = [
  missingCount > 0 ? `${missingCount} missing lib/` : '',
  staleCount > 0 ? `${staleCount} stale lib/ (source newer than build)` : '',
]
  .filter(Boolean)
  .join(', ')

// oxlint-disable-next-line no-console
console.log(
  `[bootstrap] ${dirty.length} package${dirty.length === 1 ? '' : 's'} need rebuild — ${reasonStr}.`,
)
for (const pkg of dirty) {
  // oxlint-disable-next-line no-console
  console.log(`  - ${pkg.name} (${pkg.path}) [${pkg.reason}]`)
}

try {
  // Build packages only (not examples) — examples are never imported by
  // other packages and their build is substantially slower (Vite full
  // production build with tree-shaking, asset optimization, etc.).
  // The workspace pattern `./packages/*/*` matches the two-level nesting
  // (e.g., `packages/core/reactivity`, `packages/tools/lint`).
  execSync("bun run --filter='./packages/*/*' build", {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 300_000, // 5 min max
  })
  // oxlint-disable-next-line no-console
  console.log('[bootstrap] Build complete.')
} catch {
  // Don't exit with error — a failed postinstall aborts `bun install`
  // entirely, which is worse than continuing with missing lib/ dirs.
  // The user will get a clear error on their next `bun run build` of
  // an example, which is more actionable than a cryptic install failure.
  // oxlint-disable-next-line no-console
  console.error(
    "[bootstrap] Build failed. Run `bun run --filter='./packages/*/*' build` manually to fix.",
  )
}
