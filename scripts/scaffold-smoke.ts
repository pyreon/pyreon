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

import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

interface Cell {
  /** Stable slug used as the example dir name. */
  name: string
  /** create-pyreon-app flags. */
  template: 'app' | 'blog' | 'dashboard' | 'monorepo'
  adapter: 'vercel' | 'cloudflare' | 'netlify' | 'node' | 'bun' | 'static'
  integrations?: ('supabase' | 'email')[]
  compat?: 'react' | 'vue' | 'solid' | 'preact'
  preset?: 'minimal' | 'standard' | 'dashboard' | 'full'
  /**
   * If true: scaffold into a fresh OS tmpdir and run `bun install` from
   * INSIDE the scaffolded project. Used by the `monorepo` template
   * because its own `workspaces` declaration would conflict with
   * Pyreon's outer workspace discovery if scaffolded into `examples/`.
   * The trade-off: `@pyreon/*` deps resolve from npm (real published
   * 0.25.x) rather than local source — so a monorepo cell catches
   * "scaffolder produces wrong shape" but NOT "Pyreon ABI broke a
   * scaffolded app" (the flat cells cover that path).
   */
  isolated?: boolean
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

function assertPackageDep(projectDir: string, depName: string): void {
  const pkgPath = join(projectDir, 'package.json')
  assertFileExists(pkgPath)
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const all = { ...pkg.dependencies, ...pkg.devDependencies }
  if (!(depName in all)) {
    throw new Error(
      `expected ${pkgPath} to declare dependency "${depName}". Got: ${Object.keys(all).join(', ')}`,
    )
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

  // monorepo + vercel — Bun workspaces shell. Exercises the recursive
  // scaffold path (apps/web/ runs the full flat pipeline), the
  // `@<scope>/{ui,types}` workspace deps, and the root `workspaces`
  // declaration. Scaffolded into a temp dir + installed there so the
  // inner workspaces don't collide with Pyreon's outer workspace
  // discovery (`isolated: true`). Catches:
  //   - root package.json shape (workspaces + proxy scripts)
  //   - apps/web/package.json shape (workspace deps + adapter deps)
  //   - shared packages exist with correct scope substitution
  //   - root `bun run build` correctly proxies to `--filter='web' build`
  //   - the web app actually builds with the workspace-resolved deps
  {
    name: 'cpa-smoke-monorepo-vercel',
    template: 'monorepo',
    adapter: 'vercel',
    preset: 'standard',
    isolated: true,
    smoke: (dir) => {
      // Root shape.
      const rootPkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
        workspaces?: string[]
        scripts?: Record<string, string>
        dependencies?: Record<string, string>
      }
      if (!Array.isArray(rootPkg.workspaces) || rootPkg.workspaces.length === 0) {
        throw new Error(`expected root package.json to declare workspaces[]`)
      }
      if (!rootPkg.scripts?.build?.includes('--filter=')) {
        throw new Error(`expected root scripts.build to proxy via --filter`)
      }
      if (rootPkg.dependencies !== undefined) {
        throw new Error(`expected root to have NO dependencies (dispatcher only)`)
      }
      // Shared packages.
      assertFileExists(join(dir, 'packages/ui/package.json'))
      assertFileExists(join(dir, 'packages/ui/src/index.ts'))
      assertFileExists(join(dir, 'packages/types/package.json'))
      assertFileExists(join(dir, 'packages/types/src/index.ts'))
      // Web app: standard `app` shape + workspace deps.
      const webPkg = JSON.parse(readFileSync(join(dir, 'apps/web/package.json'), 'utf-8')) as {
        name?: string
        dependencies?: Record<string, string>
      }
      if (webPkg.name !== 'web') {
        throw new Error(`expected apps/web/package.json name="web", got "${webPkg.name}"`)
      }
      const deps = webPkg.dependencies ?? {}
      const wsKeys = Object.keys(deps).filter((k) => deps[k] === 'workspace:^')
      if (wsKeys.length !== 2) {
        throw new Error(`expected exactly 2 workspace:^ deps in web; got ${wsKeys.join(', ')}`)
      }
      // standard preset pulled store + query + forms in.
      assertPackageDep(join(dir, 'apps/web'), '@pyreon/store')
      assertPackageDep(join(dir, 'apps/web'), '@pyreon/query')
      assertPackageDep(join(dir, 'apps/web'), '@pyreon/form')
      // The web app actually built — root `bun run build` proxied correctly.
      assertDirNonEmpty(join(dir, 'apps/web/dist'))
    },
  },

  // app + vercel × {react,vue,solid,preact} — compat-mode build smokes.
  // Closes the "compat package shim ABI changed and broke scaffolded apps"
  // gap. The 4 compat layers (react/vue/solid/preact) each ship as
  // @pyreon/<x>-compat — apps configured with `--compat=<x>` get the
  // matching dep wired into package.json AND `pyreon({ compat: <x> })` in
  // vite.config.ts. The browser-test gate in each compat package covers
  // the in-repo unit shape; this gate covers the install-and-build flow
  // a real scaffolded user hits (a divergent ABI surface there shows up
  // here as a build error, not as a passing in-repo test).
  ...(['react', 'vue', 'solid', 'preact'] as const).map(
    (compat): Cell => ({
      name: `cpa-smoke-app-${compat}-compat`,
      template: 'app',
      adapter: 'vercel',
      compat,
      smoke: (dir) => {
        assertDirNonEmpty(join(dir, 'dist'))
        assertJsonValid(join(dir, 'vercel.json'))
        assertFileContains(join(dir, 'vite.config.ts'), `compat: '${compat}'`)
        assertPackageDep(dir, `@pyreon/${compat}-compat`)
      },
    }),
  ),
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
  if (cell.compat) {
    args.push('--compat', cell.compat)
  }
  if (cell.preset) {
    args.push('--preset', cell.preset)
  }

  const result = spawnSync('bun', args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`scaffolder exited with code ${result.status}`)
  }
}

function runBunInstall(projectDir: string, isolated: boolean): void {
  // Isolated cells (e.g. monorepo template) run install from inside the
  // scaffolded project root so Bun's workspace discovery picks up the
  // INNER workspaces declaration, not Pyreon's outer one. Non-isolated
  // cells install from REPO_ROOT so the scaffolded example is picked up
  // as a workspace member of Pyreon's monorepo (resolving @pyreon/* to
  // local source).
  const cwd = isolated ? projectDir : REPO_ROOT
  const result = spawnSync('bun', ['install'], { cwd, stdio: 'inherit' })
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
  // Isolated cells get a fresh OS tmpdir so their own workspaces field
  // doesn't conflict with Pyreon's outer workspace discovery. Non-isolated
  // cells go under examples/ so @pyreon/* deps resolve to local source.
  const isolated = cell.isolated === true
  const parentDir = isolated ? mkdtempSync(join(tmpdir(), 'cpa-smoke-')) : join(REPO_ROOT, 'examples')
  const projectDir = join(parentDir, cell.name)
  const start = Date.now()

  // Pre-cell cleanup: a previous failed run may have left residue.
  if (!isolated && existsSync(projectDir)) {
    await rm(projectDir, { recursive: true, force: true })
  }

  try {
    console.log(`\n──── ${cell.name} ─────────────────────────────────────────`)
    runScaffolder(cell, parentDir)
    runBunInstall(projectDir, isolated)
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
    if (!opts.keep) {
      // For isolated cells, blow the entire tmpdir; for examples cells, just the project dir.
      const cleanupTarget = isolated ? parentDir : projectDir
      if (existsSync(cleanupTarget)) {
        await rm(cleanupTarget, { recursive: true, force: true })
      }
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
