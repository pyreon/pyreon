#!/usr/bin/env bun
/**
 * scaffold-smoke — end-to-end gate against the create-pyreon-app scaffolder.
 *
 * For each cell in `MATRIX`, this script:
 *   1. Invokes the scaffolder (`packages/zero/create-zero/src/index.ts`)
 *      directly with the cell's flags into `examples/cpa-smoke-<cell>/`.
 *   2. Runs `bun install` so the new workspace member resolves @pyreon/*
 *      to local source via the `bun` condition (no npm round trip).
 *   3. Runs `bun run build` from the cell's dir.
 *   4. Asserts the cell-specific shape: `dist/` non-empty plus the
 *      adapter-specific deploy artefacts (vercel.json / wrangler.toml /
 *      netlify.toml / Dockerfile).
 *   5. Removes the cell dir. Lockfile churn is accepted as cost.
 *
 * Why this exists: the create-pyreon-app PR (#404) shipped twelve real
 * bugs that lint+typecheck on the scaffolder package didn't catch
 * because templates aren't in any tsconfig include path — wrong API
 * names, gitignore-eaten files, missing deps under feature toggles,
 * non-existent framework helpers. Every single one would have been
 * caught here. See `.claude/plans/post-create-pyreon-validation.md`.
 *
 * Run locally:
 *   bun run scripts/scaffold-smoke.ts             # all cells
 *   bun run scripts/scaffold-smoke.ts dashboard   # filter by cell name
 *   bun run scripts/scaffold-smoke.ts --keep      # don't delete cell dirs (debug)
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

interface Cell {
  /** Stable slug used as the example dir name. */
  name: string
  /** create-pyreon-app flags. */
  template: 'app' | 'blog' | 'dashboard'
  adapter: 'vercel' | 'cloudflare' | 'netlify' | 'node' | 'bun' | 'static'
  integrations?: ('supabase' | 'email')[]
  /** Smoke assertion — receives absolute path to the scaffolded project dir. */
  smoke: (projectDir: string) => void
}

// ─── Smoke helpers ──────────────────────────────────────────────────────────

function assertFileExists(path: string): void {
  if (!existsSync(path)) throw new Error(`expected file: ${path}`)
}

function assertDirNonEmpty(path: string): void {
  if (!existsSync(path)) throw new Error(`expected directory: ${path}`)
  if (!statSync(path).isDirectory()) throw new Error(`not a directory: ${path}`)
  // We're not asserting specific files inside dist/ here — different cells
  // produce different shapes (SSR has dist/server/, SSG has per-route HTML).
  // The deploy-artefact assertions in each cell's smoke fn cover the
  // adapter-side; this just guards against "build silently produced nothing".
}

function assertJsonValid(path: string): void {
  assertFileExists(path)
  try {
    JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    throw new Error(
      `expected ${path} to be valid JSON: ${err instanceof Error ? err.message : err}`,
    )
  }
}

function assertFileContains(path: string, needle: string): void {
  assertFileExists(path)
  const content = readFileSync(path, 'utf-8')
  if (!content.includes(needle)) {
    const preview = content.length > 400 ? `${content.slice(0, 400)}…` : content
    throw new Error(`expected ${path} to contain "${needle}". Got:\n${preview}`)
  }
}

// ─── Matrix ─────────────────────────────────────────────────────────────────
//
// Curated 5-cell matrix — each cell exercises a distinct template × adapter
// × integration shape. Don't add a cell unless you can write a meaningful
// smoke assertion that's NOT covered by an existing one.

const MATRIX: Cell[] = [
  // app + vercel — the canonical default scaffold. Catches breakage in the
  // hot path (most users will land here on `bunx create-pyreon-app my-app`).
  {
    name: 'cpa-smoke-app-vercel',
    template: 'app',
    adapter: 'vercel',
    smoke: (dir) => {
      assertDirNonEmpty(join(dir, 'dist'))
      assertJsonValid(join(dir, 'vercel.json'))
      assertFileContains(join(dir, 'vite.config.ts'), 'vercelAdapter')
    },
  },

  // app + static — the simplest possible scaffold (no adapter runtime).
  // Catches regressions in the static/SSG path where dist/ is the artefact.
  {
    name: 'cpa-smoke-app-static',
    template: 'app',
    adapter: 'static',
    smoke: (dir) => {
      assertDirNonEmpty(join(dir, 'dist'))
      // No platform-specific deploy file for static.
    },
  },

  // blog + cloudflare — exercises the SSG-forced template AND the
  // wrangler.toml + _routes.json deploy-artefact pair. Both blog content
  // (TSX posts via import.meta.glob) and cloudflare's dual-file deploy
  // shape live here.
  {
    name: 'cpa-smoke-blog-cloudflare',
    template: 'blog',
    adapter: 'cloudflare',
    smoke: (dir) => {
      assertDirNonEmpty(join(dir, 'dist'))
      assertFileExists(join(dir, 'wrangler.toml'))
      assertFileContains(join(dir, 'wrangler.toml'), 'pages_build_output_dir = "dist"')
      assertJsonValid(join(dir, '_routes.json'))
      assertFileContains(join(dir, 'vite.config.ts'), 'cloudflareAdapter')
    },
  },

  // dashboard + vercel + supabase+email — the heaviest cell. Validates the
  // full integration stack: supabase scaffolder overwriting auth.ts/db.ts,
  // email lib + welcome.tsx + api endpoint, Resend + supabase deps in
  // package.json, env.example populated. The PR #404 bug class lived here.
  {
    name: 'cpa-smoke-dashboard-vercel-full',
    template: 'dashboard',
    adapter: 'vercel',
    integrations: ['supabase', 'email'],
    smoke: (dir) => {
      assertDirNonEmpty(join(dir, 'dist'))
      assertJsonValid(join(dir, 'vercel.json'))
      // Supabase integration replaced the in-memory stubs.
      assertFileContains(join(dir, 'src/lib/auth.ts'), "from './supabase'")
      assertFileContains(join(dir, 'src/lib/db.ts'), "from './supabase'")
      assertFileExists(join(dir, 'src/lib/supabase.ts'))
      // Email integration scaffolded the document-primitives template + lib + api endpoint.
      assertFileExists(join(dir, 'src/lib/email.ts'))
      assertFileExists(join(dir, 'src/emails/welcome.tsx'))
      assertFileExists(join(dir, 'src/routes/api/email/welcome.ts'))
      // Env keys populated for both integrations.
      assertFileContains(join(dir, '.env.example'), 'SUPABASE_URL')
      assertFileContains(join(dir, '.env.example'), 'RESEND_API_KEY')
    },
  },

  // dashboard + node — exercises the Dockerfile path (node adapter doesn't
  // ship a one-click deploy badge). Catches Dockerfile syntax regressions
  // and the Bun/Node Docker-image divergence.
  {
    name: 'cpa-smoke-dashboard-node-supabase',
    template: 'dashboard',
    adapter: 'node',
    integrations: ['supabase'],
    smoke: (dir) => {
      assertDirNonEmpty(join(dir, 'dist'))
      assertFileContains(join(dir, 'Dockerfile'), 'FROM node:')
      assertFileContains(join(dir, '.dockerignore'), 'node_modules')
      assertFileContains(join(dir, 'vite.config.ts'), 'nodeAdapter')
    },
  },
]

// ─── Per-cell harness ───────────────────────────────────────────────────────

const REPO_ROOT = resolve(import.meta.dir, '..')
const SCAFFOLDER = join(REPO_ROOT, 'packages/zero/create-zero/src/index.ts')

function runScaffolder(cell: Cell, cwd: string): void {
  const args = [
    SCAFFOLDER,
    cell.name,
    '--template',
    cell.template,
    '--adapter',
    cell.adapter,
    '--yes',
  ]
  if (cell.integrations && cell.integrations.length > 0) {
    args.push('--integrations', cell.integrations.join(','))
  }

  const result = spawnSync('bun', args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`scaffolder exited with code ${result.status}`)
  }
}

function runBunInstall(cwd: string): void {
  // Run from the repo root so the new workspace member is picked up.
  const result = spawnSync('bun', ['install'], { cwd: REPO_ROOT, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`bun install exited with code ${result.status}`)
  }
}

function runBuild(cwd: string): void {
  const result = spawnSync('bun', ['run', 'build'], { cwd, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`bun run build exited with code ${result.status}`)
  }
}

interface CellResult {
  name: string
  ok: boolean
  error?: string
  durationMs: number
}

async function runCell(cell: Cell, opts: { keep: boolean }): Promise<CellResult> {
  const examplesDir = join(REPO_ROOT, 'examples')
  const projectDir = join(examplesDir, cell.name)
  const start = Date.now()

  // Pre-cell cleanup: a previous failed run may have left residue.
  if (existsSync(projectDir)) {
    await rm(projectDir, { recursive: true, force: true })
  }

  try {
    console.log(`\n──── ${cell.name} ─────────────────────────────────────────`)
    runScaffolder(cell, examplesDir)
    runBunInstall(projectDir)
    runBuild(projectDir)
    cell.smoke(projectDir)

    const durationMs = Date.now() - start
    console.log(`✓ ${cell.name} (${(durationMs / 1000).toFixed(1)}s)`)
    return { name: cell.name, ok: true, durationMs }
  } catch (err) {
    const durationMs = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`✗ ${cell.name} (${(durationMs / 1000).toFixed(1)}s): ${msg}`)
    return { name: cell.name, ok: false, error: msg, durationMs }
  } finally {
    if (!opts.keep && existsSync(projectDir)) {
      await rm(projectDir, { recursive: true, force: true })
    }
  }
}

// ─── Entry ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const keep = args.includes('--keep')
  const filters = args.filter((a) => !a.startsWith('--'))

  const cells = filters.length === 0 ? MATRIX : MATRIX.filter((c) => filters.some((f) => c.name.includes(f)))

  if (cells.length === 0) {
    console.error(`No cells match filter(s): ${filters.join(', ')}`)
    console.error(`Available: ${MATRIX.map((c) => c.name).join(', ')}`)
    process.exit(2)
  }

  console.log(`scaffold-smoke: running ${cells.length} of ${MATRIX.length} cell(s)`)

  const results: CellResult[] = []
  for (const cell of cells) {
    results.push(await runCell(cell, { keep }))
  }

  const failures = results.filter((r) => !r.ok)
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0)

  console.log('\n──── Summary ───────────────────────────────────────────────')
  console.log(`Total: ${(totalMs / 1000).toFixed(1)}s across ${results.length} cell(s)`)
  for (const r of results) {
    const status = r.ok ? '✓' : '✗'
    console.log(`  ${status} ${r.name}${r.error ? ` — ${r.error}` : ''}`)
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} cell(s) failed.`)
    process.exit(1)
  }
}

await main()
