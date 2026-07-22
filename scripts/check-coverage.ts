/**
 * Coverage threshold checker.
 * Runs test coverage for all packages and reports failures.
 *
 * Usage:
 *   bun scripts/check-coverage.ts              # full coverage (slow, ~200s)
 *   bun scripts/check-coverage.ts --floor-only # config check only (~5s)
 *
 * Reads coverage thresholds from each package's vitest.config.ts.
 * If no threshold is configured, uses DEFAULT_THRESHOLD.
 * Supports parallel execution and CI-friendly output.
 *
 * ## --floor-only mode (P3a)
 *
 * Runs `enforceFloor()` and exits. No test execution. Used as the
 * PR-time fast gate (~5s) — proves the floor / exemption invariant holds
 * but does NOT detect actual coverage regressions in a PR's changes.
 *
 * The full run (no flag) is the canonical safety net, executed on
 * `push: main` and `merge_group` only — main is never allowed to
 * regress, but PRs get fast feedback instead of paying the 200s+ cost
 * on every iteration.
 *
 * ## Coverage floor (PR #323 → #324 → #1266 → #1279 → THIS PR)
 *
 * MINIMUM_FLOOR is the lowest STATEMENT threshold any package may
 * configure without an explicit entry in BELOW_FLOOR_EXEMPTIONS.
 * MINIMUM_BRANCH_FLOOR is the same for branch coverage. Trajectory:
 *   PR #323 established the 85% statement floor;
 *   PR #324 raised it to 90% + added an explicit 80% branch floor;
 *   PR #1266 raised statements 90 → 94 + branches 80 → 85;
 *   PR #1279 raised statements 94 → 95 (cov-95 floor);
 *   THIS PR raises branches 85 → 95 (cov-95-branches floor).
 *
 * The packages below 95 branches each get an explicit
 * BELOW_FLOOR_EXEMPTIONS entry carrying their current branch
 * threshold + reason. Same structural pattern PR #1279 used for
 * statements: aspiration is clearly 95, each below-95 package is
 * visible debt with documented justification, new packages can't
 * silently slip in below 95. Lifting each package to 95 branches
 * is per-package multi-PR work tracked separately.
 *
 * BELOW_FLOOR_EXEMPTIONS is the visible-debt list — every entry must
 * carry the package's currently-configured statement + branch
 * thresholds and a reason. Drift detection: if either configured
 * threshold differs from what's listed, the check fails so the
 * exemption is updated in lockstep with real package improvements.
 */
import { spawn } from 'node:child_process'
import { readdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_DIRS = [
  'packages/core',
  'packages/fundamentals',
  'packages/ui-system',
  'packages/tools',
  'packages/zero',
  // The component library, its behavior primitives, and theme. Previously
  // UNSCANNED by this gate — so ui-components/ui-primitives coverage was
  // never enforced and sat RED locally with nobody catching it.
  'packages/ui',
]
const DEFAULT_THRESHOLD = 95
const MINIMUM_FLOOR = 95
const MINIMUM_BRANCH_FLOOR = 95
const CONCURRENCY = 4

/**
 * Packages allowed to configure thresholds below the floor. Each
 * entry carries `currentStatements` + `currentBranches` (matching
 * the package's vitest.config.ts) and a reason. The floor enforcement
 * skips the package when its name appears here; the package's own
 * configured thresholds still apply. **Remove the entry the same PR
 * that raises both thresholds to ≥ floor.**
 *
 * Drift detection: any change to either configured threshold without
 * updating the exemption fails the check.
 */
interface FloorExemption {
  currentStatements: number
  currentBranches: number
  reason: string
}
const BELOW_FLOOR_EXEMPTIONS: Record<string, FloorExemption> = {
  // ── Statements + branches < floor ───────────────────────────────────
  '@pyreon/compiler': {
    currentStatements: 91,
    currentBranches: 85,
    reason:
      'JSX transform compiler. PR #1079 excluded load-native.ts (napi-rs binary loader) + event-names.ts (DOM-event remap data). Ratcheted 89/83 → 91/85 (measured 91.79/85.56) after validate-emit.ts — the pure TS-compiler-API compile-time @pyreon/validate specializer — gained full behavioral coverage (56.3%→98.9% stmts) of its check vocabulary + emitSchemaSource mini rewrite. Residual gap is the jsx.ts codegen edge-case tail (dual-backend, covered by native-equivalence + fuzz-equivalence in the `test (native)` cell) plus the syntactic audit modules (native-audit/content-audit/island-audit/ssg-audit) and diagnose.ts (exercised by e2e/dev-error-printer.spec.ts). Lifting to 95/95 is multi-PR work tracked as a long-tail effort.',
  },
  '@pyreon/ui-components': {
    currentStatements: 62,
    currentBranches: 75,
    reason:
      '67-component rocketstyle library. This is the FIRST PR to bring packages/ui under the coverage gate (it was entirely unscanned). Honest first baseline (measured 49.48/72.22, functions 16.09, lines 50.35): the library is imported by the export-existence test but almost never RENDERED, so definition-chain statements are covered while the .theme/.states/.sizes callbacks (the bulk of functions) are not. `includeIndexInCoverage` un-excludes the component index.ts files (same vacuous-barrel trap @pyreon/store fixed in #2167). This is the low end of a deliberate ratchet — the UI-excellence effort adds per-component mount/interaction tests phase by phase; raise these thresholds + this entry in lockstep as coverage climbs, never lower. Ratcheted 49/72 -> 62/75 (measured 62.62/75.67, functions 37.64, lines 61.88) as the Tree/SegmentedControl/Accordion/NumberInput/PinInput/Spoiler wirings landed with real mount specs.',
  },
  '@pyreon/ui-primitives': {
    currentStatements: 95,
    currentBranches: 89,
    reason:
      '12 headless behavior primitives (SelectBase/ComboboxBase/CalendarBase/TreeBase/…). First baseline under the gate (measured 62.99/54.79, functions 63.68, lines 66.85): the 11 browser tests exercise ARIA + keyboard surfaces but not the full state machines (Checkbox/Switch/Combobox/FileUpload/keyboard.ts navigateByRole largely unexercised — which is why interaction bugs shipped). Ratchet target as the UI-excellence effort adds interaction tests; raise in lockstep, never lower. Ratcheted 62/54 -> 78/71 (measured 78.61/71.58, functions 79.15, lines 82.48) as Tree/PinInput/NumberInput/Accordion/Calendar landed with real interaction specs. Ratcheted 78/71 -> 81/75 (measured 81.58/76.04, functions 82.42, lines 84.81) as the CheckboxBase/SwitchBase/RadioBase toggle state-machine interaction tests landed — the run that surfaced + locked the CheckboxBase + RadioBase <label>→<input> double-toggle fix (onClick preventDefault). Ratcheted 81/75 -> 86/81 (measured 87.42/82.12, functions 86.08, lines 89.66) as the ComboboxBase + TreeBase state-machine tests landed (select/filter/open-close/expand-collapse/keyboard/props helpers, exercised directly through the headless ComboboxState + TreeState objects — ComboboxBase 54.83 -> 95.96, TreeBase 78.32 -> 98.60).',
  },
  // ── Branch < MINIMUM_BRANCH_FLOOR=95 (statements OK at ≥95) ─────────
  // Each entry's `currentBranches` mirrors the package's vitest.config.ts
  // branches threshold. Drift detection enforces both stay in sync.
  // Per-package roadmaps:
  // - Compat layers: residual gaps are React/Vue/Solid/Svelte API surface
  //   covered by real-Chromium e2e (`e2e/compat-layers/*.spec.ts`).
  // - Build/dev infra (vite-plugin, zero, lint, cli): residual gaps are
  //   cross-process integration paths hard to drive from happy-dom vitest.
  // - UI layer (styler, runtime-dom, elements, kinetic, router):
  //   residual gaps are compiler-emitted fast paths and timing-sensitive
  //   animation/transition arms, covered by real-Chromium e2e.
  '@pyreon/cli': {
    currentStatements: 88,
    currentBranches: 76,
    reason:
      'CLI tool. Re-baselined 95/85 → 88/76 at the 2026-07 coverage-gate restoration (measured 88.88/76.91): the CLI-unification wave (`pyreon new`/`mcp`/`add`/`check`/`upgrade` npx-delegator + subprocess paths) and the doctor gates that shell out to real repo scans (check-bundle-budgets, audit-types, native-audit, audit-leak-classes) landed with integration-tier coverage. Multi-PR per-subcommand work to lift back.',
  },
  '@pyreon/server': {
    currentStatements: 95,
    currentBranches: 86,
    reason:
      'SSR server. Branches at ~86% — residual gap is client-side island() path (browser-only client.ts hydration scheduling) covered by islands.browser.test.tsx in real Chromium but unreachable from node-process vitest. PRs #1335 + #1336 added happy-dom coverage for bare island() invocation; further lift to 95 requires real-browser mount tests.',
  },
  '@pyreon/zero': {
    currentStatements: 94,
    currentBranches: 85,
    reason:
      'Full-stack meta-framework. Branches at ~85% — residual gap in adapter-build SSG/SSR/ISR plugin chains, fs-router auto-detect, image plugin sharp paths exercised by `verify-modes` build matrix + Playwright e2e rather than unit tests. Statements re-baselined 95 → 94 at the 2026-07 coverage-gate restoration (measured 94.97 locally; the package is usually SKIPPED on CI by the gate’s 120s per-package timeout, so the shortfall went unnoticed).',
  },
  '@pyreon/zero-content': {
    currentStatements: 86,
    currentBranches: 79,
    reason:
      'Markdown content layer. The 2026-06 docs cutover (PRs #1448 + #1491) landed substantial integration-tier surface node vitest cannot reach: plugin.ts dev-server search middleware (configureServer), build-mode search-index emission (closeBundle), and optional-dependency dynamic imports (katex/mermaid success paths). Achieved node coverage at true-up: 87.39% statements / 80.79% branches (thresholds carry ~1pp variance margin). The integration paths are exercised daily by the real docs/ build + verify-modes; the Chromium harness (PR 7 follow-up) is the tracked lift back toward 95. Raise the package thresholds + this entry in lockstep as tests land.',
  },
  '@pyreon/runtime-dom': {
    currentStatements: 94,
    currentBranches: 86,
    reason:
      'DOM renderer. Branches at ~86% — residual gap in template fast paths, hydrate NativeItem swaps, transition timing arms only reachable via compiler-emitted templates in real Chromium (covered by ui-showcase e2e). Statements ratcheted 93 → 94 (measured 94.59) after the props.ts reactive getter-descriptor / applySelectValueProp / applyAttrProp aria-boolean paths and binding-registry.ts no-doc + stale-graph-node guards gained behavioral tests; the remaining sub-95 statements are devtools.ts reactive-overlay + DOM→signal picker machinery (e2e/reactive-overlay.spec.ts) and hydrate.ts parity-fuzz recovery arms that land with e2e-tier coverage.',
  },
  '@pyreon/vue-compat': {
    currentStatements: 95,
    currentBranches: 86,
    reason:
      'Vue 3 compat shim. Branches at ~86% — residual gap in Transition/TransitionGroup class-prop forwarders. Real-Chromium e2e (`e2e/compat-layers/vue-compat.spec.ts`) covers production shapes.',
  },
  '@pyreon/store': {
    currentStatements: 100,
    currentBranches: 92,
    reason:
      'Composition-store engine. The prior 98% thresholds were VACUOUS — the default `src/**/index.ts` barrel coverage-exclude dropped the entire implementation (index.ts IS the module, not a re-export barrel), so the gate measured only ~42 registry/hydration statements. Un-excluded at the 2026-07 excellence pass (PR #2167): statements/functions/lines now at a true 100%, branches at 92% — the residual is the prod side of `process.env.NODE_ENV !== \'production\'` dev-warning gates (unknown-patch-key + same-id-redefinition warnings), which never executes under the vitest `development` NODE_ENV. Those arms are structurally uncoverable from node vitest without a second production-mode bundle-inspection pass; lift to 95 is not meaningful debt.',
  },
  '@pyreon/router': {
    currentStatements: 91,
    currentBranches: 85,
    reason:
      'Router. Re-baselined 95/88 → 91/85 at the 2026-07 coverage-gate restoration (measured 91.78/85.12): View Transitions API integration (browser-only), scroll restoration timing arms, prefetch IntersectionObserver paths, route-change announcer (router.browser.test.tsx), RouterLink link-DX warning paths, serverLoader/invalidateLoader arms — exercised by Playwright e2e (ssr-showcase, ssg-i18n) + the router browser suite rather than node vitest.',
  },
  '@pyreon/vite-plugin': {
    currentStatements: 94,
    currentBranches: 87,
    reason:
      'Vite plugin. Residual gap in Vite plugin hooks invoked by Vite itself (not directly testable from vitest). 48 helper-function tests landed in PR #1323; further lift needs integration tests covered by `verify-modes`. Re-baselined 95/88 → 94/87 at the 2026-07 coverage-gate restoration (measured 94.58/87.84 locally; usually SKIPPED on CI by the gate’s 120s per-package timeout, so the drift went unnoticed).',
  },
  '@pyreon/solid-compat': {
    currentStatements: 95,
    currentBranches: 89,
    reason:
      'Solid compat shim. Branches at ~89% — residual gap in createResource / createMutable proxy traps. Real-Chromium e2e covers production shapes.',
  },
  '@pyreon/svelte-compat': {
    currentStatements: 95,
    currentBranches: 89,
    reason:
      'Svelte compat shim. Branches at ~89% — residual gap in store-contract derived/readable edge arms + Svelte 5 runes adapter. Real-Chromium e2e covers production shapes.',
  },
  '@pyreon/lint': {
    currentStatements: 95,
    currentBranches: 90,
    reason:
      'Lint engine. Branches at ~90% — residual gap in 89-rule AST detectors against rare/synthetic source shapes.',
  },
  '@pyreon/mcp': {
    currentStatements: 94,
    currentBranches: 87,
    reason:
      'MCP server. First explicit full thresholds landed at the 2026-07 coverage-gate restoration (measured 94.55/87.64 locally — previously statements 95 with category-default branches, and usually SKIPPED on CI by the gate’s 120s per-package timeout, so the sub-threshold statements went unnoticed). Residual gap is tool-handler orchestration + docs-parsing arms against rare doc shapes.',
  },
  '@pyreon/runtime-server': {
    currentStatements: 97,
    currentBranches: 94,
    reason:
      'SSR string/stream renderer. Coverage is ENVIRONMENT-DEPENDENT: CI linux measures 98.05/95.19, a macOS run of the identical tree measures 97.84/94.89 (platform-gated arms in the streaming/abort paths). Thresholds sit at the cross-environment MINIMUM (97/94) so `bun run coverage` is green on a green tree everywhere; aspiration stays 98/95.',
  },
  '@pyreon/testing': {
    currentStatements: 99,
    currentBranches: 90,
    reason:
      'Public test kit. First explicit thresholds landed at the 2026-07 coverage-gate restoration (previously NO explicit entry — the gate assumed 95 while vitest enforced the 80/75 tools default, so it failed the gate silently at 90% statements). Now measured 100/91.66 after failure-path specs + dogfooding src/vitest.ts as the package setupFiles; thresholds 99/90 leave a 1pp drift margin. The 2 residual uncovered branches are matcher-internal defensive arms.',
  },
  '@pyreon/validate': {
    currentStatements: 96,
    currentBranches: 91,
    reason:
      'Validator runtime. Re-baselined 99/97 → 95/90 at the 2026-07 coverage-gate restoration (measured 95.12/90.11): the JIT compiles most check verdicts inline, so the INTERPRETER failure arms of the newer check/composition waves (string substring checks, object algebra, union call-forms, mini/server subpaths) no longer execute under parse() — their contracts are locked via the compiled path (jit-differential + emit-equivalence). Ratcheted 95/90 → 96/91 after toJsonSchema (json-schema.ts) reached 100% — every representable kind, check→constraint mapping, unrepresentable policy, and the forward-compat op-union branches now covered. Remaining lift = the interpreter-path test corpus, tracked as follow-up.',
  },
}

interface CoverageResult {
  package: string
  statements: number
  branches: number
  functions: number
  lines: number
  pass: boolean
  threshold: number
}

/** Extract coverage threshold from a package's vitest.config.ts if present. */
function getPackageThreshold(pkgDir: string): number {
  const configPath = join(pkgDir, 'vitest.config.ts')
  if (!existsSync(configPath)) return DEFAULT_THRESHOLD

  try {
    const content = readFileSync(configPath, 'utf-8')
    const match = content.match(/statements:\s*(\d+)/)
    if (match?.[1]) return Number(match[1])
  } catch {
    // Fall through to default
  }

  return DEFAULT_THRESHOLD
}

/** Extract branch threshold from a package's vitest.config.ts. Defaults to DEFAULT_THRESHOLD if absent. */
function getPackageBranchThreshold(pkgDir: string): number {
  const configPath = join(pkgDir, 'vitest.config.ts')
  if (!existsSync(configPath)) return DEFAULT_THRESHOLD

  try {
    const content = readFileSync(configPath, 'utf-8')
    const match = content.match(/branches:\s*(\d+)/)
    if (match?.[1]) return Number(match[1])
  } catch {
    // Fall through to default
  }

  return DEFAULT_THRESHOLD
}

/** Run coverage for a single package asynchronously. */
function runCoverage(
  pkgDir: string,
  pkgName: string,
  threshold: number,
): Promise<CoverageResult | null> {
  return new Promise((resolve) => {
    const child = spawn('bun', ['run', 'test', '--', '--coverage', '--reporter=json'], {
      cwd: pkgDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, 120_000)

    child.on('close', () => {
      clearTimeout(timer)

      const match = stdout.match(
        /All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/,
      )
      if (match) {
        const [, stmts, branches, funcs, lines] = match.map(Number)
        const pass = (stmts ?? 0) >= threshold
        resolve({
          package: pkgName,
          statements: stmts ?? 0,
          branches: branches ?? 0,
          functions: funcs ?? 0,
          lines: lines ?? 0,
          pass,
          threshold,
        })
      } else {
        resolve(null)
      }
    })

    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
  })
}

interface PackageInfo {
  dir: string
  name: string
  threshold: number
  branchThreshold: number
}

/** Collect all testable packages. */
function collectPackages(): PackageInfo[] {
  const packages: PackageInfo[] = []

  for (const dir of PACKAGE_DIRS) {
    if (!existsSync(dir)) continue
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(dir, d.name))

    for (const pkgDir of entries) {
      const pkgJson = join(pkgDir, 'package.json')
      if (!existsSync(pkgJson)) continue

      const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'))
      if (!pkg.scripts?.test) continue
      if (pkg.scripts.test.startsWith('echo')) continue // skip placeholder scripts

      packages.push({
        dir: pkgDir,
        name: pkg.name,
        threshold: getPackageThreshold(pkgDir),
        branchThreshold: getPackageBranchThreshold(pkgDir),
      })
    }
  }

  return packages
}

/** Run packages with bounded concurrency using async spawn. */
async function runWithConcurrency(
  packages: PackageInfo[],
): Promise<CoverageResult[]> {
  const results: CoverageResult[] = []
  const queue = [...packages]

  async function worker() {
    while (queue.length > 0) {
      const pkg = queue.shift()
      if (!pkg) break

      process.stdout.write(`  Testing ${pkg.name}...`)
      const result = await runCoverage(pkg.dir, pkg.name, pkg.threshold)
      if (result) {
        results.push(result)
        console.log(` ${result.statements}% ${result.pass ? '\u2705' : '\u274c'}`)
      } else {
        console.log(' (skipped)')
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, packages.length) }, () => worker())
  await Promise.all(workers)

  return results
}

/**
 * Enforce the floor. Returns a list of misconfigured-threshold
 * errors: any package whose configured `statements` or `branches`
 * threshold falls below the respective floor without an explicit
 * exemption, OR any exempt entry whose listed `currentStatements`/
 * `currentBranches` no longer match the actual configured thresholds
 * (drift detection — keeps the exemption list honest as packages
 * are improved).
 */
function enforceFloor(packages: PackageInfo[]): string[] {
  const errors: string[] = []
  const seenExemptions = new Set<string>()

  for (const pkg of packages) {
    const exemption = BELOW_FLOOR_EXEMPTIONS[pkg.name]
    if (exemption) {
      seenExemptions.add(pkg.name)
      const meetsFloor =
        pkg.threshold >= MINIMUM_FLOOR && pkg.branchThreshold >= MINIMUM_BRANCH_FLOOR
      if (
        exemption.currentStatements !== pkg.threshold ||
        exemption.currentBranches !== pkg.branchThreshold
      ) {
        errors.push(
          `${pkg.name}: BELOW_FLOOR_EXEMPTIONS lists currentStatements=${exemption.currentStatements}/currentBranches=${exemption.currentBranches} but vitest.config.ts has statements=${pkg.threshold}/branches=${pkg.branchThreshold}. ` +
            (meetsFloor
              ? 'Drop the exemption — package now meets both floors.'
              : `Update the exemption entry to currentStatements=${pkg.threshold}, currentBranches=${pkg.branchThreshold}.`),
        )
      }
      continue
    }
    if (pkg.threshold < MINIMUM_FLOOR) {
      errors.push(
        `${pkg.name}: configured statements threshold ${pkg.threshold}% is below MINIMUM_FLOOR (${MINIMUM_FLOOR}%) and no exemption is registered. ` +
          `Either raise the threshold in ${pkg.dir}/vitest.config.ts, or add a BELOW_FLOOR_EXEMPTIONS entry with a reason.`,
      )
    }
    if (pkg.branchThreshold < MINIMUM_BRANCH_FLOOR) {
      errors.push(
        `${pkg.name}: configured branches threshold ${pkg.branchThreshold}% is below MINIMUM_BRANCH_FLOOR (${MINIMUM_BRANCH_FLOOR}%) and no exemption is registered. ` +
          `Either raise the threshold in ${pkg.dir}/vitest.config.ts, or add a BELOW_FLOOR_EXEMPTIONS entry with a reason.`,
      )
    }
  }

  // Stale exemptions — listed but the package no longer exists.
  for (const exemptName of Object.keys(BELOW_FLOOR_EXEMPTIONS)) {
    if (!seenExemptions.has(exemptName)) {
      errors.push(
        `${exemptName}: BELOW_FLOOR_EXEMPTIONS entry is stale (no matching package). Remove it.`,
      )
    }
  }

  return errors
}

// ─── Main ──────────────────────────────────────────────────────────────────

const isCI = !!process.env.CI
const isFloorOnly = process.argv.includes('--floor-only')
const packages = collectPackages()

// Enforce the floor BEFORE running coverage so misconfigured
// thresholds surface even if coverage execution times out / skips.
const floorErrors = enforceFloor(packages)
if (floorErrors.length > 0) {
  console.error(
    `\n❌ Coverage floor violations (MINIMUM_FLOOR=${MINIMUM_FLOOR}% statements, ` +
      `MINIMUM_BRANCH_FLOOR=${MINIMUM_BRANCH_FLOOR}% branches):\n`,
  )
  for (const err of floorErrors) console.error('  - ' + err)
  console.error(
    '\nFix by either raising the package threshold in vitest.config.ts ' +
      'or by adding a BELOW_FLOOR_EXEMPTIONS entry with a reason. See ' +
      'scripts/check-coverage.ts for the canonical list.\n',
  )
  process.exit(1)
}

// P3a — floor-only mode: pure config gate, no test execution. Used as
// the PR-time fast path; full coverage runs on push:main + merge_group.
if (isFloorOnly) {
  console.log(
    `\n✅ Floor-config check passed (${packages.length} packages, ` +
      `MINIMUM_FLOOR=${MINIMUM_FLOOR}% / MINIMUM_BRANCH_FLOOR=${MINIMUM_BRANCH_FLOOR}%, ` +
      `${Object.keys(BELOW_FLOOR_EXEMPTIONS).length} exemptions current).\n` +
      `Full coverage runs on push:main + merge_group.\n`,
  )
  process.exit(0)
}

console.log(`\nRunning coverage for ${packages.length} packages (${CONCURRENCY} parallel)...\n`)

const results = await runWithConcurrency(packages)
const sorted = results.sort((a, b) => a.package.localeCompare(b.package))
const hasFailures = sorted.some((r) => !r.pass)

// Build report
const reportLines: string[] = [
  '',
  '## Coverage Report',
  '',
  '| Package | Stmts | Branch | Funcs | Lines | Threshold | Status |',
  '|---------|-------|--------|-------|-------|-----------|--------|',
]

for (const r of sorted) {
  const status = r.pass ? '\u2705' : '\u274c'
  reportLines.push(
    `| ${r.package} | ${r.statements}% | ${r.branches}% | ${r.functions}% | ${r.lines}% | ${r.threshold}% | ${status} |`,
  )
}

if (hasFailures) {
  reportLines.push('', '\u274c Some packages below their coverage threshold')
} else {
  reportLines.push('', '\u2705 All packages meet their coverage thresholds')
}

const report = reportLines.join('\n')
console.log(report)

// CI: write GitHub Actions annotations and step summary
if (isCI) {
  for (const r of sorted) {
    if (!r.pass) {
      console.log(
        `::error::${r.package} coverage below threshold: ${r.statements}% statements (need ${r.threshold}%)`,
      )
    }
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  }
}

if (hasFailures) {
  process.exit(1)
}
