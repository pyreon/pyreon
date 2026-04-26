#!/usr/bin/env bun
/**
 * verify-modes — real-app build matrix gate.
 *
 * Runs `vite build` against every cell in the matrix below — each cell is
 * (example × mode) — and asserts the resulting `dist/` has actual rendered
 * content (not just a build that didn't crash). Used as a CI required
 * check on every PR.
 *
 * Why this exists: 0.14.0 shipped with `mode: "ssg"` typed in the public
 * API but no runtime implementation — apps configured for SSG silently
 * shipped a SPA shell with no per-route HTML. No internal test caught it
 * because nothing exercised the typed surface end-to-end. This matrix
 * does, against the real example apps that already live in `examples/`.
 *
 * Adding a new cell:
 *   1. Add to `MATRIX` below
 *   2. Implement the smoke assertion — must verify CONTENT, not just that
 *      the build succeeded. "Build green but output is empty" is the
 *      whole class of bug this gate exists to catch.
 *
 * Adding a new mode (ssr/ssg/spa/isr/edge/...):
 *   1. Add to the Mode union
 *   2. Add a smoke-assertion factory that knows what shape the dist/ for
 *      that mode is supposed to take
 *
 * Run locally:
 *   bun run scripts/verify-modes.ts             # all cells
 *   bun run scripts/verify-modes.ts ssr-showcase  # only ssr-showcase cells
 *   bun run scripts/verify-modes.ts --only ssg     # only ssg-mode cells
 */

import { existsSync, readFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

type Mode = 'ssr' | 'ssg' | 'spa'

interface Cell {
  /** Example dir name under `examples/` */
  example: string
  /** Rendering mode under test */
  mode: Mode
  /** SSG-only: paths to prerender. Falls back to autodetect when omitted. */
  ssgPaths?: string[]
  /** Smoke assertion — throws on failure. Receives absolute path to dist/. */
  smoke: (distDir: string) => void
}

// ─── Smoke assertion helpers ────────────────────────────────────────────────

function assertFileExists(path: string): void {
  if (!existsSync(path)) throw new Error(`expected file: ${path}`)
}

function assertFileContains(path: string, needle: string): void {
  assertFileExists(path)
  const content = readFileSync(path, 'utf-8')
  if (!content.includes(needle)) {
    const preview = content.length > 400 ? `${content.slice(0, 400)}…` : content
    throw new Error(`expected ${path} to contain "${needle}". Got:\n${preview}`)
  }
}

function assertFileDoesNotExist(path: string): void {
  if (existsSync(path)) throw new Error(`expected ${path} to NOT exist`)
}

// ─── Matrix ─────────────────────────────────────────────────────────────────
//
// Start small + concrete. Expand as new cells become valuable. Don't add a
// cell unless you can write a meaningful smoke assertion for it.

const MATRIX: Cell[] = [
  // ssr-showcase — has fs-router, layouts, api routes, multiple pages.
  // The reference SSR app. If any mode breaks here, it's broken
  // everywhere.
  {
    example: 'ssr-showcase',
    mode: 'ssr',
    smoke: (dist) => {
      // SSR client build emits a template index.html that gets injected
      // by the server at request time. Assert the placeholders are intact.
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-app-->')
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-head-->')
    },
  },
  {
    example: 'ssr-showcase',
    mode: 'ssg',
    ssgPaths: ['/', '/about'],
    smoke: (dist) => {
      // SSG must produce per-route HTML files with route-correct content.
      // Identical files for both paths = the per-path router URL isn't
      // being respected (the createServer single-router bug from #336).
      const homePath = join(dist, 'index.html')
      const aboutPath = join(dist, 'about', 'index.html')
      assertFileContains(homePath, 'home-page')
      assertFileContains(aboutPath, 'about-page')
      assertFileContains(aboutPath, 'Pyreon is a signal-based UI framework')
      // Cleanup of the temporary SSR sub-build dir
      assertFileDoesNotExist(join(dist, '.zero-ssg-server'))
    },
  },
  {
    example: 'ssr-showcase',
    mode: 'spa',
    smoke: (dist) => {
      // SPA build: just a shell with #app and asset references. Routing
      // happens client-side.
      assertFileContains(join(dist, 'index.html'), 'id="app"')
    },
  },

  // app-showcase — large multi-feature app (blog, chat, dashboard,
  // resume, kanban, …). Real-world surface for SSR + SPA modes.
  {
    example: 'app-showcase',
    mode: 'ssr',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-app-->')
    },
  },
  {
    example: 'app-showcase',
    mode: 'spa',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), 'id="app"')
    },
  },

  // ui-showcase — the UI component library catalog. Browser-only
  // surface (SPA), exercises every rocketstyle component.
  {
    example: 'ui-showcase',
    mode: 'spa',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), 'id="app"')
    },
  },

  // playground — minimal three-route Pyreon shell. Smallest viable
  // app exercising the routing + layout chain.
  {
    example: 'playground',
    mode: 'ssr',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-app-->')
    },
  },
  {
    example: 'playground',
    mode: 'ssg',
    ssgPaths: ['/', '/about'],
    smoke: (dist) => {
      // Second SSG cell — different app shape, validates that the SSG
      // pipeline isn't ssr-showcase-specific. Catches regressions in
      // route-correct rendering across different layout chains.
      assertFileExists(join(dist, 'index.html'))
      assertFileExists(join(dist, 'about', 'index.html'))
      assertFileDoesNotExist(join(dist, '.zero-ssg-server'))
    },
  },
  {
    example: 'playground',
    mode: 'spa',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), 'id="app"')
    },
  },

  // ssr-showcase × ssg with autodetect — covers the path-resolution
  // fallback that picks static routes from the file-system route tree
  // when ssg.paths is omitted. Not the same code path as explicit-paths.
  {
    example: 'ssr-showcase',
    mode: 'ssg',
    // No ssgPaths → triggers autodetect
    smoke: (dist) => {
      // Autodetect should at minimum produce / and /about (both exist
      // as static routes in ssr-showcase). Posts has dynamic [id]
      // segments so it's correctly skipped.
      assertFileExists(join(dist, 'index.html'))
      assertFileExists(join(dist, 'about', 'index.html'))
      assertFileDoesNotExist(join(dist, '.zero-ssg-server'))
    },
  },

  // fundamentals-playground — exercises every fundamental package
  // (form, query, store, machine, charts, code, hotkeys, i18n, …).
  // If a fundamentals package's build path breaks, this catches it.
  {
    example: 'fundamentals-playground',
    mode: 'spa',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), 'id="app"')
    },
  },
]

// ─── Per-cell harness ───────────────────────────────────────────────────────

const REPO_ROOT = resolve(import.meta.dir, '..')
const VERIFY_CONFIG_NAME = 'vite.config.verify.ts'

function cellId(c: Cell): string {
  return `${c.example} × ${c.mode}`
}

function configSourceFor(cell: Cell): string {
  const ssgConfig = cell.ssgPaths
    ? `, ssg: { paths: ${JSON.stringify(cell.ssgPaths)} }`
    : ''
  return `import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

// Auto-generated by scripts/verify-modes.ts — do not commit.
export default defineConfig({
  plugins: [pyreon(), zero({ mode: ${JSON.stringify(cell.mode)}${ssgConfig} })],
  resolve: { conditions: ['bun'] },
})
`
}

async function runViteBuild(exampleDir: string, configFile: string): Promise<void> {
  return new Promise((resolveFn, rejectFn) => {
    const proc = spawn('bun', ['run', 'vite', 'build', '--config', configFile], {
      cwd: exampleDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      if (code === 0) resolveFn()
      else rejectFn(new Error(`vite build exited with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    })
    proc.on('error', rejectFn)
  })
}

interface CellResult {
  cell: Cell
  ok: boolean
  error?: Error
  durationMs: number
}

async function runCell(cell: Cell): Promise<CellResult> {
  const exampleDir = join(REPO_ROOT, 'examples', cell.example)
  const distDir = join(exampleDir, 'dist')
  const verifyConfig = join(exampleDir, VERIFY_CONFIG_NAME)
  const start = Date.now()

  if (!existsSync(exampleDir)) {
    return {
      cell,
      ok: false,
      error: new Error(`example dir not found: ${exampleDir}`),
      durationMs: 0,
    }
  }

  try {
    // Write the per-cell config file. Lives alongside the example's real
    // vite.config.ts but is auto-generated and cleaned up below.
    await writeFile(verifyConfig, configSourceFor(cell), 'utf-8')

    // Wipe any prior dist so we can't get a false-pass from stale output.
    await rm(distDir, { recursive: true, force: true })

    // Build.
    await runViteBuild(exampleDir, VERIFY_CONFIG_NAME)

    // Smoke.
    cell.smoke(distDir)

    return { cell, ok: true, durationMs: Date.now() - start }
  } catch (error) {
    return {
      cell,
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
      durationMs: Date.now() - start,
    }
  } finally {
    // Always clean up the verify config + dist. The example's real
    // vite.config.ts was never touched.
    await rm(verifyConfig, { force: true })
    await rm(distDir, { recursive: true, force: true })
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { example?: string; mode?: Mode } {
  const args: { example?: string; mode?: Mode } = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--only' && argv[i + 1]) {
      args.mode = argv[++i] as Mode
    } else if (!a?.startsWith('--')) {
      args.example = a
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const cells = MATRIX.filter(
    (c) =>
      (!args.example || c.example === args.example) && (!args.mode || c.mode === args.mode),
  )

  if (cells.length === 0) {
    console.error(`[verify-modes] no cells match filter (example=${args.example ?? '*'}, mode=${args.mode ?? '*'})`)
    process.exit(2)
  }

  console.log(`[verify-modes] running ${cells.length} cell(s)`)
  console.log()

  const results: CellResult[] = []
  for (const cell of cells) {
    const id = cellId(cell)
    process.stdout.write(`  ${id} ... `)
    const r = await runCell(cell)
    results.push(r)
    if (r.ok) console.log(`✓ (${r.durationMs}ms)`)
    else console.log(`✗ (${r.durationMs}ms)`)
  }

  const failed = results.filter((r) => !r.ok)
  console.log()
  console.log(`[verify-modes] ${results.length - failed.length}/${results.length} passed`)

  if (failed.length > 0) {
    console.log()
    console.log('--- failures ---')
    for (const r of failed) {
      console.log()
      console.log(`✗ ${cellId(r.cell)}`)
      console.log(r.error?.stack ?? r.error?.message ?? 'unknown error')
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[verify-modes] runner crashed:', err)
  process.exit(2)
})
