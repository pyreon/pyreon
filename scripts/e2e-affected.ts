#!/usr/bin/env bun
/**
 * E2E suite selector — emits a GitHub Actions matrix `include` JSON for the
 * `e2e` job so a pull_request runs ONLY the e2e suites its changes can
 * affect, not all 11.
 *
 * ## Why
 *
 * The `e2e` job is the slowest required check. Pre-this-script it ran 11
 * suites sequentially in one runner (sum of all ≈ 6-10 min) on EVERY PR,
 * regardless of what changed — a docs-only or single-package PR paid the
 * full cost, and one flaky suite aborted every suite after it. The new
 * workflow shape is a `fail-fast: false` matrix (each suite its own
 * parallel job + its own check); this script decides WHICH matrix entries
 * a given PR needs.
 *
 * ## Safety posture — false-negatives are the danger, not wasted minutes
 *
 * Skipping a suite that WOULD have caught a regression is far worse than
 * running an extra one. So:
 *
 *  - On `push: main` / `merge_group` the workflow passes `--all` → every
 *    suite runs. Only `pull_request` is ever scoped. The gate that
 *    actually protects `main` never trusts this script's narrowing.
 *  - Any change with broad/unknowable blast radius forces the FULL set:
 *    core framework packages, the vite-plugin, ANY `playwright*.config.ts`
 *    OR `e2e-configs/**`, the workflow itself, `scripts/**`, `bun.lock`,
 *    root `package.json` / `tsconfig*`. (Mirrors `scripts/affected.ts`'s
 *    root-file safety net.)
 *  - Per-suite path triggers are deliberately GENEROUS supersets.
 *
 * ## Output
 *
 *  - `--matrix` (default): a single line of JSON — `[{ "name": "...",
 *    "script": "..." }, ...]` for `strategy.matrix.include`. Empty `[]`
 *    when nothing e2e-relevant changed (docs-only PR) — the workflow's
 *    aggregator job treats an empty matrix as a green skip.
 *  - `--list`: human-readable, one suite id per line (debugging).
 *
 * ## Usage
 *
 *   bun run scripts/e2e-affected.ts --base=origin/main      # PR scoping
 *   bun run scripts/e2e-affected.ts --all                   # force full
 *   bun run scripts/e2e-affected.ts --base=HEAD~5 --list     # debug
 */

import { execFileSync } from 'node:child_process'

// ── Suite catalogue ────────────────────────────────────────────────────────
// `name` is the matrix label + check name; `script` is the package.json
// script the matrix job runs. `triggers` are path PREFIXES (substring-from-
// start) — if ANY changed file starts with ANY trigger, the suite runs.
// Keep triggers generous: a superset that runs an extra suite is fine; a
// gap that skips a relevant one is a bug.

interface Suite {
  name: string
  script: string
  triggers: string[]
}

// Shared trigger groups.
const ROUTER_CORE = [
  'packages/core/router/',
  'packages/core/server/',
  'packages/core/runtime-server/',
  'packages/zero/',
]
const RENDER_CORE = [
  'packages/core/reactivity/',
  'packages/core/core/',
  'packages/core/runtime-dom/',
]

const SUITES: Suite[] = [
  {
    // playground + ssr-showcase + fundamentals (the main `test:e2e`).
    name: 'core',
    script: 'test:e2e',
    triggers: [
      ...RENDER_CORE,
      ...ROUTER_CORE,
      'packages/fundamentals/',
      'packages/core/head/',
      'examples/playground/',
      'examples/ssr-showcase/',
      'examples/fundamentals-playground/',
      'e2e/',
    ],
  },
  {
    name: 'ui-regression',
    script: 'test:e2e:ui-regression',
    triggers: [
      ...RENDER_CORE,
      'packages/ui-system/',
      'packages/ui/',
      'examples/ui-showcase/',
      'e2e/ui-showcase-regression.spec.ts',
    ],
  },
  {
    name: 'cssvars',
    script: 'test:e2e:cssvars',
    triggers: [
      ...RENDER_CORE,
      'packages/ui-system/ui-core/',
      'packages/ui-system/rocketstyle/',
      'packages/ui-system/unistyle/',
      'packages/ui/',
      'examples/cssvars-bench/',
      'e2e/cssvars-showcase.spec.ts',
    ],
  },
  {
    name: 'compat',
    script: 'test:e2e:compat',
    triggers: [
      ...RENDER_CORE,
      'packages/tools/react-compat/',
      'packages/tools/preact-compat/',
      'packages/tools/vue-compat/',
      'packages/tools/solid-compat/',
      'packages/tools/svelte-compat/',
      'examples/react-compat/',
      'examples/preact-compat/',
      'examples/vue-compat/',
      'examples/solid-compat/',
      'examples/svelte-compat/',
    ],
  },
  {
    name: 'app-showcase',
    script: 'test:e2e:app-showcase',
    triggers: [
      ...RENDER_CORE,
      'packages/fundamentals/flow/',
      'packages/fundamentals/dnd/',
      'examples/app-showcase/',
      'e2e/app-showcase-',
    ],
  },
  {
    name: 'islands',
    script: 'test:e2e:islands',
    triggers: [
      ...RENDER_CORE,
      'packages/core/server/',
      'examples/islands-showcase/',
      'e2e/islands-showcase',
    ],
  },
  {
    name: 'sync-yjs-demo',
    script: 'test:e2e:sync-yjs-demo',
    triggers: [
      ...RENDER_CORE,
      'packages/fundamentals/sync/',
      'examples/sync-yjs-demo/',
      'e2e/sync-yjs-demo',
    ],
  },
  {
    name: 'sync-ws-relay',
    script: 'test:e2e:sync-ws-relay',
    triggers: [
      ...RENDER_CORE,
      'packages/fundamentals/sync/',
      'examples/sync-yjs-demo/',
      'e2e/sync-ws-relay',
    ],
  },
  {
    name: 'collab-board',
    script: 'test:e2e:collab-board',
    triggers: [
      ...RENDER_CORE,
      'packages/fundamentals/sync/',
      'packages/fundamentals/dnd/',
      'examples/collab-board/',
      'e2e/collab-board',
    ],
  },
  {
    name: 'zero-islands',
    script: 'test:e2e:zero-islands',
    triggers: [
      ...RENDER_CORE,
      'packages/core/server/',
      'packages/zero/zero/',
      'examples/ssr-showcase/',
      'e2e/zero-islands.spec.ts',
    ],
  },
  {
    name: 'ssg-subpath',
    script: 'test:e2e:ssg-subpath',
    triggers: [...ROUTER_CORE, 'examples/ssr-showcase/', 'e2e/ssg-subpath'],
  },
  {
    name: 'ssg-i18n',
    script: 'test:e2e:ssg-i18n',
    triggers: [...ROUTER_CORE, 'examples/ssr-showcase/', 'e2e/ssg-i18n'],
  },
  {
    name: 'ssg-i18n-prefix',
    script: 'test:e2e:ssg-i18n-prefix',
    triggers: [...ROUTER_CORE, 'examples/ssr-showcase/', 'e2e/ssg-i18n-prefix'],
  },
  {
    // SSR node-deploy artifact (Bug A/C). The deploy adapters live in
    // @pyreon/zero (covered by ROUTER_CORE's `packages/zero/`); the example
    // + spec are listed explicitly too.
    name: 'ssr-node',
    script: 'test:e2e:ssr-node',
    triggers: [...ROUTER_CORE, 'examples/ssr-showcase/', 'e2e/ssr-node.spec.ts'],
  },
  {
    // ISR node-deploy artifact — shares the SSR staging/template path, wraps
    // the handler with createISRHandler. End-to-end "ISR-mode artifact runs +
    // serves + hydrates + cache-consistent" proof.
    name: 'isr-node',
    script: 'test:e2e:isr-node',
    triggers: [...ROUTER_CORE, 'examples/ssr-showcase/', 'e2e/isr-node.spec.ts'],
  },
  {
    name: 'zero-hmr',
    script: 'test:e2e:zero-hmr',
    triggers: [
      ...ROUTER_CORE,
      'packages/tools/vite-plugin/',
      'examples/ssr-showcase/',
      'e2e/zero-hmr.spec.ts',
    ],
  },
  {
    name: 'perf-dashboard',
    script: 'test:e2e:perf-dashboard',
    triggers: [
      ...RENDER_CORE,
      'packages/fundamentals/form/',
      'examples/perf-dashboard/',
      'e2e/perf-dashboard',
    ],
  },
  {
    name: 'cpa',
    script: 'test:e2e:cpa',
    triggers: [
      ...ROUTER_CORE,
      'packages/zero/create-zero/',
      'examples/cpa-pw-',
      'e2e/cpa',
    ],
  },
  {
    name: 'native-todomvc-web',
    script: 'test:e2e:native-todomvc-web',
    triggers: [
      ...RENDER_CORE,
      // The web example exercises @pyreon/primitives' DOM impls end-to-end —
      // any change to a web primitive (Stack/Inline/Field/Button/Press/Text)
      // can break the spec.
      'packages/core/primitives/',
      'examples/native-todomvc-web/',
      'e2e/native-todomvc-web',
    ],
  },
  {
    name: 'native-router-demo-web',
    script: 'test:e2e:native-router-demo-web',
    triggers: [
      ...RENDER_CORE,
      // The router demo exercises @pyreon/router's runtime + primitives'
      // DOM impls — any router or primitive change can break it. The
      // iOS source lives at native-router-demo-ios but is consumed by
      // web; both example dirs trigger.
      'packages/core/primitives/',
      'packages/core/router/',
      'examples/native-router-demo-ios/',
      'examples/native-router-demo-web/',
      'e2e/native-router-demo-web',
    ],
  },
]

export { SUITES }
export type { Suite }

// ── Broad-blast-radius files → run EVERYTHING ──────────────────────────────

/**
 * True when a changed path has broad/unknowable blast radius and the
 * conservative response is to run the FULL suite. Exported for unit tests.
 */
export function forcesFullRun(path: string): boolean {
  if (path === 'bun.lock' || path === 'package.json') return true
  if (/^tsconfig.*\.json$/.test(path)) return true
  if (path === 'vitest.shared.ts' || path === 'vitest.browser.ts') return true
  if (path.startsWith('.github/workflows/')) return true
  if (path.startsWith('scripts/')) return true
  if (/^playwright[^/]*\.config\.ts$/.test(path)) return true
  if (path.startsWith('e2e-configs/')) return true
  // Core framework packages underpin essentially every example app.
  if (path.startsWith('packages/core/reactivity/')) return true
  if (path.startsWith('packages/core/core/')) return true
  if (path.startsWith('packages/core/runtime-dom/')) return true
  if (path.startsWith('packages/core/compiler/')) return true
  if (path.startsWith('packages/tools/vite-plugin/')) return true
  return false
}

// ── Pure selection (unit-testable — no IO) ─────────────────────────────────

/**
 * Decide which e2e suites a change set requires. PURE — no git, no env,
 * no process. The CLI (`main`) computes `changed` from git and calls this.
 *
 * @param changed  changed file paths (repo-relative), or `null` when the
 *                 diff could NOT be computed (shallow clone / bad base) —
 *                 treated as "unknown blast radius" → run ALL (safe).
 * @param opts.all force the full suite (push:main / merge_group).
 */
export function selectSuites(
  changed: string[] | null,
  opts: { all?: boolean } = {},
): Suite[] {
  if (opts.all) return SUITES
  if (changed === null) return SUITES // diff failed → safe full run
  if (changed.length === 0) return [] // nothing changed → green skip
  if (changed.some(forcesFullRun)) return SUITES
  return SUITES.filter((s) =>
    changed.some((f) => s.triggers.some((t) => f.startsWith(t))),
  )
}

// ── CLI ────────────────────────────────────────────────────────────────────

function main(): void {
  let base = 'origin/main'
  let all = false
  let list = false
  for (const arg of process.argv.slice(2)) {
    if (arg === '--all') all = true
    else if (arg === '--list') list = true
    else if (arg.startsWith('--base=')) base = arg.slice('--base='.length)
  }

  let changed: string[] | null
  if (all) {
    changed = null // ignored when all=true
  } else {
    try {
      // execFileSync (not execSync) — argv array, no shell interpretation.
      // CodeQL's "indirect uncontrolled command line" rule flags string-
      // interpolated execSync calls even when the value comes from our own
      // CI; defense-in-depth here removes the shell-injection class
      // entirely (`--base="; rm -rf / #"` becomes just an unknown ref to
      // git, not executable shell). Same fix applied to scripts/affected.ts
      // (PR #968 follow-up); landed alongside the concurrency fix in this PR.
      const out = execFileSync(
        'git',
        ['diff', '--name-only', `${base}...HEAD`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      )
      changed = out.split('\n').filter(Boolean)
    } catch {
      changed = null // can't diff → selectSuites returns ALL (safe)
    }
  }

  const chosen = selectSuites(changed, { all })

  if (list) {
    console.log(chosen.map((s) => s.name).join('\n'))
  } else {
    // One compact line — consumed by `fromJSON()` in the workflow.
    console.log(
      JSON.stringify(chosen.map((s) => ({ name: s.name, script: s.script }))),
    )
  }
}

// Only run the CLI when executed directly — NOT when imported by a test.
if (import.meta.main) main()
