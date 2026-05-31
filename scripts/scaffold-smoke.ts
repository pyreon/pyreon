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
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'

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
  /**
   * Optional second smoke pass: cell runs `bun run preview` against the
   * scaffolded project, waits for the local URL to print to stdout, and
   * fetches it. Receives the URL + the fetched response body (already
   * verified as HTTP 200, non-empty, content-type text/html). Use to
   * assert the page actually renders the right content — guards against
   * "build passes but preview 404s" (the bug `zero preview` had before
   * the dist/client outDir detection landed).
   */
  previewSmoke?: (url: string, body: string) => void
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
  // ALSO exercises `bun run preview` against the built SSR output —
  // guards against the dist/client outDir regression in `zero preview`.
  {
    name: 'cpa-smoke-app-vercel',
    template: 'app',
    adapter: 'vercel',
    smoke: (dir) => {
      assertDirNonEmpty(join(dir, 'dist'))
      assertJsonValid(join(dir, 'vercel.json'))
      assertFileContains(join(dir, 'vite.config.ts'), 'vercelAdapter')
      // README scaffolded with project-name substitution.
      assertFileContains(join(dir, 'README.md'), '# cpa-smoke-app-vercel')
    },
    previewSmoke: (_url, body) => {
      // The scaffolded app's index.html ships with a `data-theme` attr +
      // the favicon link — both unique markers of the standard template.
      if (!body.includes('data-theme=')) {
        throw new Error('preview body missing data-theme attribute')
      }
      if (!body.includes('/favicon.svg')) {
        throw new Error('preview body missing /favicon.svg link')
      }
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
      assertFileContains(join(dir, 'README.md'), '# cpa-smoke-app-static')
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
      // Blog README mentions RSS + content/posts/ (distinct from app's).
      assertFileContains(join(dir, 'README.md'), 'RSS')
      assertFileContains(join(dir, 'README.md'), 'src/content/posts')
    },
    // SSG mode — prerendered HTML at dist/client/index.html. previewSmoke
    // catches the dist/client outDir bug for the static-site path too.
    previewSmoke: (_url, body) => {
      if (!body.includes('data-theme=')) {
        throw new Error('preview body missing data-theme attribute')
      }
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
      // Dashboard README documents the integration choices.
      assertFileContains(join(dir, 'README.md'), '# cpa-smoke-dashboard-vercel-full')
      assertFileContains(join(dir, 'README.md'), 'Auth-gated dashboard')
    },
    // Dashboard SSR shape — same preview-200 contract.
    previewSmoke: (_url, body) => {
      if (!body.includes('data-theme=')) {
        throw new Error('preview body missing data-theme attribute')
      }
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
      // Root README explains the layout + workspace deps.
      assertFileContains(join(dir, 'README.md'), 'Bun workspaces monorepo')
    },
    // NOTE: no previewSmoke here. The isolated monorepo cell installs
    // `@pyreon/zero-cli` from npm (real published 0.25.x, not local
    // source). The `zero preview` dist/client outDir detection fix
    // landed AFTER 0.25.1 — until the next release ships, the published
    // CLI returns 404 from `bun run preview`. The flat cells (which use
    // local workspace source for @pyreon/*) exercise the fix end-to-end
    // and catch the regression.
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

// `import.meta.url` is the standard ESM property — defined in both Bun
// (CLI path: `bun scripts/scaffold-smoke.ts ...`) AND under test loaders
// (vitest's vite-node). Using `URL('..', import.meta.url)` works
// everywhere and survives type-checking in both the script's own
// tsconfig and the test package's tsconfig — which Bun's non-standard
// `import.meta.dir` does NOT (it lacks a TS declaration in the test
// pkg's lib-set, so importing this module from a test fails typecheck).
const REPO_ROOT = new URL('..', import.meta.url).pathname
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

/**
 * Spawn `bun run preview` against the scaffolded project, wait until the
 * preview server prints a `Local: http://localhost:NNNN` line on stdout,
 * fetch the URL, assert HTTP 200 + non-empty HTML, then return the
 * `(url, body)` pair to the cell's `previewSmoke` callback. Kills the
 * server in `finally` regardless of outcome.
 *
 * Guards against the regression the dist/client outDir fix addressed:
 * before the fix, `bun run preview` on an SSR/SSG project served
 * `dist/` (empty) and returned HTTP 404 at the homepage. After: serves
 * `dist/client/` (populated) and returns HTTP 200 + the prerendered
 * shell.
 */
async function runPreviewSmoke(
  projectDir: string,
  previewSmoke: (url: string, body: string) => void,
): Promise<void> {
  const child: ChildProcess = spawn('bun', ['run', 'preview'], {
    cwd: projectDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdoutBuf = ''
  child.stdout?.on('data', (d: Buffer) => {
    stdoutBuf += d.toString()
  })
  child.stderr?.on('data', (d: Buffer) => {
    stdoutBuf += d.toString()
  })

  try {
    // Wait up to 30s for the server to print its URL.
    const url = await waitForUrl(() => stdoutBuf, 30_000)

    // Fetch + assert.
    const response = await fetch(url, { redirect: 'manual' })
    if (response.status !== 200) {
      throw new Error(`preview HTTP ${response.status} from ${url} (expected 200)`)
    }
    const body = await response.text()
    if (body.length === 0) {
      throw new Error(`preview returned empty body from ${url}`)
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) {
      throw new Error(
        `preview returned non-HTML content-type "${contentType}" from ${url}`,
      )
    }

    // Cell-defined assertion (e.g. asserts specific text or marker present).
    previewSmoke(url, body)
  } finally {
    child.kill('SIGTERM')
    // Give the child a moment to exit cleanly so port is released for
    // the next cell. SIGKILL fallback after 2s.
    await new Promise((r) => setTimeout(r, 200))
    if (!child.killed) child.kill('SIGKILL')
  }
}

async function waitForUrl(read: () => string, timeoutMs: number): Promise<string> {
  const start = Date.now()
  // Strip ANSI escape codes before matching — Vite's printUrls() emits
  // them in TTY mode and CI's non-TTY context can intermix them in ways
  // that fool a naive `Local:\s+` regex.
  const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')
  const localRe = /Local:\s*(http:\/\/[^\s]+)/
  // Bare-URL fallback for environments where the "Local:" prefix
  // doesn't land in the parsed buffer for some reason (line buffering,
  // exotic terminal contexts) — any printed http://localhost URL will do.
  const bareRe = /(http:\/\/(?:localhost|127\.0\.0\.1):\d+\b)/
  while (Date.now() - start < timeoutMs) {
    const clean = stripAnsi(read())
    const match = clean.match(localRe) ?? clean.match(bareRe)
    if (match) return match[1]!.replace(/\/$/, '')
    await new Promise((r) => setTimeout(r, 100))
  }
  // Surface the captured output to make CI failures self-diagnosing.
  // Trim to the last 2KB so the log isn't drowned.
  const captured = read()
  const tail = captured.length > 2048 ? captured.slice(-2048) : captured
  throw new Error(
    `preview server did not print a URL within ${timeoutMs}ms. Captured output (tail):\n${tail || '(empty)'}`,
  )
}

interface CellResult {
  name: string
  ok: boolean
  skipped?: boolean
  /** If `skipped`, a short string explaining why (surfaces in the summary). */
  skipReason?: string
  error?: string
  durationMs: number
}

/**
 * Detect the release-PR branch.
 *
 * The changesets/action opens a "chore: version packages" PR from the
 * `changeset-release/<target>` branch (default `changeset-release/main`).
 * That branch's `package.json` files carry the FRESHLY-BUMPED versions
 * that the release workflow would publish on merge — but they aren't on
 * npm yet (the merge IS what publishes them).
 *
 * Isolated cells (today: `cpa-smoke-monorepo-vercel`) run `bun install`
 * from the SCAFFOLDED project root, which resolves `@pyreon/*` deps via
 * the npm registry — not via Pyreon's outer workspace. The scaffolder
 * pins `@pyreon/*` to `^${PYREON_VERSION}` (see
 * `packages/zero/create-zero/src/generators/package-json.ts`), reading
 * its own `package.json` version. On the release-PR branch that becomes
 * `^0.<next>.0` → `bun install` fails with
 * "No version matching ^0.<next>.0 found … (but package exists)" for
 * every framework package, because npm only has the previous published
 * version.
 *
 * That failure is structural — the release PR can't satisfy a gate that
 * asserts published-version installability for versions the same PR is
 * the act of publishing. Auto-skip isolated cells on the release branch
 * with a clear, logged reason. Non-isolated cells keep running — they
 * install from REPO_ROOT (workspace path) and don't need npm.
 *
 * Override `PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE=1` exists for local
 * reproduction without faking the branch name.
 */
function isReleasePR(): { skip: boolean; reason: string } {
  if (process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] === '1') {
    return {
      skip: true,
      reason: 'PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE=1 set (local override)',
    }
  }
  // GitHub Actions sets GITHUB_HEAD_REF to the PR's source branch on
  // pull_request / pull_request_target events. On push events it's empty.
  const headRef = process.env['GITHUB_HEAD_REF'] ?? ''
  if (headRef.startsWith('changeset-release/')) {
    return {
      skip: true,
      reason: `running on changesets release PR branch "${headRef}" — bumped @pyreon/* versions are not yet on npm`,
    }
  }
  return { skip: false, reason: '' }
}

async function runCell(cell: Cell, opts: { keep: boolean }): Promise<CellResult> {
  // Isolated cells get a fresh OS tmpdir so their own workspaces field
  // doesn't conflict with Pyreon's outer workspace discovery. Non-isolated
  // cells go under examples/ so @pyreon/* deps resolve to local source.
  const isolated = cell.isolated === true

  // Auto-skip isolated cells on the changesets release PR — see
  // `isReleasePR` doc for the structural rationale.
  if (isolated) {
    const release = isReleasePR()
    if (release.skip) {
      console.log(`\n──── ${cell.name} ─────────────────────────────────────────`)
      console.log(`⊘ SKIPPED — ${release.reason}`)
      return {
        name: cell.name,
        ok: true,
        skipped: true,
        skipReason: release.reason,
        durationMs: 0,
      }
    }
  }

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

    // Optional second pass: assert `bun run preview` actually serves the
    // built output (catches "build passes but preview 404s" regressions).
    if (cell.previewSmoke) {
      await runPreviewSmoke(projectDir, cell.previewSmoke)
    }

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
  const skipped = results.filter((r) => r.skipped === true)
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0)

  console.log('\n──── Summary ───────────────────────────────────────────────')
  console.log(
    `Total: ${(totalMs / 1000).toFixed(1)}s across ${results.length} cell(s) (${skipped.length} skipped)`,
  )
  for (const r of results) {
    // ⊘ = skipped (auto-bypass per scripted contract); ✓ = ran + passed; ✗ = failed.
    const status = r.skipped ? '⊘' : r.ok ? '✓' : '✗'
    const detail = r.skipped ? ` — SKIPPED (${r.skipReason})` : r.error ? ` — ${r.error}` : ''
    console.log(`  ${status} ${r.name}${detail}`)
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} cell(s) failed.`)
    process.exit(1)
  }
}

// Re-export the release-PR detector so unit tests can exercise it
// without triggering the full matrix via module-eval side effects.
// `isReleasePR` is already defined above (see its doc block for the
// chicken-and-egg rationale).
export { isReleasePR }

// Only execute the matrix when invoked directly (`bun
// scripts/scaffold-smoke.ts ...`), NOT when imported from a test
// (`import { isReleasePR } from '.../scripts/scaffold-smoke'`).
// `import.meta.main` is Bun's idiomatic equivalent of Python's
// `__name__ == '__main__'` — true only for the entry-point module.
if (import.meta.main) {
  await main()
}
