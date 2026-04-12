#!/usr/bin/env bun
/**
 * Bootstrap script — ensures compiled `lib/` directories exist for packages
 * that Vite's config bundler needs during `vite build`.
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
 * So `import: "./lib/index.js"` must exist. In a fresh git worktree (or
 * after `git clean`), it doesn't — because no build has been run yet.
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
 *    checks if `lib/` exists.
 * 3. If ANY package is missing `lib/`, runs `bun run --filter='./packages/*' build`
 *    to compile all packages (not examples — those aren't imported by others).
 * 4. If all `lib/` directories exist, exits immediately (~5ms no-op).
 *
 * ## Performance
 *
 * - Fresh worktree: ~45s (packages-only build, no examples).
 * - Subsequent installs: instant (all `lib/` exist).
 * - Only triggered by: fresh clone, fresh worktree, `git clean -fdx`.
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

interface MissingPackage {
  name: string
  path: string
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

// ── Main ────────────────────────────────────────────────────────────────────

const packages = findBuildablePackages()
const missing: MissingPackage[] = packages
  .filter((p) => !p.hasLib)
  .map((p) => ({ name: p.name, path: relative(ROOT, p.path) }))

if (missing.length === 0) {
  // All lib/ dirs exist — instant no-op.
  process.exit(0)
}

// Log which packages are missing so the user understands why the build runs.
// oxlint-disable-next-line no-console
console.log(
  `[bootstrap] ${missing.length} package${missing.length === 1 ? '' : 's'} missing lib/ — ` +
    `running initial build (~45s, only happens once per fresh worktree):`,
)
for (const pkg of missing) {
  // oxlint-disable-next-line no-console
  console.log(`  - ${pkg.name} (${pkg.path})`)
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
