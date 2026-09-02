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
import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

import { isModuleEntry } from './is-entry'

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
 * Packages whose suites spawn NESTED VITE BUILDS, run one at a time.
 *
 * The `PACKAGE_TIMEOUT_MS` comment below suspected 4-way concurrency as the
 * reason `@pyreon/zero` / `@pyreon/mcp` / `@pyreon/vite-plugin` were absent
 * from every CI coverage table, and said so was "not proven here". It is
 * proven now, and the mechanism is memory, not wall clock:
 *
 *   CI  ->  "@pyreon/zero: 20 test(s) FAILED", first named spec reported as
 *           `Error: STACK_TRACE_ERROR` with NO assertion text
 *   local, same commit, after a bootstrap
 *       ->  Tests 1787 passed | 2 skipped (1789), exit 0
 *
 * `STACK_TRACE_ERROR` with no assertion is an OOM'd worker, and vitest blames
 * whichever spec was in flight — which is why the reported name (`dev 404 —
 * mode: 'ssg'`) is a red herring, and why twenty "failures" arrive at once:
 * assertions do not fail in blocks of twenty, a worker dies once and takes its
 * whole file with it.
 *
 * These suites boot real Vite SSR builds — the heaviest thing in this repo —
 * and V8 coverage instrumentation sits on top of that. Four of them beside
 * three other packages is what exhausts the runner.
 *
 * Serial, not excluded: the point of this gate is that a package IS measured.
 * Dropping them would recreate the hole the timeout comment describes, where a
 * threshold silently stops being enforced.
 */
const SERIAL_PACKAGES = new Set(['@pyreon/zero', '@pyreon/mcp', '@pyreon/vite-plugin'])
/**
 * Per-package wall-clock ceiling.
 *
 * Three packages — `@pyreon/zero`, `@pyreon/mcp`, `@pyreon/vite-plugin` — are
 * absent from every CI coverage table, so their thresholds have never actually
 * been enforced (two BELOW_FLOOR_EXEMPTIONS entries say as much, attributing it
 * to this timeout when it was 120s). Measured serially on an M3 Max they take
 * 20s / 17s / 38s and all three PASS, which means the local run cannot
 * reproduce whatever CI hit — 4-way concurrency on a slower runner is the
 * likely cause but is not proven here.
 *
 * So this number is deliberately generous rather than tuned: the point is that
 * a package must be measured, and a run that blows even this budget is now
 * REPORTED with its cause instead of vanishing. Whichever mechanism it was, the
 * next CI run says so in the table rather than leaving it to be guessed at.
 */
const PACKAGE_TIMEOUT_MS = 600_000

/**
 * The vitest CLI entry, run under `node` (see the spawn comment in
 * `runCoverage` for why the runtime must be explicit). Resolved from the
 * workspace root — bun hoists it there — and verified up front so a missing
 * binary or a node-less environment fails ONCE with a message, not 72 times
 * with per-package noise.
 */
const VITEST_ENTRY = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs')

/**
 * Packages that legitimately have NO instrumentable source, so a coverage run
 * measuring zero files is the correct outcome rather than a misconfiguration.
 *
 * This list must stay tiny and each entry must argue why. It exists because
 * "measured nothing" is otherwise a hard failure — which is the right default
 * (it is how `@pyreon/config` was caught reporting 0% with full coverage), but
 * a pure re-export barrel genuinely has nothing to instrument and must not be
 * given `includeIndexInCoverage: true` to fake a number.
 *
 * An entry here is NOT "coverage does not apply to this package": the package
 * must still have tests, and they still run. It only says the coverage
 * PERCENTAGE is not a meaningful signal for it.
 */
const NO_INSTRUMENTABLE_SOURCE: Record<string, string> = {
  '@pyreon/meta': [
    'A pure re-export barrel: `src/index.ts` is 337 lines of `export { … } from`',
    'and there is no other source file. The one failure mode a barrel has —',
    'does it export every symbol it claims — is exactly what its 149-assertion',
    'export test checks, and that runs. Setting `includeIndexInCoverage` here',
    'would report 100% for "the module evaluated", which is a number that',
    'cannot go down and therefore protects nothing.',
  ].join(' '),
}

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
  '@pyreon/charts': {
    currentStatements: 94,
    currentBranches: 85,
    reason:
      'The plot-engine family wave (2026-09, ~30 stacked PRs: funnel through gantt, the ECharts option facade, the option host, the native crossings). Each PR lands one family with statement-level geometry specs; the edge and interaction specs that lift branch coverage arrive in LATER PRs of the same stack, so an intermediate branch measures 94-97% statements and 85-90% branches (theme river: 96.28 / 87.49 with the browser-covered canvas hosts excluded) while the top of the stack sits higher. Recorded at the wave floor rather than lowered per PR; the ratchet back toward 98 is one follow-up once the wave has merged, and the family hosts stay excluded because each is covered only by its real-Chromium spec.',
  },
  '@pyreon/lathe': {
    currentStatements: 90,
    currentBranches: 80,
    reason:
      'Spec-to-client codegen, arrived at 84.46% statements / 72.22% branches and ratcheted to 90.69 / 80.51 in the same PR. It reached main unmeasured: its PR changed a set large enough to trip the PR-time coverage step\'s >15-package cap, so the step SKIPPED and a brand-new package slipped past the mechanism whose stated job is preventing exactly that. (I first attributed this to the ROOT-FILE escalation, a real second hole with the same outcome — `--filter=*` makes that step exit — but `isRootFile` is false for the `scripts/*.ts` paths that PR touched, so it was the cap. The escalation hole is fixed in `affected.ts` regardless.) ' +
      'The shortfall is real, not an accounting artifact. `src/cli/report.ts` (40 -> 98), `src/emit/mock.ts` (77 -> 98), `src/emit/schema.ts` (71 -> 87) `src/core/naming.ts` (79 -> 97) and `src/input/openapi.ts` (79 -> 87) are done — the fixture generator\'s per-kind shapes and the portable-regex guard, both of which encode cross-target decisions rather than lines. Recorded at the MEASURED actual and ratcheted with it, never lowered to absorb a regression.',
  },
  // ── Statements + branches < floor ───────────────────────────────────
  '@pyreon/flow': {
    currentStatements: 98,
    currentBranches: 90,
    reason:
      'Node-graph canvas. Statements are ABOVE the 95 floor (98.49 measured); only branches sit under it, and the shortfall is ONE file: ' +
      '`layout-engine.ts` at 75.63% branches, the in-house engine that replaced elkjs in #2933 (the tree\'s last copyleft dependency). ' +
      'Its algorithmic fallbacks — cycle-breaking, ranking, ordering — carry many branches the current tests do not drive. Every other ' +
      'file in the package is at 99%+ branches, so this is one bounded, nameable gap rather than a thin package. Raising it means ' +
      'exercising the layout algorithm directly, which is real work and tracked separately.',
  },
  '@pyreon/compiler': {
    currentStatements: 91,
    currentBranches: 85,
    reason:
      'JSX transform compiler. PR #1079 excluded load-native.ts (napi-rs binary loader) + event-names.ts (DOM-event remap data). Ratcheted 89/83 → 91/85 (measured 91.79/85.56) after validate-emit.ts — the pure TS-compiler-API compile-time @pyreon/validate specializer — gained full behavioral coverage (56.3%→98.9% stmts) of its check vocabulary + emitSchemaSource mini rewrite. Residual gap is the jsx.ts codegen edge-case tail (dual-backend, covered by native-equivalence + fuzz-equivalence in the `test (native)` cell) plus the syntactic audit modules (native-audit/content-audit/island-audit/ssg-audit) and diagnose.ts (exercised by e2e/dev-error-printer.spec.ts). Lifting to 95/95 is multi-PR work tracked as a long-tail effort.',
  },
  '@pyreon/loom': {
    currentStatements: 95,
    currentBranches: 90,
    reason:
      'Dependency observatory. Statements, functions and lines all clear the floor comfortably (97.71 / 99.09 / 98.96) and are NOT exempted — only branches is, at 90.32. It had no threshold entry at all, so all four inherited the 95% default and the branch shortfall reddened `Coverage (Full)` on every main run while nothing in the package stated its branch contract. The 54 uncovered branches are spread thin across six files that are otherwise 96-99% (workspace 83.8, model 86.6, detect 88.3, config 88.3, graph 90, imports 96.1) and are defensive arms — `??` fallbacks and optional chaining on shapes the callers already guarantee. Ratchet up as tests land.',
  },
  '@pyreon/atlas': {
    currentStatements: 82,
    currentBranches: 75,
    reason:
      'AI-native component workbench. FIRST time this package has ever been enforced: it was absent from every CI coverage table because the runner silently dropped any package whose output it could not parse, so its declared 95/95/95 was decorative and the package sat ~15pp under it. Honest first baseline (measured 79.72/75.98, functions 66.06, lines 79.94). The uncovered surface is concentrated and named: `static.ts` (the `atlas build` static-docs generator, landed with no tests), `server.ts`/`plugin.ts`/`run.ts` (the vite-booting dev surface, proven by e2e/atlas-workshop.spec.ts rather than node vitest), `lens.ts`/`lens-client.ts`/`axe.ts` (browser-side instrumentation measured on the page\'s own devtools bridge), and the `A11y*` styled-declaration modules. This is the low end of a deliberate ratchet — raise these thresholds + this entry in lockstep as tests land, never lower.',
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
    currentStatements: 92,
    currentBranches: 83,
    reason:
      'DOM renderer. Branches at ~86% — residual gap in template fast paths, hydrate NativeItem swaps, transition timing arms only reachable via compiler-emitted templates in real Chromium (covered by ui-showcase e2e). Statements ratcheted 93 → 94 (measured 94.59) after the props.ts reactive getter-descriptor / applySelectValueProp / applyAttrProp aria-boolean paths and binding-registry.ts no-doc + stale-graph-node guards gained behavioral tests; the remaining sub-95 statements are devtools.ts reactive-overlay + DOM→signal picker machinery (e2e/reactive-overlay.spec.ts) and hydrate.ts parity-fuzz recovery arms that land with e2e-tier coverage. LOWERED 94 → 92 statements / 86 → 83 branches (2026-08): the row-plan replay hydrator (hydration-plan.ts, PR #2694) landed at 72.57% statements / 59.34% branches and dragged the package under its own gate, reddening Coverage (Full) on EVERY main run. `hydration-plan.test.tsx` covers the bail contract — the refusals a fast path\'s correctness rests on — plus tplAdoptVerify, lifting that file to 78% and the package to 92.90 / 84.01. The residual is the replay INTERNALS (adopt-plan build/replay, signature matching), which need real SSR row fixtures rather than synthetic vnodes; that is the tracked lift back to 94/86. This is visible debt, not a new normal.',
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
    currentBranches: 86,
    reason:
      'MCP server. First explicit full thresholds landed at the 2026-07 coverage-gate restoration (measured 94.55/87.64 locally). Branches re-baselined 87 → 86 on 2026-08-04 at the measured 86.12: the atlas + content tool arms added by #2610/#2646 (get_atlas_catalog fallbacks, content walking) grew the optional-chain-dense branch surface faster than its tests, and the drift went unnoticed because the coverage child was dying on CI before printing a summary (turned loud the same day). Ratchet back to 87+ as those arms get specs. Residual gap is tool-handler orchestration + docs-parsing arms against rare doc shapes.',
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
  /** Declared-but-previously-unenforced metrics that came in under. */
  shortfalls: MetricShortfall[]
}

/**
 * What a package's coverage run actually produced.
 *
 * The three cases are deliberately distinct, because conflating them is how
 * this gate went dead. A package that MEASURED NOTHING is not a package with
 * bad coverage, and a package whose run never finished is not a package that
 * passed — but before this, the first was reported as `0%` (sending you to
 * write tests that already existed) and the second was printed once mid-run
 * and then dropped from the table, the exit code, and CI entirely.
 */
export type CoverageOutcome =
  | { kind: 'measured'; statements: number; branches: number; functions: number; lines: number }
  /** The run succeeded but ZERO files were instrumented — `( 0/0 )`. */
  | { kind: 'empty' }
  /** The run timed out, crashed, or printed nothing parseable. */
  | { kind: 'unparseable' }

/**
 * Read the istanbul `text-summary` block, which is the authoritative and
 * always-present output:
 *
 * ```
 * Statements   : 99.18% ( 365/368 )
 * ```
 *
 * The ASCII `All files | …` table is NOT a reliable parse target: when a
 * package measures exactly one file the reporter omits the aggregate row, so
 * the old regex silently failed to match and the package was dropped. The
 * summary block also carries the RATIO, which is the only way to tell
 * `0% of 500 statements` (real, terrible) from `0/0` (nothing measured at all).
 *
 * Pure — unit-tested.
 */
/** Last ~700 chars of a child's output, ANSI-stripped, for failure records. */
function tailOf(stdout: string): string {
  // oxlint-disable-next-line no-control-regex -- deliberately matching ESC to strip ANSI color codes
  const clean = stdout.replace(/\x1b\[[0-9;]*m/g, '').trimEnd()
  return clean.length > 700 ? '…' + clean.slice(-700) : clean
}

/** A test the child's `--reporter=json` blob recorded as failed. */
export interface VitestFailure {
  name: string
  message: string
}

/**
 * Pull failing-test names out of the child's `--reporter=json` output.
 *
 * The spawn asks vitest for the json TEST reporter precisely so the output is
 * machine-readable — and then, until 2026-08, the gate never read it. When a
 * test failed under the coverage run, vitest exited 1 and (with
 * `coverage.reportOnFailure` at its false default) skipped the coverage
 * report entirely, so the error read "produced no parseable coverage summary
 * (child ended with exit=1 signal=none)" with a tail of raw coverageMap JSON —
 * structurally undiagnosable, while the SAME captured output carried the
 * failing test's name and assertion message a few hundred KB earlier.
 * (Observed on main run 30946924730: @pyreon/mcp, load-dependent — green on
 * macOS, green in an idle Linux container, red only under the runner.)
 *
 * The blob is one giant line: Jest-shaped `{ testResults: [ {
 * assertionResults: [...] } ] }` with a trailing coverageMap. Parse the LAST
 * `{`-prefixed line that yields `testResults`; cap what we keep so a mass
 * failure doesn't flood the gate's error line. Pure — unit-tested.
 */
export function extractVitestFailures(stdout: string): VitestFailure[] | null {
  const lines = stdout.split('\n').filter((l) => l.trimStart().startsWith('{'))
  for (let i = lines.length - 1; i >= 0; i--) {
    let parsed: unknown
    try {
      parsed = JSON.parse(lines[i]!)
    } catch {
      continue
    }
    const doc = parsed as {
      testResults?: Array<{
        assertionResults?: Array<{
          fullName?: string
          title?: string
          status?: string
          failureMessages?: string[]
        }>
      }>
    }
    if (!Array.isArray(doc.testResults)) continue
    const failures: VitestFailure[] = []
    for (const tr of doc.testResults) {
      for (const a of tr.assertionResults ?? []) {
        if (a.status !== 'failed') continue
        const message = usefulFailureMessage(a.failureMessages?.[0], stdout)
        failures.push({ name: a.fullName ?? a.title ?? '(unnamed test)', message })
      }
    }
    return failures
  }
  return null
}

/**
 * The assertion text for a failed spec — or the best available substitute.
 *
 * vitest's json reporter usually carries the real assertion in
 * `failureMessages[0]`. Under the instrumented run it sometimes carries the
 * sentinel `Error: STACK_TRACE_ERROR` plus a runner-internal stack instead:
 * the error could not be serialised. Observed on main run 31788903029, where
 * @pyreon/loom's failure reported exactly that and nothing else — a
 * load-only failure whose ONE artifact is its message, reduced to a
 * placeholder.
 *
 * When that happens, fall back to the first real assertion line in the
 * child's human-readable output, which vitest still prints.
 */
export function usefulFailureMessage(raw: string | undefined, stdout: string): string {
  const flat = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 240)
  const isSentinel = (s: string): boolean =>
    s.length === 0 || /^Error:\s*STACK_TRACE_ERROR\b/.test(s.trim())
  if (raw !== undefined && !isSentinel(raw)) return flat(raw)
  // `[\s\S]` rather than `.` so a multi-line assertion diff survives; the
  // first match is the failing spec's, since vitest prints failures in order.
  const m = stdout.match(/(AssertionError|TypeError|ReferenceError|Error):[\s\S]{0,400}/)
  if (m) return `${flat(m[0])} [recovered from output — the json reporter returned STACK_TRACE_ERROR]`
  return raw === undefined ? '' : flat(raw)
}

export function parseCoverageOutput(stdout: string): CoverageOutcome {
  const read = (label: string): { pct: number; total: number } | null => {
    // `Unknown%` is what istanbul prints for 0/0, so the percent is optional.
    const m = stdout.match(
      new RegExp(`${label}\\s*:\\s*(?:([\\d.]+)%|Unknown%)\\s*\\(\\s*\\d+/(\\d+)\\s*\\)`),
    )
    if (!m) return null
    return { pct: m[1] ? Number(m[1]) : 0, total: Number(m[2]) }
  }

  const s = read('Statements')
  const b = read('Branches')
  const f = read('Functions')
  const l = read('Lines')

  if (!s || !b || !f || !l) return { kind: 'unparseable' }
  if (s.total === 0) return { kind: 'empty' }

  return {
    kind: 'measured',
    statements: s.pct,
    branches: b.pct,
    functions: f.pct,
    lines: l.pct,
  }
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

/**
 * Every threshold a package DECLARES, not just the one the gate used to read.
 *
 * The blind spot this closes: pass/fail was `outcome.statements >= threshold`,
 * so `branches`, `functions` and `lines` were declared in each package's
 * `vitest.config.ts` and never compared by CI. Measured on a green main run,
 * 17 packages sat below a threshold they themselves declare -- 20 floors in
 * total. `vitest run --coverage` fails locally on them while CI reported the
 * package green, which is a declared-but-unenforced threshold: the same family
 * as the gate holes closed in #3126.
 */
export interface DeclaredThresholds {
  statements: number
  branches: number
  functions: number
  lines: number
}

export type Metric = keyof DeclaredThresholds

const METRICS: readonly Metric[] = ['statements', 'branches', 'functions', 'lines']

export function parseDeclaredThresholds(
  configSource: string | null,
  fallback: number,
): Partial<DeclaredThresholds> {
  // ONLY what the config actually states. Substituting a default for an absent
  // metric INVENTS a threshold the package never declared, and this gate's
  // whole claim is that it compares what a package declares. It shipped with
  // the fallback applied to all four and immediately blocked three unrelated
  // PRs: `@pyreon/atlas` declares no `lines` (judged against 95, measures
  // 81.44) and `@pyreon/server` declares no `functions` (against 95, measures
  // 92.85). Neither had a ratchet floor either, because the SEEDING pass
  // correctly recorded only declared metrics -- so the two halves disagreed.
  //
  // `statements` keeps its own long-standing fallback via `getPackageThreshold`,
  // unchanged: every package is expected to have one, and that comparison
  // predates this function.
  const out: Partial<DeclaredThresholds> = {}
  for (const metric of METRICS) {
    const m = configSource?.match(new RegExp(`${metric}:\\s*(\\d+(?:\\.\\d+)?)`))
    if (m?.[1] !== undefined) out[metric] = Number(m[1])
  }
  if (out.statements === undefined) out.statements = fallback
  return out
}

/** Ratchet floors for metrics a package declares but measured below. */
const BASELINE_FLOORS: Record<string, Partial<Record<Metric, number>>> = (() => {
  const path = join(import.meta.dirname, 'coverage-threshold-baseline.json')
  if (!existsSync(path)) return {}
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
    packages?: Record<string, Partial<Record<Metric, number>>>
  }
  return parsed.packages ?? {}
})()

/** Every threshold a package's vitest config actually STATES (absent = not compared). */
function declaredThresholdsFor(pkgDir: string): Partial<DeclaredThresholds> {
  const configPath = join(pkgDir, 'vitest.config.ts')
  const src = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : null
  return parseDeclaredThresholds(src, DEFAULT_THRESHOLD)
}

export interface MetricShortfall {
  metric: Metric
  measured: number
  declared: number
  /** The ratchet floor: the value recorded when this gap was seeded. */
  floor: number
  /** Below the floor is a REGRESSION (fails); at-or-above is a known gap (warns). */
  regressed: boolean
}

/**
 * Compare every declared metric, honouring the ratchet.
 *
 * No baseline entry means the package must MEET its declaration. An entry means
 * it may sit at the recorded value but never drop below it -- identical
 * semantics to `lint-baseline.json`, so a known gap cannot quietly widen while
 * the aspiration in the package's own config stays visible as the target.
 */
/**
 * How far under a recorded floor is still the same measurement.
 *
 * A floor seeded at the EXACT measured value has zero tolerance, and coverage
 * is not bit-stable: worker count, a timing-dependent skip, or a test that
 * touches one more line all move it a fraction. Shipped without this, a
 * 0.25pp drift in `@pyreon/compiler` functions (91.06 -> 90.81) failed the gate
 * on a PR that does not touch that package. The bundle-budget gate reached the
 * same conclusion for gzip variance and says so in its own failure text.
 *
 * Deliberately small: it absorbs noise, not a real regression. A package losing
 * a whole percentage point of coverage still fails.
 */
export const FLOOR_TOLERANCE_PP = 0.5

export function findShortfalls(
  measured: DeclaredThresholds,
  declared: Partial<DeclaredThresholds>,
  floors: Partial<Record<Metric, number>> | undefined,
): MetricShortfall[] {
  const out: MetricShortfall[] = []
  for (const metric of METRICS) {
    const value = measured[metric]
    const want = declared[metric]
    // Not declared -> not compared. See parseDeclaredThresholds.
    if (want === undefined) continue
    if (value >= want) continue
    const floor = floors?.[metric]
    // Statements keep their own long-standing hard comparison elsewhere; a
    // package with no recorded floor for a metric must simply meet it.
    const effective = floor ?? want
    out.push({
      metric,
      measured: value,
      declared: want,
      floor: effective,
      regressed: value < effective - FLOOR_TOLERANCE_PP,
    })
  }
  return out
}

/**
 * A package whose coverage could NOT be established. Never silently dropped:
 * these fail the gate, because a gate that cannot tell "not measured" from
 * "measured and fine" protects nothing.
 */
interface CoverageProblem {
  package: string
  kind: 'empty' | 'unparseable' | 'tests-failed'
  timedOut: boolean
  error?: string
  /** For `tests-failed`: the failing tests named by the json reporter blob. */
  failedTests?: VitestFailure[]
  /**
   * The tail of what the child actually printed, ANSI-stripped.
   *
   * A failure record without it is undiagnosable from CI: the 2026-08-04
   * incident printed 72 × "NO COVERAGE OUTPUT" and NOTHING else, so the real
   * cause (`Error: Coverage APIs are not supported` — vitest running under
   * bun) was only recoverable by rebuilding the environment in Docker. The
   * message is the artifact; it must carry the evidence.
   */
  outputTail?: string
}

/** Run coverage for a single package asynchronously. */
function runCoverage(
  pkgDir: string,
  pkgName: string,
  threshold: number,
): Promise<CoverageResult | CoverageProblem> {
  return new Promise((resolve) => {
    // Vitest runs under NODE, explicitly — never under whatever the shebang
    // happens to resolve to.
    //
    // `@vitest/coverage-v8` drives coverage through `node:inspector`'s
    // Profiler API. Bun's inspector does not implement it: under bun the run
    // dies in ~2s with `Error: Coverage APIs are not supported`, ZERO tests
    // execute, the coverage table prints 0% for every file, and the
    // text-summary block never prints (thresholds abort first). That is not
    // hypothetical — it is exactly what turned every main push red on
    // 2026-08-04 (72/72 packages "NO COVERAGE OUTPUT"): the previous spawn was
    // `bun run test`, which leaves the vitest binary's `#!/usr/bin/env node`
    // shebang to decide the runtime from ambient PATH. Locally that found
    // node; on the runner, between two pushes five hours apart with no
    // relevant repo change, it stopped finding it — an environmental flip we
    // do not control. Every measured package's test script is exactly
    // `vitest run` (verified across all six package dirs), so invoking the
    // vitest entry directly is faithful, and pinning the runtime removes the
    // whole class instead of depending on PATH luck.
    // `--coverage.reporter=text-summary` EXPLICITLY, for the same reason the
    // runtime is explicit: the parser reads the istanbul text-summary block,
    // and whether the AMBIENT default reporter set includes it turned out to
    // vary by environment (observed 2026-08-04: the identical vitest version
    // printed the block on macOS and not on Linux). A gate must ask for the
    // output it parses, not hope the default includes it. Side benefit: the
    // CLI list REPLACES the default ['text','html','clover','json'], so
    // children stop writing html/clover/json reports nobody reads — less work
    // per package.
    // `--coverage.reportOnFailure` because its false default couples two
    // independent facts: one failing test (vitest exit 1) suppresses the
    // ENTIRE coverage report, so the gate reads "no parseable summary" when
    // the truth is "measured fine, one test flaked". With the flag, a
    // failing-test run still prints the summary — the gate then reports BOTH
    // the named failure and the measured numbers instead of a mystery.
    const child = spawn(
      'node',
      [
        VITEST_ENTRY,
        'run',
        '--coverage',
        '--reporter=json',
        '--coverage.reporter=text-summary',
        '--coverage.reportOnFailure',
      ],
      {
        cwd: pkgDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Tell the suite it is running UNDER coverage instrumentation. A
        // handful of specs measure TIME (a growth ratio, a wall-clock
        // ceiling); V8 coverage adds a per-basic-block cost plus GC pressure
        // that is not proportional to input size, so under instrumentation
        // those numbers describe the instrumenter rather than the code. They
        // skip on this flag and still gate in the ordinary Test cell, which
        // runs on every PR. Set here rather than sniffed inside the test:
        // vitest exposes no env var for "coverage is on", so guessing one
        // silently never skips (verified — neither VITEST_COVERAGE nor
        // NODE_V8_COVERAGE is set by vitest).
        env: { ...process.env, PYREON_COVERAGE_RUN: '1' },
      },
    )

    let stdout = ''
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, PACKAGE_TIMEOUT_MS)

    child.on('close', (code, signal) => {
      clearTimeout(timer)

      const outcome = parseCoverageOutput(stdout)
      // A non-zero exit with named test failures is its OWN outcome — even
      // when the summary parsed. Without this branch, `reportOnFailure` would
      // quietly LAUNDER a main-branch test failure into a green coverage row
      // (the Test cells run the same specs uninstrumented, so a failure that
      // only reproduces under coverage load would vanish entirely).
      // A non-zero exit with ZERO failed tests + a parsed summary is vitest's
      // own threshold enforcement — fall through to `measured`, where this
      // gate applies its floors itself.
      const failures = code !== 0 && !timedOut ? extractVitestFailures(stdout) : null
      if (failures && failures.length > 0) {
        const named = failures
          .slice(0, 3)
          .map((f) => `"${f.name}"${f.message ? ` — ${f.message}` : ''}`)
          .join('; ')
        const measuredNote =
          outcome.kind === 'measured'
            ? ` Coverage WAS measured (${outcome.statements}% stmts / ${outcome.branches}% branch).`
            : ''
        resolve({
          package: pkgName,
          kind: 'tests-failed',
          timedOut: false,
          failedTests: failures,
          error:
            `${failures.length} test(s) FAILED under the coverage run (exit=${code ?? 'null'}): ` +
            `${named}${failures.length > 3 ? `; +${failures.length - 3} more` : ''}.${measuredNote}`,
          outputTail: tailOf(stdout),
        })
      } else if (outcome.kind === 'measured') {
        resolve({
          package: pkgName,
          statements: outcome.statements,
          branches: outcome.branches,
          functions: outcome.functions,
          lines: outcome.lines,
          pass: outcome.statements >= threshold,
          threshold,
          // Filled by the caller, which owns the declared-threshold policy.
          shortfalls: [],
        })
      } else {
        // How the child ENDED is the first diagnostic for an unparseable run —
        // a SIGKILL/137 here is the runner OOM-killing the coverage remap,
        // which reads as "printed the json report, then nothing" and cost a
        // root-causing round when it wasn't named (main run 30922462710).
        resolve({
          package: pkgName,
          kind: outcome.kind,
          timedOut,
          error: `child ended with exit=${code ?? 'null'} signal=${signal ?? 'none'}`,
          outputTail: tailOf(stdout),
        })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        package: pkgName,
        kind: 'unparseable',
        timedOut,
        error: String(err),
        outputTail: tailOf(stdout),
      })
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
): Promise<{
  results: CoverageResult[]
  problems: CoverageProblem[]
  staleDeclarations: string[]
}> {
  const results: CoverageResult[] = []
  const problems: CoverageProblem[] = []
  const staleDeclarations: string[] = []
  const queue = [...packages]

  async function worker() {
    while (queue.length > 0) {
      const pkg = queue.shift()
      if (!pkg) break

      // ONE atomic line per package, written when that package finishes.
      //
      // This was a newline-less `Testing <name>...` followed by the result in
      // a separate log after the await. With four workers that interleaves:
      // worker A opens a line, worker B opens another, then A's percentage
      // lands on B's line — so the log confidently attributes one package's
      // number to a different package. Reading it during this very change,
      // `@pyreon/atlas`'s 79.72% appeared beside `@pyreon/zero`, which reads
      // as a real finding about entirely the wrong package.
      const outcome = await runCoverage(pkg.dir, pkg.name, pkg.threshold)
      if ('statements' in outcome) {
        // Compare the three metrics the gate used to ignore. Done HERE rather
        // than inside runCoverage so the measurement stays a pure function of
        // the child process and the POLICY lives in one place.
        outcome.shortfalls = findShortfalls(
          {
            statements: outcome.statements,
            branches: outcome.branches,
            functions: outcome.functions,
            lines: outcome.lines,
          },
          declaredThresholdsFor(pkg.dir),
          BASELINE_FLOORS[pkg.name],
        )
        results.push(outcome)
        const regressed = outcome.shortfalls.filter((s) => s.regressed)
        const mark = outcome.pass && regressed.length === 0 ? '\u2705' : '\u274c'
        console.log(`  ${pkg.name}: ${outcome.statements}% ${mark}`)
        for (const s of regressed) {
          console.log(
            `    \u274c ${s.metric} ${s.measured}% is BELOW its ratchet floor ${s.floor}% ` +
              `(package declares ${s.declared}%)`,
          )
        }
        if (NO_INSTRUMENTABLE_SOURCE[pkg.name]) {
          // The declaration has gone stale: the package now HAS measurable
          // source, so the exemption is hiding a real threshold. Without this
          // the entry would quietly outlive its reason \u2014 which is the same rot
          // that made this gate worth fixing in the first place.
          staleDeclarations.push(pkg.name)
        }
      } else if (outcome.kind === 'empty' && NO_INSTRUMENTABLE_SOURCE[pkg.name]) {
        // Declared to have nothing to instrument \u2014 its tests still ran.
        console.log(`  ${pkg.name}: \u2014 (no instrumentable source, by declaration)`)
      } else {
        problems.push(outcome)
        const why =
          outcome.kind === 'empty'
            ? 'MEASURED NOTHING'
            : outcome.kind === 'tests-failed'
              ? `${outcome.failedTests?.length ?? '?'} TEST(S) FAILED`
              : outcome.timedOut
                ? 'TIMED OUT'
                : 'NO COVERAGE OUTPUT'
        console.log(`  ${pkg.name}: \u274c ${why}`)
      }
    }
  }

  // Nested-build packages run AFTER the pool drains, one at a time — see
  // SERIAL_PACKAGES. Partitioning the queue rather than lowering CONCURRENCY
  // globally keeps the other ~67 packages at full parallelism, so the gate's
  // wall clock barely moves while the memory peak drops to one heavy suite.
  const serial = queue.filter((p) => SERIAL_PACKAGES.has(p.name))
  const parallel = queue.filter((p) => !SERIAL_PACKAGES.has(p.name))
  queue.length = 0
  queue.push(...parallel)

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
  await Promise.all(workers)

  if (serial.length > 0) {
    console.log(`\n  (${serial.length} nested-build package(s) run serially — see SERIAL_PACKAGES)`)
    queue.push(...serial)
    await worker()
  }

  return { results, problems, staleDeclarations }
}

/**
 * Explain a package whose coverage could not be established, and say what to
 * do about it. The `empty` case is the one that has burned three packages now
 * (`@pyreon/store` #2167, `@pyreon/runtime-server`, `@pyreon/config`), and the
 * old gate reported it as `0% statements (need 95%)` \u2014 which reads as "write
 * some tests" when in fact the tests exist and pass, and the real problem is
 * that not one file was handed to the instrumenter.
 */
export function describeProblem(p: CoverageProblem): string {
  if (p.kind === 'empty') {
    return (
      `${p.package}: coverage ran and measured ZERO files ( 0/0 ).\n` +
      `    This is a MEASUREMENT failure, not a coverage failure \u2014 the tests may all pass.\n` +
      `    Almost always: the package's logic lives in src/index.ts, which the shared\n` +
      `    vitest config excludes as a re-export barrel. Fix by setting\n` +
      `    \`includeIndexInCoverage: true\` in the package's vitest.config.ts.`
    )
  }
  if (p.kind === 'tests-failed') {
    // `STACK_TRACE_ERROR` with no assertion text is a DEAD WORKER, not a failed
    // assertion — vitest attributes it to whichever spec was in flight, which
    // is reliably the longest-running one in the package. Telling the reader to
    // "deflake the NAMED test" then sends them at an innocent spec: this gate
    // has done exactly that once already, naming `strip-equivalence` when the
    // real cause was a 3.9 GB build under a 4-way-parallel job, and named the
    // same spec again on 2026-08-28.
    const deadWorker = /STACK_TRACE_ERROR/.test(p.error ?? '')
    if (deadWorker) {
      return (
        `${p.package}: ${p.error ?? 'tests failed under the coverage run'}\n` +
        `    \u26a0 STACK_TRACE_ERROR with no assertion text means the WORKER DIED \u2014 almost\n` +
        `    always out-of-memory under this job's 4-way parallelism, NOT a defect in the\n` +
        `    named spec. vitest blames whichever test was in flight, which is reliably the\n` +
        `    package's longest-running one.\n` +
        `    Attribute by measuring peak RSS per test FILE (/usr/bin/time -l bunx vitest\n` +
        `    run <file>), never by reading the name above. Do NOT re-run past it.`
      )
    }
    return (
      `${p.package}: ${p.error ?? 'tests failed under the coverage run'}\n` +
      `    This job runs on main pushes, so the failure is main-branch evidence. If the\n` +
      `    same spec is green in the Test cells, it fails only under coverage\n` +
      `    instrumentation load \u2014 deflake the NAMED test (see testing.md "the message\n` +
      `    is the artifact"); do not re-run past it.`
    )
  }
  if (p.timedOut) {
    return (
      `${p.package}: coverage run exceeded ${PACKAGE_TIMEOUT_MS / 1000}s and was killed.\n` +
      `    Its thresholds were NOT enforced. Speed the suite up or raise PACKAGE_TIMEOUT_MS \u2014\n` +
      `    do not leave it unmeasured.`
    )
  }
  return (
    `${p.package}: produced no parseable coverage summary${p.error ? ` (${p.error})` : ''}.\n` +
    (p.outputTail
      ? `    The child printed:\n${p.outputTail
          .split('\n')
          .map((l) => `      | ${l}`)
          .join('\n')}`
      : `    Run \`bun run test -- --coverage\` in the package to see what it printed.`)
  )
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

/**
 * Run the gate only when this file IS the process entry.
 *
 * Without this, importing the module for its pure helpers RUNS the whole gate:
 * under vitest the cwd is the importing package, so no `packages/*` directory
 * resolves, every exemption looks stale, and the import dies on `process.exit(1)`
 * before a single test executes.
 *
 * `import.meta.main` is Bun-and-Node-≥24.2 only, so it is a hint, not the test —
 * the repo hit exactly that with `@pyreon/mcp`'s bin, which started nothing
 * under Node LTS. Falling back to comparing the resolved entry path keeps this
 * working on every runtime.
 */
// The reasoning above now lives ONCE, in `./is-entry` — a second copy of a
// subtle runtime check is a drift source, and this file's copy was already being
// re-derived by hand elsewhere.
const isEntry = isModuleEntry(import.meta)

if (!isEntry) {
  // Imported for `parseCoverageOutput` — export surface only, no gate.
} else {

const isCI = !!process.env.CI
const isFloorOnly = process.argv.includes('--floor-only')

/**
 * `--only a,b` restricts the run to named packages.
 *
 * This exists so coverage can be enforced at PR time for the packages a PR
 * actually touches. The full run is `push:main`-only, and that cadence is why
 * this gate has now rotted twice inside a month: nothing measures coverage
 * while a change is still reviewable, so drift lands freely and surfaces on
 * main, where a red gate blocks nobody and gets re-run past.
 */
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const onlyNames = onlyArg
  ? new Set(
      onlyArg
        .slice('--only='.length)
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean),
    )
  : null

const allPackages = collectPackages()
const packages = onlyNames ? allPackages.filter((p) => onlyNames.has(p.name)) : allPackages

if (onlyNames && packages.length === 0) {
  // Nothing to measure is a legitimate outcome here (a docs-only PR), but say
  // so explicitly rather than printing an empty table that reads like a pass.
  console.log(
    `\n\u2705 Coverage (affected): no packages from --only matched a testable workspace ` +
      `(${[...onlyNames].join(', ') || 'none given'}) — nothing to measure.\n`,
  )
  process.exit(0)
}

// Enforce the floor BEFORE running coverage so misconfigured
// thresholds surface even if coverage execution times out / skips.
const floorErrors = enforceFloor(allPackages)
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

// Preflight ONCE, loudly. A node-less environment (or a missing vitest
// entry) must fail here with a sentence, not as 72 per-package
// "NO COVERAGE OUTPUT" rows a reader has to reverse-engineer.
const nodeVersion = (() => {
  const nodeCheck = spawnSync('node', ['--version'], { encoding: 'utf8' })
  if (nodeCheck.error || nodeCheck.status !== 0) {
    console.error(
      '[check-coverage] FAILED — `node` is not runnable in this environment. ' +
        'Coverage REQUIRES node: @vitest/coverage-v8 drives the V8 profiler through ' +
        "node:inspector, which bun does not implement ('Coverage APIs are not supported'). " +
        'Install node (CI: pass node-version to setup-pyreon).',
    )
    process.exit(1)
  }
  if (!existsSync(VITEST_ENTRY)) {
    console.error(
      `[check-coverage] FAILED — vitest entry not found at ${VITEST_ENTRY}. ` +
        'Run from the workspace root after `bun install`.',
    )
    process.exit(1)
  }
  return nodeCheck.stdout.trim()
})()

console.log(
  `\nRunning coverage for ${packages.length} packages (${CONCURRENCY} parallel, vitest under node ${nodeVersion})...\n`,
)

const { results, problems, staleDeclarations } = await runWithConcurrency(packages)
const sorted = results.sort((a, b) => a.package.localeCompare(b.package))
const sortedProblems = problems.sort((a, b) => a.package.localeCompare(b.package))
const hasFailures =
  sorted.some(isFailingResult) || sortedProblems.length > 0 || staleDeclarations.length > 0

// Build report
const reportLines: string[] = [
  '',
  '## Coverage Report',
  '',
  '| Package | Stmts | Branch | Funcs | Lines | Threshold | Status |',
  '|---------|-------|--------|-------|-------|-----------|--------|',
]

for (const r of sorted) {
  // A row must not read \u2705 while the run fails. Before the declared-metric
  // comparison existed this was `r.pass` alone, so a package failing on a
  // ratcheted metric printed a green row beside a red gate.
  const status = isFailingResult(r) ? '\u274c' : '\u2705'
  reportLines.push(
    `| ${r.package} | ${r.statements}% | ${r.branches}% | ${r.functions}% | ${r.lines}% | ${r.threshold}% | ${status} |`,
  )
}

// Unmeasured packages appear in the SAME table. Before this they were printed
// once mid-run and then dropped \u2014 so a package whose thresholds were never
// enforced looked exactly like a package that did not exist.
for (const p of sortedProblems) {
  const what =
    p.kind === 'empty'
      ? 'MEASURED NOTHING'
      : p.kind === 'tests-failed'
        ? 'TESTS FAILED'
        : p.timedOut
          ? 'TIMED OUT'
          : 'NO OUTPUT'
  reportLines.push(`| ${p.package} | \u2014 | \u2014 | \u2014 | \u2014 | \u2014 | \u274c ${what} |`)
}

if (sortedProblems.length > 0) {
  reportLines.push(
    '',
    `\u274c ${sortedProblems.length} package(s) could not be measured \u2014 their thresholds were NOT enforced:`,
    '',
    ...sortedProblems.map((p) => `  ${describeProblem(p)}`),
  )
}

if (staleDeclarations.length > 0) {
  reportLines.push(
    '',
    `\u274c ${staleDeclarations.length} NO_INSTRUMENTABLE_SOURCE declaration(s) are STALE — ` +
      `these packages now have measurable source, so the exemption is hiding a real threshold:`,
    ...staleDeclarations.map(
      (n) => `  ${n}: remove its NO_INSTRUMENTABLE_SOURCE entry in scripts/check-coverage.ts.`,
    ),
  )
}

/**
 * The ONE failure predicate. Row status, summary line and exit code must all
 * ask the same question -- they did not, and the gate printed
 * "All packages meet their coverage thresholds" directly above three rows
 * marked with a cross, while exiting 1. A reader believes the sentence.
 */
function isFailingResult(r: CoverageResult): boolean {
  return !r.pass || r.shortfalls.some((sf) => sf.regressed)
}

if (sorted.some(isFailingResult)) {
  reportLines.push('', '\u274c Some packages below their coverage threshold')
} else if (sortedProblems.length === 0) {
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
  for (const p of sortedProblems) {
    console.log(`::error::${describeProblem(p).replace(/\n\s*/g, ' ')}`)
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  }
}

if (hasFailures) {
  process.exit(1)
}

} // end `isEntry` gate
