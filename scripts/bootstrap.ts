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

// Three failure modes that require a rebuild:
// (1) Package has no `lib/` at all (fresh clone / fresh worktree)
// (2) Package has `lib/` but its newest file is older than the newest src/
//     file — i.e. someone changed source without rebuilding (post-pull,
//     post-checkout-between-branches, or just developer iteration).
// (3) Package has `lib/index.js` but it's truncated / empty — gap #6
//     defensive against a prior bootstrap run that crashed mid-write,
//     wrote a 0-byte file, or left structurally-broken output. The same
//     50-byte floor as the postcondition: real Pyreon `lib/index.js`
//     entries are hundreds-to-thousands of bytes; <50 bytes is broken.
const MIN_LIB_INDEX_BYTES = 50
const dirty: MissingPackage[] = []
for (const pkg of packages) {
  if (!pkg.hasLib) {
    dirty.push({ name: pkg.name, path: relative(ROOT, pkg.path), reason: 'missing' })
    continue
  }
  // Content sanity (gap #6): catch broken lib from a prior crashed
  // bootstrap. If lib/index.js exists and is < 50 bytes, treat as stale.
  const libIndex = join(pkg.path, 'lib', 'index.js')
  if (existsSync(libIndex)) {
    try {
      const size = statSync(libIndex).size
      if (size < MIN_LIB_INDEX_BYTES) {
        dirty.push({ name: pkg.name, path: relative(ROOT, pkg.path), reason: 'stale' })
        continue
      }
    } catch {
      // Defensive — fall through to mtime check
    }
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

// `PYREON_BOOTSTRAP_FORCE_FAIL=1` is a test-only injection point. The
// build-failure catch path is hard to exercise end-to-end without
// corrupting real packages — this env var jumps straight to it so the
// exit-code behaviour can be subprocess-tested. Only honoured when
// explicitly opted in; otherwise the script behaves normally.
const forceFail = process.env.PYREON_BOOTSTRAP_FORCE_FAIL === '1'

if (dirty.length === 0 && !forceFail) {
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

// Distinguish postinstall (bun install hook) from manual / CI invocation.
// `bun install` sets `npm_lifecycle_event=postinstall`; manual `bun
// scripts/bootstrap.ts` does not. PR #398 made manual / CI invocations
// exit nonzero on build failure (the postinstall path still swallowed
// to avoid aborting `bun install` over a transient lib build). Gap #3
// closed the remaining hole: even the postinstall path now exits
// nonzero when the POSTCONDITION CHECK shows partial / missing builds —
// silent partial state is worse than aborting install, because the user
// might run `bun run dev` (which uses the bun condition → src/, never
// touches lib/) and never notice the missing lib/ until production
// build days later, far from the cause.
const isPostinstall = process.env.npm_lifecycle_event === 'postinstall'

let buildThrew = false
try {
  if (forceFail) {
    // Test-only injection — see PYREON_BOOTSTRAP_FORCE_FAIL above.
    throw new Error('forced-fail (test only)')
  }
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
  buildThrew = true
}

// Postcondition verification: re-run the dirty detection against each
// package that was originally dirty. If any are STILL dirty (lib/ still
// missing or still stale), the build either failed silently for that
// package or its build script doesn't actually produce lib/. Either way
// it's a partial-state bug the bootstrap should surface, not hide.
//
// Why this exists: pre-fix, `bun run --filter='./packages/*/*' build`
// could exit zero even when individual package builds emitted errors
// (depending on bun-filter's failure-propagation semantics across the
// dependency graph), or could exit nonzero from a single-package
// failure while the rest succeeded. The original `try { } catch {}`
// shape treated both as binary success/failure with no per-package
// detail. Postcondition check restores the resolution.
//
// Content check (gap #6): the original postcondition only verified
// `lib/` directory existed and src/lib mtime ordering. If a build
// emitted an empty / corrupt `lib/index.js` (e.g. crashed mid-write,
// produced 0-byte output, transient resource issue), the file's
// presence and recent mtime BOTH look fine — but consumers would hit
// `MISSING_EXPORT` errors at example-build time. Pre-fix this slipped
// through. Same 50-byte floor as the dirty-detection content check.
function checkPostcondition(pkg: MissingPackage): MissingPackage | null {
  const pkgPath = join(ROOT, pkg.path)
  const libDir = join(pkgPath, 'lib')
  if (!existsSync(libDir)) {
    return { ...pkg, reason: 'missing' }
  }
  // Content sanity: lib/index.js must be non-trivially-sized.
  const libIndex = join(libDir, 'index.js')
  if (existsSync(libIndex)) {
    try {
      const size = statSync(libIndex).size
      if (size < MIN_LIB_INDEX_BYTES) {
        return { ...pkg, reason: 'stale' }
      }
    } catch {
      return { ...pkg, reason: 'missing' }
    }
  }
  // Stale postcondition: src is still newer than lib/ (build didn't
  // refresh lib/). Note we keep the same 2s tolerance from the dirty
  // detection — anything tighter trips on filesystem mtime quirks.
  const srcM = maxFileMtime(join(pkgPath, 'src'))
  const libM = maxFileMtime(libDir)
  if (srcM > 0 && libM > 0 && srcM > libM + 2_000) {
    return { ...pkg, reason: 'stale' }
  }
  return null
}

let stillDirty: MissingPackage[] = []
for (const pkg of dirty) {
  const result = checkPostcondition(pkg)
  if (result) stillDirty.push(result)
}

// Single retry pass (gap #3): the original "meta builds before its
// deps" symptom was hypothesized as a topological-order race in the
// bun-filter build. PR #435 couldn't reliably reproduce it, but the
// underlying class — "transient flake on first build, succeeds on
// retry" — is real for several reasons:
//
//   1. Topological-order races where a dependent package starts
//      building before its dep finishes (rare but observed).
//   2. Resource contention (file handle limits, OOM during heavy
//      parallel builds, network blips on remote-cached deps).
//   3. Flaky native binaries (the Rust compiler in `@pyreon/compiler`
//      occasionally fails to find `@oxc-parser/binding-wasm32-wasi`
//      on the first run after `bun install` if the package isn't
//      fully linked yet).
//
// Strategy: if any packages are still dirty after the first build,
// retry ONLY those packages, one at a time. Sequential per-package
// retry avoids the parallel-load issues that may have caused the
// first failure, and gives clean per-package error output for the
// few that still fail. Capped at one retry — never recurse, never
// infinite-loop. The forceFail injection is honored on retry too,
// so the test harness can verify retry doesn't loop forever.
const firstPassDirtyCount = stillDirty.length
let retryFixedCount = 0
if (stillDirty.length > 0 && !forceFail) {
  // oxlint-disable-next-line no-console
  console.log(
    `\n[bootstrap] Retrying ${stillDirty.length} still-dirty package(s) sequentially…`,
  )
  const retried = [...stillDirty]
  stillDirty = []
  for (const pkg of retried) {
    try {
      execSync(`bun run --filter='${pkg.name}' build`, {
        cwd: ROOT,
        stdio: 'inherit',
        timeout: 120_000, // 2 min per package on retry
      })
    } catch {
      // Per-package retry failure is expected for genuinely-broken
      // packages — fall through to postcondition check, which will
      // re-flag them as still-dirty.
    }
    const result = checkPostcondition(pkg)
    if (result) {
      stillDirty.push(result)
    } else {
      retryFixedCount++
    }
  }
  if (retryFixedCount > 0) {
    // oxlint-disable-next-line no-console
    console.log(
      `[bootstrap] Retry recovered ${retryFixedCount} package(s) (first-pass-failed: ${firstPassDirtyCount}, retry-fixed: ${retryFixedCount}, still-dirty: ${stillDirty.length}).`,
    )
  }
}

if (buildThrew || stillDirty.length > 0) {
  // oxlint-disable-next-line no-console
  console.error(
    `\n[bootstrap] ✗ Build failure — ${stillDirty.length}/${dirty.length} package(s) still need rebuild after the build subprocess${buildThrew ? ' (which exited nonzero)' : ''}:`,
  )
  for (const pkg of stillDirty) {
    // oxlint-disable-next-line no-console
    console.error(`  - ${pkg.name} (${pkg.path}) [${pkg.reason}]`)
  }
  // oxlint-disable-next-line no-console
  console.error(
    `\n[bootstrap] To investigate: run \`bun run --filter='./packages/<category>/<pkg>' build\` for the failing package and read the per-package output. To retry from scratch: \`bun scripts/bootstrap.ts\`.`,
  )
  if (isPostinstall) {
    // oxlint-disable-next-line no-console
    console.error(
      `[bootstrap] \`bun install\` will exit nonzero. Set PYREON_BOOTSTRAP_SOFT=1 to bypass (the install completes but lib/ remains incomplete — example builds will fail with confusing errors until you re-run bootstrap manually).`,
    )
  }
  if (process.env.PYREON_BOOTSTRAP_SOFT !== '1') process.exit(1)
}

// Phase E1: install git hooks via `core.hooksPath`. Idempotent, no-op
// outside a git checkout (tarball / fresh extract), respects any
// existing user-set hooksPath. Lives in its own script so the same
// install can be re-run manually after a `git config --unset
// core.hooksPath`. Hook itself lives at `.githooks/pre-push`.
try {
  execSync('bun scripts/install-git-hooks.ts', {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 5_000,
  })
} catch {
  // Same rationale as the build above — never abort `bun install`. The
  // hook is purely a local-feedback nicety; CI is the authoritative gate.
  // oxlint-disable-next-line no-console
  console.warn(
    '[bootstrap] git-hooks install skipped (not a git checkout, or git config write failed).',
  )
}
