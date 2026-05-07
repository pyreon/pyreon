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

import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
  /**
   * If true, run `vite build` against the example's existing `vite.config.ts`
   * unchanged — no auto-generated verify config. Use this for examples that
   * don't go through `@pyreon/zero` (e.g. islands-showcase uses bare
   * `@pyreon/vite-plugin` with `ssr: { entry }`). Defaults to false.
   */
  useExampleConfig?: boolean
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

interface ChunkGraphSpec {
  /**
   * For each entry: assert one chunk file under `dist/assets/` whose
   * basename starts with `<name>-` exists, AND its content contains every
   * `fingerprints` string. Fingerprints are content-strings that survive
   * minification — string literals, attribute values, JSX `data-testid`
   * values. Identifier-renaming-resistant; filename basename is the
   * Vite-natural per-dynamic-import chunk shape.
   */
  mustHaveChunks: { name: string; fingerprints: string[]; maxGzippedKb?: number }[]
  /**
   * Strings that must NOT appear in ANY `dist/assets/*.js` chunk.
   * Use this to assert `hydrate: 'never'` islands genuinely ship zero
   * client JS — their identifiers / attributes / props must be absent
   * from every chunk that the entry can reach.
   */
  mustNotContainStrings: string[]
  /**
   * Filename-basename prefixes that must NOT exist as chunks.
   * Catches the regression where a never-strategy island gets pulled
   * into the client graph (e.g. via accidental registry entry, accidental
   * static import from a hydrated island).
   */
  mustNotHaveChunks: string[]
}

function assertChunkGraph(distDir: string, spec: ChunkGraphSpec): void {
  const assetsDir = join(distDir, 'assets')
  if (!existsSync(assetsDir)) {
    throw new Error(`expected ${assetsDir} to exist (build did not emit dist/assets/)`)
  }
  const allFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'))

  // ── Per-island chunk presence + fingerprints ────────────────────────────
  for (const { name, fingerprints, maxGzippedKb } of spec.mustHaveChunks) {
    const chunkFile = allFiles.find((f) => f.startsWith(`${name}-`))
    if (!chunkFile) {
      throw new Error(
        `expected chunk for "${name}" in ${assetsDir} (looking for ${name}-*.js).\n` +
          `Got: ${allFiles.join(', ')}.\n` +
          `This means the island's loader didn't produce its own dynamic-import ` +
          `chunk — it may have been inlined into the entry, or its registry ` +
          `entry is missing.`,
      )
    }
    const chunkPath = join(assetsDir, chunkFile)
    const content = readFileSync(chunkPath, 'utf-8')
    for (const fp of fingerprints) {
      if (!content.includes(fp)) {
        const preview = content.length > 200 ? `${content.slice(0, 200)}…` : content
        throw new Error(
          `expected chunk ${chunkFile} to contain "${fp}" (component fingerprint).\n` +
            `Got first 200 chars:\n${preview}`,
        )
      }
    }
    if (maxGzippedKb != null) {
      // Approximate gzipped size: raw bytes / ~3 (typical JS minify+gzip ratio).
      // The exact number isn't important — we want to catch a 10× regression,
      // not police single-byte deltas.
      const rawBytes = Buffer.byteLength(content, 'utf-8')
      const approxGzKb = rawBytes / 3 / 1024
      if (approxGzKb > maxGzippedKb) {
        throw new Error(
          `chunk ${chunkFile} approx-gzipped size ${approxGzKb.toFixed(2)} kB ` +
            `exceeds budget ${maxGzippedKb} kB. Investigate before bumping.`,
        )
      }
    }
  }

  // ── Per-island chunk absence ─────────────────────────────────────────────
  for (const name of spec.mustNotHaveChunks) {
    const offender = allFiles.find((f) => f.startsWith(`${name}-`))
    if (offender) {
      throw new Error(
        `chunk "${offender}" exists but should NOT — "${name}" is a ` +
          `hydrate: 'never' island and shouldn't be in the client bundle ` +
          `graph at all. Check: did it get registered in hydrateIslands(), ` +
          `or is it statically imported from a hydrated island?`,
      )
    }
  }

  // ── Content-string absence (defense-in-depth across all chunks) ─────────
  for (const needle of spec.mustNotContainStrings) {
    for (const file of allFiles) {
      const content = readFileSync(join(assetsDir, file), 'utf-8')
      if (content.includes(needle)) {
        throw new Error(
          `string "${needle}" found in chunk ${file}, but it must NOT appear ` +
            `in any client chunk. This typically means a hydrate: 'never' ` +
            `island leaked into the client graph.`,
        )
      }
    }
  }
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
      // Styler CSS flush regression: about.ts uses a `styled('span')` so
      // its SSG render populates `@pyreon/styler`'s `sheet.ssrBuffer`.
      // Pre-fix, prerendered HTML carried styler-generated class names
      // but ZERO `<style>` tags — CSS only appeared after client JS ran.
      // The fix in ssg-plugin.ts injects `<style data-pyreon-styler="...">`
      // into the head during SSG via a lazy-imported styler integration.
      // Bisect-verifiable: revert ssg-plugin.ts to the no-flush version
      // and this assertion fails (the home page doesn't use styler so
      // it intentionally produces no tag — only assert about page).
      assertFileContains(aboutPath, 'data-pyreon-styler')
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

  // islands-showcase — verifies the "ship per-island JS" pitch at the
  // bundle-output level. PR #461 verified hydration; this verifies the
  // BUILD: each `island()` declaration produces its own dynamic-import
  // chunk, and `hydrate: 'never'` islands genuinely ship zero client JS.
  //
  // Bundle splitting could regress silently otherwise — every browser
  // smoke + e2e test would still pass even if all islands were inlined
  // into the entry, defeating the value prop.
  //
  // Uses the example's bare `pyreon({ ssr })` config (no `@pyreon/zero`).
  {
    example: 'islands-showcase',
    mode: 'ssr',
    useExampleConfig: true,
    smoke: (dist) => {
      // Server still emits the SSR template at build time.
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-app-->')
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-scripts-->')

      // Per-island chunks + content fingerprints + size budget.
      // Budget is generous (5 KB approx-gzipped) — current chunks are
      // 0.4-0.6 KB each. Catches an order-of-magnitude regression, not
      // single-byte drift.
      assertChunkGraph(dist, {
        mustHaveChunks: [
          { name: 'Counter', fingerprints: ['counter-inc', 'counter-value'], maxGzippedKb: 5 },
          { name: 'IdleClock', fingerprints: ['idle-clock-time'], maxGzippedKb: 5 },
          { name: 'VisibleComments', fingerprints: ['visible-comments-list'], maxGzippedKb: 5 },
          { name: 'MobileMenu', fingerprints: ['mobile-menu-toggle', 'mobile-menu-state'], maxGzippedKb: 5 },
        ],
        // hydrate: 'never' islands MUST be absent from the client bundle.
        // No chunk with their basename, AND no chunk content referencing
        // their identifiers / attributes.
        mustNotHaveChunks: ['StaticBadge'],
        mustNotContainStrings: ['static-badge'],
      })
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
    if (cell.useExampleConfig) {
      // Run the example's real vite.config.ts unchanged. Used for examples
      // that don't go through @pyreon/zero (e.g. islands-showcase uses
      // bare @pyreon/vite-plugin).
      await rm(distDir, { recursive: true, force: true })
      await runViteBuild(exampleDir, 'vite.config.ts')
    } else {
      // Write the per-cell config file. Lives alongside the example's real
      // vite.config.ts but is auto-generated and cleaned up below.
      await writeFile(verifyConfig, configSourceFor(cell), 'utf-8')
      // Wipe any prior dist so we can't get a false-pass from stale output.
      await rm(distDir, { recursive: true, force: true })
      // Build.
      await runViteBuild(exampleDir, VERIFY_CONFIG_NAME)
    }

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
