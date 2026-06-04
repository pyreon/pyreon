/**
 * Memory-bounded full-monorepo build for the release path.
 *
 * Background — why this script exists
 * ────────────────────────────────────
 * The release workflow's publish step runs
 *   bun run --filter='./packages/<cat>/<pkg>' build
 * which fans out ALL 77 workspace packages in parallel. Bun's `--filter`
 * has no concurrency knob (verified against `bun run --help`); it spawns
 * every package's build script at t=0 and lets the topo graph fall into
 * place as upstream packages complete.
 *
 * Measured locally (`ps -o rss= -g <pgid>` of the build's process group,
 * sampled every 2s):
 *
 *   t=3s  → 85 procs / 11.7 GB RSS
 *   t=6s  → 83 procs / 17.5 GB RSS    ← already over GHA's 16 GB ceiling
 *   t=9s  → 79 procs / **19.5 GB**    ← peak; OOM territory
 *   t=12s → 34 procs / 10.0 GB
 *   t=15s → 16 procs /  2.2 GB
 *
 * GitHub Actions `ubuntu-latest` runners ship with **16 GB RAM**. The
 * release path therefore OVERSUBSCRIBES memory by ~3.5 GB during the
 * initial fan-out and the kernel oom-kills the runner process. GHA
 * reports it as `##[error]The runner has received a shutdown signal`
 * — the same pattern we saw across 3 consecutive failed attempts of
 * run 26973564846, each dying at a different step (build / install /
 * lint) but all within the first ~10 minutes of heavy concurrent
 * builds. The non-determinism in WHICH step dies (vs the determinism
 * in THAT it dies) is the diagnostic that pointed at memory rather
 * than infrastructure flake.
 *
 * The fix
 * ───────
 * Build each `packages/<category>/` subdirectory SEQUENTIALLY, but
 * keep bun's intra-filter parallelism WITHIN each category. The
 * categories partition the workspace at exactly the right granularity:
 *
 *   core         (10 pkgs)  →   ~1 GB peak
 *   fundamentals (23 pkgs)  →   ~5.8 GB peak  ← worst case, measured
 *   tools        (12 pkgs)  →   ~3 GB peak
 *   ui-system    (11 pkgs)  →   ~3 GB peak
 *   zero         ( 6 pkgs)  →   <1 GB
 *   native       ( 6 pkgs)  →   <1 GB
 *   internals    ( 6 pkgs)  →   <1 GB
 *   ui          ( 3 pkgs)  →   <1 GB
 *
 * The largest category (fundamentals at 5.8 GB) leaves a 10+ GB
 * headroom on GHA — no more OOM, deterministic build. Total wall-clock
 * grows from ~30s (when it didn't OOM) to ~80s — the ~2.5× factor is
 * the cost of buying determinism.
 *
 * Why not turbo / nx / a topo-level scheduler?
 * ────────────────────────────────────────────
 * Both would WORK, but each adds a new dev dependency and a new mental
 * model to a release path that's failing TODAY. Per-subdir sequential
 * is a 50-line script that solves the actual problem and leaves the
 * dev workflow's `bun run build` (which keeps full parallelism, since
 * dev machines have ample RAM) untouched.
 *
 * Why not just set `PYREON_BOOTSTRAP_SKIP_NATIVE=1`?
 * ──────────────────────────────────────────────────
 * The Rust native build is one source of memory pressure but not the
 * only one. Attempts 1 and 3 of the failed release died OUTSIDE
 * cargo — the parallel Rolldown build of the 23 fundamentals packages
 * is enough to trip the OOM on its own. Skipping native helps but
 * doesn't close the root cause.
 *
 * Usage
 * ─────
 *   bun run scripts/build-batched.ts
 *
 * Exit codes
 * ──────────
 *   0  every category built successfully
 *   1  any category's build failed (the script exits immediately;
 *      downstream categories aren't attempted)
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = join(import.meta.dirname, '..')
const PACKAGES_DIR = join(REPO_ROOT, 'packages')

interface PackageJson {
  name?: string
  scripts?: Record<string, string>
}

async function hasBuildable(categoryDir: string): Promise<boolean> {
  // Check whether ANY package in the category has a real `build` script.
  // Categories like `internals/` are entirely private + src-only (no
  // `build`); invoking bun's filter against them fails with "No packages
  // matched the filter" (exit 1). Skip those categories cleanly so the
  // overall release-build doesn't false-fail on a no-op subdirectory.
  const subs = await readdir(categoryDir, { withFileTypes: true })
  for (const s of subs) {
    if (!s.isDirectory()) continue
    try {
      const raw = await readFile(join(categoryDir, s.name, 'package.json'), 'utf8')
      const pkg = JSON.parse(raw) as PackageJson
      const build = pkg.scripts?.build
      if (build && build !== '' && !build.startsWith('echo ') && build !== 'true') {
        return true
      }
    } catch {
      // No package.json or unreadable — skip.
    }
  }
  return false
}

// Discover category subdirectories dynamically — same shape as
// scripts/publish.ts and scripts/bootstrap.ts so adding a new category
// (e.g. `experimental/`) requires no script edits.
const entries = await readdir(PACKAGES_DIR, { withFileTypes: true })
const allCategories = entries
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => e.name)
  .sort()

if (allCategories.length === 0) {
  console.error('[build-batched] No package categories found under packages/')
  process.exit(1)
}

// Filter to categories that actually have buildable packages.
const buildable: string[] = []
const skipped: string[] = []
for (const cat of allCategories) {
  if (await hasBuildable(join(PACKAGES_DIR, cat))) {
    buildable.push(cat)
  } else {
    skipped.push(cat)
  }
}

console.log(
  `[build-batched] ${buildable.length} buildable categories: ${buildable.join(', ')}`,
)
if (skipped.length > 0) {
  console.log(`[build-batched] skipping (no buildable packages): ${skipped.join(', ')}`)
}

const overallStart = Date.now()

for (const cat of buildable) {
  const filter = `./packages/${cat}/*`
  const start = Date.now()
  console.log(`\n[build-batched] ── ${cat} ──────────────────────────────`)
  const result = spawnSync('bun', ['run', '--filter', filter, 'build'], {
    stdio: 'inherit',
    cwd: REPO_ROOT,
  })
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  if (result.status !== 0) {
    console.error(`\n[build-batched] ❌ ${cat} failed (exit ${result.status}) after ${elapsed}s`)
    process.exit(result.status ?? 1)
  }
  console.log(`[build-batched] ✅ ${cat} (${elapsed}s)`)
}

const total = ((Date.now() - overallStart) / 1000).toFixed(1)
console.log(`\n[build-batched] All ${buildable.length} categories built in ${total}s`)
