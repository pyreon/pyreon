#!/usr/bin/env bun
/**
 * check-import-budgets — PER-IMPORT bundle-size budget gate.
 *
 * `check-bundle-budgets` measures each package's FULL main entry
 * (`export *`). That catches a package getting fatter overall, but it
 * CANNOT see the failure mode that matters most for app bundle size:
 * an optional feature silently STOPPING tree-shaking, so a minimal
 * import (`import { mount }`) starts dragging in code it never used to.
 *
 * This gate locks the gzipped size of the CANONICAL MINIMAL IMPORTS that
 * real apps actually write — `mount`-only, `signal`/`computed`/`effect`,
 * a basic `RouterProvider`+`RouterView`+`RouterLink`. If a future change
 * makes one of those pull in (say) the animation runtime or the SSR
 * loader helpers, the minimal-import size jumps and this gate fails even
 * though the full-barrel budget is unchanged.
 *
 * Measurement method mirrors `check-bundle-budgets` EXACTLY (so the two
 * gates are comparable + the method is already CI-proven): bundle the
 * package's built `lib/index.js` re-exporting only the scenario's
 * symbols, with Bun's bundler (minify, target:bun,
 * `define NODE_ENV=production`), externalizing `@pyreon/*` + `node:*` +
 * every bare-module specifier the lib touches. The measured number is
 * the UNIQUE bytes that import adds on top of the (externalized)
 * workspace deps — internally consistent run-to-run, which is what makes
 * it a reliable REGRESSION gate.
 *
 * Honest caveat (documented, not hidden): because workspace `@pyreon/*`
 * deps are externalized (this monorepo doesn't symlink them into
 * node_modules, so a true by-name / inline-deps build isn't available
 * outside a full Vite app), the ABSOLUTE numbers can slightly over-count
 * a separately-imported optional module vs a real app that bundles
 * `@pyreon/core` inline and honors ITS `sideEffects:false`. The gate's
 * job is regression detection on a consistent method, not a byte-exact
 * prediction of one specific consumer bundler.
 *
 * Run:
 *   bun run check-import-budgets          # exit non-zero on regression
 *   bun run check-import-budgets --json   # machine-readable
 *   bun run check-import-budgets --update # relock budgets from current sizes
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { parseSync, Visitor } from 'oxc-parser'

// Minimal ambient for Bun's bundler. This script is a Bun bin entry, but
// its pure helpers are imported by `@pyreon/test-utils`, whose tsconfig
// doesn't include `@types/bun` — the local declaration keeps that
// typecheck happy without forcing the dep downstream. Mirrors the
// `declare const Bun` pattern in `scripts/serve-ssg.ts`.
declare const Bun: {
  build(options: {
    entrypoints: string[]
    minify?: boolean
    target?: string
    splitting?: boolean
    outdir?: string
    external?: string[]
    define?: Record<string, string>
  }): Promise<{
    success: boolean
    logs: unknown[]
    outputs: Array<{ kind: string; text(): Promise<string> }>
  }>
}

// Resolved lazily, not at module top level: `import.meta.dir` is a
// Bun-only global (undefined under vitest's loader), and the pure
// helpers (buildEntrySource / compareToBudgets / SCENARIOS) are imported
// by the test suite WITHOUT running the script. Only main()/measure need
// these paths, and they only run under `import.meta.main` (real Bun run).
function repoRoot(): string {
  // `import.meta.dir` is a Bun-only global; cast since the shared
  // ImportMeta type doesn't declare it.
  const dir = (import.meta as { dir?: string }).dir ?? process.cwd()
  return resolve(dir, '..')
}
function budgetsPath(): string {
  return join(repoRoot(), 'scripts', 'import-budgets.json')
}

/** A canonical minimal import a real app writes, + the package it targets. */
export interface Scenario {
  /** Stable budget key. */
  id: string
  /** Workspace package name (for messages). */
  pkg: string
  /** Path to the package dir, relative to `packages/`. */
  dir: string
  /** Named exports the scenario imports (re-exported so they're retained). */
  imports: string[]
}

/**
 * The app-critical client packages + the imports real apps actually
 * write. Deliberately NOT the heavy fundamentals (charts/flow/document)
 * — those are lazy-loaded by design and covered by the full-barrel
 * budget + the `no-eager-import` lint rule.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: '@pyreon/reactivity::signals',
    pkg: '@pyreon/reactivity',
    dir: 'core/reactivity',
    imports: ['signal', 'computed', 'effect', 'batch', 'onCleanup', 'untrack'],
  },
  {
    id: '@pyreon/runtime-dom::mount',
    pkg: '@pyreon/runtime-dom',
    dir: 'core/runtime-dom',
    imports: ['mount', 'render'],
  },
  {
    id: '@pyreon/runtime-dom::mount+hydrate',
    pkg: '@pyreon/runtime-dom',
    dir: 'core/runtime-dom',
    imports: ['mount', 'render', 'hydrateRoot'],
  },
  {
    id: '@pyreon/router::basic',
    pkg: '@pyreon/router',
    dir: 'core/router',
    imports: ['RouterProvider', 'RouterView', 'RouterLink'],
  },
  {
    // Locks the PURE-form branding win (elements PR, 2026-07): bare top-level
    // `Component.x = y` brand assignments pinned EVERY component into every
    // consumer bundle — importing just <Portal> paid the whole 7.5KB gz of
    // @pyreon/elements; the fix took it to ~2.4KB and <Element> to ~4.0KB.
    // One reverted file taxes the SIBLING imports (the components pin each
    // other), so the aggregate outcome is what must be locked — a per-file
    // guard can't see it.
    id: '@pyreon/elements::portal',
    pkg: '@pyreon/elements',
    dir: 'ui-system/elements',
    imports: ['Portal'],
  },
  {
    id: '@pyreon/elements::element',
    pkg: '@pyreon/elements',
    dir: 'ui-system/elements',
    imports: ['Element'],
  },
  {
    id: '@pyreon/core::jsx',
    pkg: '@pyreon/core',
    dir: 'core/core',
    imports: ['h', 'Fragment', 'createContext', 'useContext'],
  },
]

/**
 * Build the temp-entry source for a scenario: re-export the chosen
 * symbols FROM the package's built `lib/index.js` (absolute path). The
 * re-export is what keeps those symbols (and only those) live, so the
 * bundler tree-shakes everything else away. Pure — unit-tested.
 */
export function buildEntrySource(absLibPath: string, imports: string[]): string {
  const names = imports.join(', ')
  // JSON.stringify the path so a Windows backslash / odd char can't
  // break the string literal.
  return `export { ${names} } from ${JSON.stringify(absLibPath)}\n`
}

export interface MeasuredImport {
  id: string
  pkg: string
  raw: number
  gzip: number
  failed?: boolean
  error?: string
}

export interface BudgetRegression {
  id: string
  gzip: number
  budget: number
  overBy: number
}

/**
 * Compare measured sizes to locked budgets. A scenario regresses when
 * its gzip exceeds its budget. Missing budgets are reported as
 * regressions too (a new scenario must be locked via `--update`). Pure
 * — unit-tested.
 */
export function compareToBudgets(
  measured: MeasuredImport[],
  budgets: Record<string, number>,
): { regressions: BudgetRegression[]; missing: string[] } {
  const regressions: BudgetRegression[] = []
  const missing: string[] = []
  for (const m of measured) {
    if (m.failed) continue
    const budget = budgets[m.id]
    if (budget === undefined) {
      missing.push(m.id)
      continue
    }
    if (m.gzip > budget) {
      regressions.push({ id: m.id, gzip: m.gzip, budget, overBy: m.gzip - budget })
    }
  }
  return { regressions, missing }
}

// ─── bare-module collector (mirrors check-bundle-budgets) ──────────────────

function collectBareModuleImports(dir: string): string[] {
  const found = new Set<string>()
  const record = (spec: string | undefined): void => {
    if (!spec) return
    if (spec.startsWith('.') || spec.startsWith('/')) return
    if (spec.startsWith('node:')) return
    if (spec.startsWith('@pyreon/')) return
    found.add(spec)
    const slashIdx = spec.startsWith('@')
      ? spec.indexOf('/', spec.indexOf('/') + 1)
      : spec.indexOf('/')
    if (slashIdx > 0) found.add(`${spec.slice(0, slashIdx)}/*`)
  }
  const extract = (filePath: string, src: string): void => {
    let program
    try {
      program = parseSync(filePath, src, { sourceType: 'module', lang: 'js' }).program
    } catch {
      return
    }
    const onSource = (node: any): void => {
      record(typeof node.source?.value === 'string' ? node.source.value : undefined)
    }
    const visitor = new Visitor({
      ImportDeclaration: onSource,
      ExportNamedDeclaration: (node: any) => {
        if (node.source) onSource(node)
      },
      ExportAllDeclaration: onSource,
      ImportExpression: (node: any) => {
        record(typeof node.source?.value === 'string' ? node.source.value : undefined)
      },
    })
    visitor.visit(program)
  }
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith('.js')) {
        try {
          extract(p, readFileSync(p, 'utf8'))
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
  try {
    walk(dir)
  } catch {
    /* no lib dir */
  }
  return [...found]
}

// ─── measurement ───────────────────────────────────────────────────────────

function getPackagesRoot(): string {
  const flag = process.argv.find((a) => a.startsWith('--packages-root='))
  if (flag) return resolve(flag.slice('--packages-root='.length))
  return join(repoRoot(), 'packages')
}

async function measureScenario(s: Scenario): Promise<MeasuredImport> {
  const pkgDir = join(getPackagesRoot(), s.dir)
  const lib = join(pkgDir, 'lib', 'index.js')
  let tmp: string | undefined
  try {
    const externals = collectBareModuleImports(join(pkgDir, 'lib'))
    tmp = mkdtempSync(join(tmpdir(), 'import-budget-'))
    const entry = join(tmp, 'entry.js')
    writeFileSync(entry, buildEntrySource(lib, s.imports))
    const result = await Bun.build({
      entrypoints: [entry],
      minify: true,
      target: 'bun',
      splitting: true,
      outdir: join(tmp, 'out'),
      external: ['@pyreon/*', 'node:*', ...externals],
      define: { 'process.env.NODE_ENV': '"production"' },
    })
    if (!result.success) {
      return {
        id: s.id,
        pkg: s.pkg,
        raw: 0,
        gzip: 0,
        failed: true,
        error: result.logs.map((l) => String(l)).join('\n'),
      }
    }
    const out = result.outputs.find((o) => o.kind === 'entry-point')
    if (!out) {
      return { id: s.id, pkg: s.pkg, raw: 0, gzip: 0, failed: true, error: 'no entry-point output' }
    }
    const code = await out.text()
    return {
      id: s.id,
      pkg: s.pkg,
      raw: Buffer.byteLength(code, 'utf-8'),
      gzip: gzipSync(code, { level: 9 }).byteLength,
    }
  } catch (err) {
    return {
      id: s.id,
      pkg: s.pkg,
      raw: 0,
      gzip: 0,
      failed: true,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    if (tmp) {
      try {
        rmSync(tmp, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  const updateMode = args.includes('--update')

  const measured: MeasuredImport[] = []
  for (const s of SCENARIOS) measured.push(await measureScenario(s))

  const failures = measured.filter((m) => m.failed)

  if (updateMode) {
    if (failures.length > 0) {
      console.error('[check-import-budgets] Refusing to --update: some scenarios failed to build:')
      for (const f of failures) console.error(`  ✗ ${f.id}: ${f.error?.split('\n')[0]}`)
      process.exit(1)
    }
    const budgets: Record<string, number> = {}
    // Lock current size + 3% headroom so minor bundler-version byte
    // jitter doesn't flake the gate; a real regression (this gate
    // targets the ~1 KB tree-shaking-broke class) still trips it.
    for (const m of measured) budgets[m.id] = Math.ceil(m.gzip * 1.03)
    writeFileSync(budgetsPath(), `${JSON.stringify(budgets, null, 2)}\n`)
    console.log(`[check-import-budgets] Relocked ${measured.length} budget(s) → ${budgetsPath()}`)
    return
  }

  let budgets: Record<string, number> = {}
  try {
    budgets = JSON.parse(readFileSync(budgetsPath(), 'utf8'))
  } catch {
    console.error(`[check-import-budgets] No budgets file at ${budgetsPath()}. Run --update first.`)
    process.exit(1)
  }

  const { regressions, missing } = compareToBudgets(measured, budgets)

  if (jsonMode) {
    console.log(JSON.stringify({ measured, regressions, missing, failures }, null, 2))
  } else {
    for (const m of measured) {
      if (m.failed) continue
      const budget = budgets[m.id]
      const tag = budget === undefined ? 'NEW' : m.gzip > budget ? 'OVER' : 'ok'
      console.log(
        `  ${tag.padEnd(4)} ${m.id.padEnd(38)} gz=${String(m.gzip).padStart(5)}` +
          (budget !== undefined ? `  budget=${budget}` : ''),
      )
    }
    for (const f of failures) console.error(`  ✗ FAILED ${f.id}: ${f.error?.split('\n')[0]}`)
  }

  // Surface failures + regressions; exit non-zero (the
  // CI-gates-must-surface-failures lesson — never silently pass).
  if (failures.length > 0) {
    if (!jsonMode)
      console.error(`\n[check-import-budgets] ${failures.length} scenario(s) failed to BUILD.`)
    process.exit(1)
  }
  if (missing.length > 0) {
    if (!jsonMode)
      console.error(
        `\n[check-import-budgets] ${missing.length} scenario(s) have no budget — run --update: ${missing.join(', ')}`,
      )
    process.exit(1)
  }
  if (regressions.length > 0) {
    if (!jsonMode) {
      console.error(`\n[check-import-budgets] ${regressions.length} minimal-import REGRESSION(s):`)
      for (const r of regressions)
        console.error(`  ✗ ${r.id}: ${r.gzip} > budget ${r.budget} (over by ${r.overBy} B)`)
      console.error(
        'A minimal import got bigger — an optional feature likely stopped tree-shaking. ' +
          'Investigate before bumping the budget with --update.',
      )
    }
    process.exit(1)
  }
  if (!jsonMode) console.log(`\n[check-import-budgets] all ${measured.length} scenario(s) within budget.`)
}

if (import.meta.main) await main()
