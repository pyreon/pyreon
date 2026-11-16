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
 * Verdict: on a pull request each scenario is judged on the bytes THIS change
 * adds (against the commit it merges into); on the default branch against its
 * ceiling in `scripts/size-budgets/packages/<package>.json`. The rules are in
 * `size-budget-policy.ts`, shared with `check-bundle-budgets`.
 *
 * Run:
 *   bun run check-import-budgets                       # local: build failures, ceilings reported
 *   bun run check-import-budgets --mode=main           # fail on any scenario over its ceiling
 *   bun run check-import-budgets --mode=pr --base=<f>  # fail on this change's own growth
 *   bun run check-import-budgets --json                # machine-readable
 *   bun run check-import-budgets --update=<id>         # accept that scenario's size: set its ceiling
 *   bun run check-import-budgets --update              # seed new scenarios, raise the ones over
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { staticClosureCode } from './bundle-static-closure'
import { parseSync, Visitor } from 'oxc-parser'

import { isUpdateMode } from './bundle-budget-policy'
import {
  formatVerdicts,
  judgeFamily,
  nextCeiling,
  NOISE_BYTES,
  resolveBasePath,
  resolveSizeMode,
  type SizeBaseFile,
} from './size-budget-policy'
import { loadCeilings, resolveBudgetsDir, writeCeiling } from './size-budget-store'

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
    outputs: Array<{ kind: string; path: string; text(): Promise<string> }>
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
  /**
   * Lib entry file relative to the package's lib/ (default "index.js").
   * Subpath scenarios (e.g. charts' "engine.js") lock a subpath export's
   * tree-shaking without routing through the main barrel.
   */
  entry?: string
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
    // Locks the styler lazy-singleton win: the top-level `new StyleSheet()`
    // + flush registration + onSheetClear call pinned the whole sheet engine
    // into EVERY consumer bundle — `useTheme`-only imports paid 6.09KB gz.
    // After moving registration into the constructor (PURE singleton) and
    // the clear-hook to first styled() call: useTheme 1.12KB, css 1.49KB.
    id: '@pyreon/styler::useTheme',
    pkg: '@pyreon/styler',
    dir: 'ui-system/styler',
    imports: ['useTheme'],
  },
  {
    id: '@pyreon/styler::css',
    pkg: '@pyreon/styler',
    dir: 'ui-system/styler',
    imports: ['css'],
  },
  {
    // Locks the defineStore / defineSchemaStore split: a setup-only store must
    // not carry schema mode or the `@pyreon/validation` bridge. Re-merging
    // schema dispatch into `defineStore` puts both back.
    id: '@pyreon/store::defineStore',
    pkg: '@pyreon/store',
    dir: 'fundamentals/store',
    imports: ['defineStore'],
  },
  {
    // Locks the import-chosen drag preview: a plain draggable must not carry
    // pdnd's preview utilities (`setCustomNativeDragPreview` + offset presets),
    // which `dragPreview()` brings in only when used.
    id: '@pyreon/dnd::useDraggable',
    pkg: '@pyreon/dnd',
    dir: 'fundamentals/dnd',
    imports: ['useDraggable'],
  },
  {
    // Locks the `mini` entry WITHOUT the runtime JIT (~3.5 KB gz): the JIT is
    // installed by the main entry or `enableJit()` from `@pyreon/validate/jit`,
    // never reached from `mini`. A static `./jit` import in `core/schema.ts`
    // puts it back into every `mini` bundle.
    id: '@pyreon/validate::mini',
    pkg: '@pyreon/validate',
    dir: 'fundamentals/validate',
    entry: 'mini.js',
    imports: ['object', 'string', 'number', 'boolean', 'email', 'minLength', 'minValue', 'integer'],
  },
  {
    id: '@pyreon/core::jsx',
    pkg: '@pyreon/core',
    dir: 'core/core',
    imports: ['h', 'Fragment', 'createContext', 'useContext'],
  },
  {
    // @pyreon/hooks is a 36-hook grab-bag, and essentially every consumer
    // imports one to three of them — so the KITCHEN-SINK budget (which the
    // main-entry gate locks) is not the number that reaches a real app. The
    // meaningful property is that one hook costs one hook. Locked here
    // because nothing measured it before: `sideEffects: false` made
    // tree-shaking an ASSUMPTION, and the web halves of the lowered native
    // hooks (useAuth/usePush/usePayments) are exactly the shape that breaks
    // it — a top-level registry write or a shared eager singleton would pin
    // all three into every `useEventListener` import without moving the
    // main-entry budget at all.
    id: '@pyreon/hooks::useEventListener',
    pkg: '@pyreon/hooks',
    dir: 'fundamentals/hooks',
    imports: ['useEventListener'],
  },
  {
    // The native-lowered hook's own web half, isolated: locks that it does
    // not drag its two siblings (or the rest of the barrel) in with it.
    id: '@pyreon/hooks::useAuth',
    pkg: '@pyreon/hooks',
    dir: 'fundamentals/hooks',
    imports: ['useAuth'],
  },
  {
    // reportWebVitals must stay a small standalone subpath: the observer
    // logic only, nothing from zero's main entry or server modules.
    id: '@pyreon/zero::web-vitals',
    pkg: '@pyreon/zero',
    dir: 'zero/zero',
    entry: 'web-vitals.js',
    imports: ['reportWebVitals'],
  },
  {
    id: '@pyreon/charts::plot-minimal',
    pkg: '@pyreon/charts',
    dir: 'fundamentals/charts',
    entry: 'engine.js',
    // A bar+line chart must not pull the radial/finance/matrix families
    // or the SVG serializer — marks are imported bindings by design.
    imports: ['PlotChart', 'bars', 'line'],
  },
  {
    id: '@pyreon/charts::plot-svg',
    pkg: '@pyreon/charts',
    dir: 'fundamentals/charts',
    entry: 'svg.js',
    // The server-side serializer must not drag components or the canvas
    // host (ResizeObserver/rAF) into a node bundle.
    imports: ['chartToSvg'],
  },
  {
    id: '@pyreon/flow::core',
    pkg: '@pyreon/flow',
    dir: 'fundamentals/flow',
    // A flow that never calls `layout()` must not pull the 932-line
    // layout engine: `layout.ts` code-splits it behind a dynamic import, and
    // this is the lock that the split stays a split.
    imports: ['createFlow', 'Flow', 'Background', 'Controls', 'MiniMap'],
  },
  {
    id: '@pyreon/charts::chart-pie',
    pkg: '@pyreon/charts',
    dir: 'fundamentals/charts',
    // A pie through the main entry, <Chart> + <Arc>: must not pull the
    // funnel, heatmap or candlestick hosts, nor the zoom and toolbox code.
    imports: ['Chart', 'Arc'],
  },
  {
    id: '@pyreon/charts::chart-line',
    pkg: '@pyreon/charts',
    dir: 'fundamentals/charts',
    // The recommended first chart from the main entry: <Chart> + <Line>.
    // Must not pull the family hosts (pie/funnel/heatmap/candlestick) — each
    // family mark carries its own host, so an unused mark leaves its
    // renderer unreferenced — nor the ECharts wrapper.
    imports: ['Chart', 'Line'],
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
 * its gzip exceeds its budget by more than `VERSION_NOISE_BYTES`. Missing
 * budgets are reported as regressions too (a new scenario must be locked via
 * `--update`). Pure — unit-tested.
 */
/**
 * Bytes of slack, because a release changes gzip output without changing code.
 *
 * Every package embeds its OWN version — `registerSingleton(name, version, …)`
 * reads it from `package.json` and the build inlines the literal (that
 * derivation exists so the two can never drift). `"0.51.0"` and `"0.52.0"` are
 * the same LENGTH, but they are different bytes, and gzip compresses them
 * differently: measured on `@pyreon/hooks`, a plain version bump moved
 * `useEventListener` 596 → 597 and `useAuth` 709 → 710.
 *
 * Budgets are locked at the exact measured value, so zero headroom means every
 * release PR reds this gate for a change that touched no code — and the only
 * available fix is to bump the number, which teaches people to bump it.
 *
 * 4 bytes is chosen to be larger than that fluctuation and far smaller than
 * anything this gate exists to catch: a feature that stops tree-shaking moves a
 * minimal import by hundreds of bytes, not by one. Sustained real growth still
 * fails, because the budget is re-locked at the new measured value on `--update`
 * and the slack does not accumulate.
 */
export const VERSION_NOISE_BYTES = NOISE_BYTES

/**
 * The table label for one scenario, sharing the VERDICT's threshold.
 *
 * These drifted: the verdict tolerates `budget + VERSION_NOISE_BYTES` (gzip
 * differs by a few bytes across zlib versions) while the label used a bare
 * `>`, so the table printed `OVER` for a scenario the gate had deliberately
 * passed — `plot-svg gz=12624 budget=12620`, four bytes inside the tolerance,
 * one line above `all 15 scenario(s) within budget`. Anyone triaging a red
 * Build reads the OVER and chases the wrong entry. `near` names the in-noise
 * case instead of hiding it.
 */
export function budgetTag(gzip: number, budget: number | undefined): 'NEW' | 'OVER' | 'near' | 'ok' {
  if (budget === undefined) return 'NEW'
  if (gzip > budget + VERSION_NOISE_BYTES) return 'OVER'
  return gzip > budget ? 'near' : 'ok'
}

export function compareToBudgets(
  measured: MeasuredImport[],
  budgets: Record<string, number>,
): { regressions: BudgetRegression[]; missing: string[] } {
  // The default-branch verdict of the shared policy: over the ceiling by more
  // than the noise band, or no ceiling at all.
  const verdicts = judgeFamily(
    'main',
    measured.filter((m) => !m.failed).map((m) => ({ id: m.id, size: m.gzip, ceiling: budgets[m.id] })),
    undefined,
  )
  const regressions: BudgetRegression[] = []
  const missing: string[] = []
  for (const v of verdicts) {
    if (!v.fail) continue
    if (v.ceiling === undefined) missing.push(v.id)
    else regressions.push({ id: v.id, gzip: v.size, budget: v.ceiling, overBy: v.size - v.ceiling })
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
  const lib = join(pkgDir, 'lib', s.entry ?? 'index.js')
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
    // Entry plus its STATIC chunk closure — see bundle-static-closure.ts for
    // why the entry-point file alone undercounts.
    const code = await staticClosureCode(result.outputs)
    if (code === null) {
      return { id: s.id, pkg: s.pkg, raw: 0, gzip: 0, failed: true, error: 'no entry-point output' }
    }
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

/**
 * Decide the next budget table for `--update`. Pure, so the direction rule is
 * testable without a build tree — the wiring is the half a unit test on the
 * policy helper alone cannot see.
 *
 * A budget is derived from a BUILD, and a stale or partial build measures
 * SMALLER than the real thing, so an unscoped drop is far more likely to be a
 * bad measurement than a real shrink. Measured on the tree where this was
 * written: one unscoped run lowered 8 of 11 budgets — `router::basic` by 9.9% —
 * while raising 3, so a person relocking for the 3 legitimate raises silently
 * committed 8 unreviewed tightenings. That is the mechanism that ratcheted
 * `@pyreon/validate` below what CI measures and reddened a gate on two branches
 * that had not touched the package.
 *
 * A scenario over its ceiling is raised (that is the reviewed case); one under
 * it is left byte-identical. Lowering, and accepting growth that is still under
 * the ceiling, requires naming the scenario. The value is `ceilingFor` of the
 * measurement — see `nextCeiling` in `size-budget-policy.ts`.
 */
export function relockBudgets(
  measured: readonly MeasuredImport[],
  previous: Readonly<Record<string, number>>,
  scope: string | undefined,
): { budgets: Record<string, number>; refused: string[]; lowered: number } {
  const budgets: Record<string, number> = {}
  const refused: string[] = []
  let lowered = 0

  for (const m of measured) {
    const prev = previous[m.id]
    const { value, action } = nextCeiling(prev, m.gzip, scope === m.id)
    // A named update touches the named scenario only.
    if (scope !== undefined && scope !== m.id && prev !== undefined) {
      budgets[m.id] = prev
      continue
    }
    if (action === 'refused') {
      budgets[m.id] = value
      refused.push(
        `  ⚠ not lowered: ${m.id} stays ${value} (measured ${m.gzip}) — ` +
          `an unscoped --update never lowers, because a stale build can only measure LOW. ` +
          `If this shrink is real, scope it: --update=${m.id}`,
      )
      continue
    }
    budgets[m.id] = value
    if (action === 'lower') lowered += 1
  }

  return { budgets, refused, lowered }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  // `includes('--update')` is an exact match, so it never saw a scoped form —
  // the same latent bug the sibling gate had. `isUpdateMode` handles both.
  const updateMode = isUpdateMode(args)
  const scopeFlag = args.find((a) => a.startsWith('--update='))
  const scope = scopeFlag ? scopeFlag.slice('--update='.length) : undefined

  const measured: MeasuredImport[] = []
  for (const s of SCENARIOS) measured.push(await measureScenario(s))

  const failures = measured.filter((m) => m.failed)
  const budgetsDir = resolveBudgetsDir(args, repoRoot())

  // Sizes for another program (size-base.ts): no ceilings read, no verdict.
  if (args.includes('--measure-only')) {
    if (jsonMode) console.log(JSON.stringify({ measured, failures }, null, 2))
    return
  }

  if (updateMode) {
    if (failures.length > 0) {
      console.error('[check-import-budgets] Refusing to --update: some scenarios failed to build:')
      for (const f of failures) console.error(`  ✗ ${f.id}: ${f.error?.split('\n')[0]}`)
      process.exit(1)
    }
    if (scope !== undefined && !measured.some((m) => m.id === scope)) {
      console.error(`[check-import-budgets] --update=${scope}: no such scenario. Ids look like @pyreon/core::jsx.`)
      process.exit(1)
    }
    const previous = loadCeilings(budgetsDir).imports
    const { budgets, refused, lowered } = relockBudgets(measured, previous, scope)
    let changed = 0
    for (const [id, value] of Object.entries(budgets)) {
      if (previous[id] === value) continue
      const file = writeCeiling(budgetsDir, 'imports', id, value)
      console.log(`  ${previous[id] ?? 'none'} → ${value}  ${id}  (${file})`)
      changed += 1
    }
    console.log(`[check-import-budgets] ${changed} ceiling(s) changed, ${lowered} lowered.`)
    for (const line of refused) console.warn(line)
    return
  }

  const mode = resolveSizeMode(args, process.env)
  const budgets = loadCeilings(budgetsDir).imports
  const basePath = resolveBasePath(args, process.env)
  let base: SizeBaseFile | undefined
  if (mode === 'pr') {
    if (basePath === undefined) {
      console.error(
        '[check-import-budgets] pr mode needs the base measurement. Run `bun scripts/size-base.ts --out=<file>` and pass --base=<file> (or PYREON_SIZE_BASE).',
      )
      process.exit(1)
    }
    try {
      base = JSON.parse(readFileSync(basePath, 'utf8')) as SizeBaseFile
    } catch (err) {
      console.error(
        `[check-import-budgets] cannot read the base measurement at ${basePath} (${err instanceof Error ? err.message : String(err)}). The "Prepare size base" step writes it; fix that step first.`,
      )
      process.exit(1)
    }
  }

  const ok = measured.filter((m) => !m.failed)
  const verdicts = judgeFamily(
    mode,
    ok.map((m) => ({ id: m.id, size: m.gzip, ceiling: budgets[m.id] })),
    base?.imports,
  )
  const failing = verdicts.filter((v) => v.fail)
  const missing = failing.filter((v) => v.code === 'missing-ceiling').map((v) => v.id)
  const regressions = failing
    .filter((v) => v.code !== 'missing-ceiling')
    .map((v) => ({ id: v.id, gzip: v.size, budget: v.ceiling, baseGzip: v.baseSize, code: v.code, message: v.message }))

  if (jsonMode) {
    console.log(JSON.stringify({ mode, measured, regressions, missing, failures }, null, 2))
  } else {
    for (const m of ok) {
      const budget = budgets[m.id]
      const tag = budgetTag(m.gzip, budget)
      console.log(
        `  ${tag.padEnd(4)} ${m.id.padEnd(38)} gz=${String(m.gzip).padStart(5)}` +
          (budget !== undefined ? `  ceiling=${budget}` : ''),
      )
    }
    for (const f of failures) console.error(`  ✗ FAILED ${f.id}: ${f.error?.split('\n')[0]}`)
    const { lines } = formatVerdicts('minimal imports', mode, verdicts)
    console.log('')
    for (const line of lines) (line.startsWith('✓') || line.startsWith('  ·') ? console.log : console.error)(line)
  }

  // Surface failures + regressions; exit non-zero (the
  // CI-gates-must-surface-failures lesson — never silently pass).
  if (failures.length > 0) {
    if (!jsonMode)
      console.error(`\n[check-import-budgets] ${failures.length} scenario(s) failed to BUILD.`)
    process.exit(1)
  }
  if (failing.length > 0) {
    if (!jsonMode && regressions.length > 0) {
      console.error(
        'A minimal import got bigger — an optional feature likely stopped tree-shaking. ' +
          'Investigate before accepting the size with --update=<id>.',
      )
    }
    process.exit(1)
  }
}

if (import.meta.main) await main()
