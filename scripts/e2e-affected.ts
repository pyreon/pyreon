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

import { gitChangedFilesZ } from './changed-files'

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
    name: 'lathe',
    script: 'test:e2e:lathe',
    triggers: [
      ...RENDER_CORE,
      'packages/tools/lathe/',
      // The generator emits against these surfaces, so a change to any of
      // them can break generated code without touching lathe itself.
      'packages/fundamentals/http/',
      'packages/fundamentals/query/',
      'packages/fundamentals/validate/',
      'examples/lathe-bookshelf/',
      'e2e/lathe-bookshelf.spec.ts',
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
    name: 'kanban',
    script: 'test:e2e:kanban',
    triggers: [
      ...RENDER_CORE,
      'packages/fundamentals/state-tree/',
      'packages/fundamentals/url-state/',
      'packages/fundamentals/toast/',
      'packages/fundamentals/dnd/',
      'packages/fundamentals/hooks/',
      'examples/kanban/',
      'e2e/kanban',
    ],
  },
  {
    name: 'hn-clone',
    script: 'test:e2e:hn-clone',
    triggers: [
      ...RENDER_CORE,
      'packages/fundamentals/query/',
      'packages/zero/zero/',
      'examples/hn-clone/',
      'e2e/hn-clone',
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
    // pyreon.dev itself. The site had NO e2e suite registered here at all —
    // `test:e2e:docs` existed in package.json and `e2e-configs/docs.config.ts`
    // was complete, but nothing ever invoked either, so the public docs site
    // shipped with zero browser coverage. That is what let the search overlay
    // die unnoticed: the compiler inlined `const state = useSearch(opts)` at
    // every JSX use site, so Cmd+K toggled a signal no binding was subscribed
    // to. The spec that would have caught it (`Cmd+K opens search overlay`)
    // was written, correct, and never run.
    //
    // Triggered by the docs source AND by the packages the site is built
    // from — a compiler or runtime change is exactly how it broke.
    name: 'docs',
    script: 'test:e2e:docs',
    triggers: [
      ...RENDER_CORE,
      'packages/core/compiler/',
      'packages/tools/vite-plugin/',
      'packages/zero/zero/',
      'packages/zero/zero-content/',
      // The SITE's code, not its prose: a markdown content edit must stay
      // free (209 doc pages — booting Playwright for a typo is the kind of
      // cost that gets a suite disabled again).
      'docs/src/components/',
      'docs/src/routes/',
      // A live `<Example>` is site CODE — it mounts, it can throw, and the
      // suite asserts it paints. Prose stays free; these do not.
      'docs/src/examples/',
      // …and the package those examples exercise. The charts specs here are
      // the only place the plot marks go through the REAL compiler into a
      // REAL browser, so a charts change that does not run them is a spec
      // that was written, correct, and never run — the failure this whole
      // suite exists because of.
      'packages/fundamentals/charts/',
      'docs/vite-plugins/',
      'docs/vite.config.ts',
      'docs/content.config.ts',
      'e2e/docs.spec.ts',
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
    // `https()` in a real browser. The node-side suites prove the certificate
    // parses and Vite applies it; only a browser can say whether the page is a
    // secure context and the gated APIs are consequently DEFINED.
    name: 'https-dev',
    script: 'test:e2e:https-dev',
    triggers: ['packages/zero/zero/src/https', 'e2e/https-dev', 'e2e/fixtures/https-dev'],
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
    // Edge deploy artifacts (Deno, Netlify Edge on Deno, Vercel Edge Runtime,
    // Cloudflare workerd) RUN in their real runtimes — the classes a
    // Node-invoked adapter unit test cannot see (no filesystem, no `process`,
    // no `import.meta.url`, platform routing). Installs the pinned runtimes
    // itself (`scripts/edge-runtimes/tools.ts`), outside the lockfile.
    name: 'edge-runtimes',
    script: 'test:e2e:edge-runtimes',
    triggers: [
      ...ROUTER_CORE,
      'examples/edge-runtimes/',
      'scripts/edge-runtimes/',
      'e2e/edge-runtimes.spec.ts',
    ],
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
    // The broad toolkit smoke: its screen mounts a component from most
    // fundamentals packages, so a fundamentals change can blank it.
    //
    // The tri-target trap makes the WEB half load-bearing: `examples/
    // native-tasks` is SHARED source, compiled by PMTC for iOS/Android
    // and BUNDLED here. iOS and Android are gated in native-device.yml;
    // nothing gated web, so a shared-source change proven on a simulator
    // and an emulator could still fail to resolve or render in a browser.
    name: 'native-tasks-web',
    script: 'test:e2e:native-tasks-web',
    triggers: [
      ...RENDER_CORE,
      'packages/core/primitives/',
      'packages/fundamentals/',
      'examples/native-tasks/',
      'examples/native-tasks-web/',
      'e2e/native-tasks-web',
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
  {
    // The Atlas workbench UI (6.4k LOC) is coverage-EXCLUDED in the package's
    // vitest config with the rationale "what actually proves them is the
    // real-Chromium e2e suite" — so these two suites running in CI is what
    // makes that exclusion honest. Before they were wired in, the whole UI
    // shipped ungated: 38 specs existed, passed locally, and gated nothing.
    name: 'atlas-workshop',
    script: 'test:e2e:atlas',
    triggers: [
      ...RENDER_CORE,
      'packages/tools/atlas/',
      'packages/ui-system/',
      'examples/atlas-workshop/',
      'e2e/atlas-workshop.spec.ts',
    ],
  },
  {
    // `atlas dev` — the real CLI booting the workbench against the workshop:
    // discovery (static + rocketstyle), the generated catalog, the RPC
    // channel, the Reactivity Lens, URL state.
    name: 'atlas-dev',
    script: 'test:e2e:atlas-dev',
    triggers: [
      ...RENDER_CORE,
      'packages/tools/atlas/',
      'packages/tools/vite-plugin/',
      'packages/core/compiler/',
      'examples/atlas-workshop/',
      'e2e/atlas-dev.spec.ts',
    ],
  },
  {
    // `atlas build` — the STATIC site on a plain file server. The only gate
    // that can catch an unbaked node-answered panel: a built site has no
    // server, so the Docs source block and the Reactivity Lens work there only
    // if the build embedded their answers in the page.
    name: 'atlas-build',
    script: 'test:e2e:atlas-build',
    triggers: [
      ...RENDER_CORE,
      'packages/tools/atlas/',
      'packages/tools/vite-plugin/',
      'packages/core/compiler/',
      'examples/atlas-workshop/',
      'e2e/atlas-build.spec.ts',
    ],
  },
  {
    // `atlas build` over the REAL library — the command `docs.yml` runs for
    // pyreon.dev/atlas. Every component page must show the component: the
    // workshop's seven components never exercised an overlay, a render-prop
    // base, a `<table>` or a part, and the deployed site rendered 24 of 108 as
    // nothing while every other gate stayed green.
    name: 'atlas-ui-components',
    script: 'test:e2e:atlas-ui-components',
    triggers: [
      ...RENDER_CORE,
      'packages/tools/atlas/',
      'packages/tools/vite-plugin/',
      'packages/core/compiler/',
      'packages/ui/',
      'packages/ui-system/',
      'e2e/atlas-ui-components.spec.ts',
    ],
  },
  {
    // `atlas verify-browser` — the browser half of the verify pipeline as a
    // subprocess: real coverage on the page's own reactivity instance +
    // baseline-create/compare snapshots, merged back into the catalog.
    name: 'atlas-verify-browser',
    script: 'test:e2e:atlas-verify',
    triggers: [
      ...RENDER_CORE,
      'packages/tools/atlas/',
      'packages/tools/vite-plugin/',
      'packages/core/compiler/',
      'examples/atlas-workshop/',
      'e2e/atlas-verify-browser.spec.ts',
    ],
  },
  {
    // `loom dev` — the dependency observatory served by the real CLI over
    // the real monorepo: scan, graph/matrix/cycles/impact/table views,
    // selection, search, theming.
    name: 'loom-dev',
    script: 'test:e2e:loom',
    triggers: [
      ...RENDER_CORE,
      'packages/tools/loom/',
      'packages/tools/vite-plugin/',
      'packages/core/compiler/',
      'e2e/loom-dev.spec.ts',
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
/** Budget data read only by the budget gates — see `forcesFullRun`. */
export const BUDGET_DATA_FILES: ReadonlySet<string> = new Set([
  'scripts/bundle-budgets.json',
  'scripts/import-budgets.json',
])

export function forcesFullRun(path: string, e2eScripts?: ReadonlySet<string>): boolean {
  if (path === 'bun.lock' || path === 'package.json') return true
  if (/^tsconfig.*\.json$/.test(path)) return true
  // Every root `vitest.*.ts` (see `affected.ts:isRootFile` — the two names
  // this used to list no longer exist) and the pinned toolchain.
  if (/^vitest\.[^/]*\.ts$/.test(path)) return true
  if (path === '.bun-version') return true
  // Only ci.yml defines how the e2e suites run (matrix, setup, env). Another
  // workflow — codeql, release, scorecard — cannot change what a suite does;
  // a dependabot action bump touching only those used to run all 31 suites.
  if (path === '.github/workflows/ci.yml') return true
  if (path.startsWith('.github/actions/')) return true
  // The size-budget DATA files are the one exception under `scripts/`: no e2e
  // spec, e2e config, example build, or served page reads them — only the
  // budget gates do. Measured 2026-09-23 over one week of PRs: 83 of the 124
  // pushes that ran ALL 30 suites were forced by these two files ALONE
  // (parallel sessions bump budgets constantly), i.e. ~57% of all e2e
  // suite-runs. A budget file changing still runs whatever suites the PR's
  // OTHER files select, so this narrows only the "unknown blast radius" arm.
  if (BUDGET_DATA_FILES.has(path)) return false
  // With the derived reachable set (`e2eReachableScripts`), a `scripts/` file
  // forces the full run only when something an e2e suite executes can reach
  // it. Without it — unit tests, or a derivation that threw — every
  // `scripts/` file still forces it (the conservative default).
  if (path.startsWith('scripts/')) return e2eScripts ? e2eScripts.has(path) : true
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
  opts: { all?: boolean; e2eScripts?: ReadonlySet<string> | undefined } = {},
): Suite[] {
  if (opts.all) return SUITES
  if (changed === null) return SUITES // diff failed → safe full run
  if (changed.length === 0) return [] // nothing changed → green skip
  if (changed.some((f) => forcesFullRun(f, opts.e2eScripts))) return SUITES
  return SUITES.filter((s) =>
    changed.some((f) => s.triggers.some((t) => f.startsWith(t))),
  )
}

// ── Which `scripts/` files can an e2e suite reach? ─────────────────────────

/**
 * Every `scripts/` path the e2e machinery can execute or read, derived — not
 * listed — by following references out of the e2e entry points.
 *
 * Why: `scripts/` holds ~200 files, most of them CI gates and their data
 * (`check-*.ts`, the native emit golden file, …) that no e2e suite ever
 * touches. A blanket "any `scripts/` change runs every suite" made every native
 * PR — each of which updates that golden file — pay the full 31-suite
 * web e2e run. Measured 2026-11-02: 9 of 12 open PRs were forced to the full
 * set by a `scripts/` file outside this set. The per-file exemption for the
 * budget JSONs was the same fix applied to one name at a time.
 *
 * Roots: the e2e configs and specs, playwright configs, the root package's
 * e2e scripts, the example and docs apps' package scripts and Vite configs,
 * the shared setup action, and the `install` + `e2e-suite` job blocks of
 * ci.yml (the workflow itself forces a full run when it changes). From each
 * root and each reached script, a `scripts/…` path mention or a relative
 * import is followed transitively. Generous by construction: any mention,
 * including in a comment, counts as reachable — so a comment in a reachable
 * file must not spell out the path of a file it means to exclude.
 */
export function e2eReachableScripts(repoRoot: string): ReadonlySet<string> {
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const rel = (abs: string): string => path.relative(repoRoot, abs).split(path.sep).join('/')
  const exists = (p: string): boolean => fs.existsSync(path.join(repoRoot, p))
  const isDir = (p: string): boolean => {
    try {
      return fs.statSync(path.join(repoRoot, p)).isDirectory()
    } catch {
      return false
    }
  }
  const walk = (dir: string, out: string[]): void => {
    const abs = path.join(repoRoot, dir)
    if (!fs.existsSync(abs)) return
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) walk(p, out)
      else out.push(p)
    }
  }
  const read = (p: string): string => {
    try {
      return fs.readFileSync(path.join(repoRoot, p), 'utf8')
    } catch {
      return ''
    }
  }

  const roots: string[] = []
  walk('e2e-configs', roots)
  walk('e2e', roots)
  walk('.github/actions', roots)
  for (const f of fs.readdirSync(repoRoot)) if (/^playwright[^/]*\.config\.ts$/.test(f)) roots.push(f)
  const appDirs = ['docs', ...fs.readdirSync(path.join(repoRoot, 'examples')).map((d) => `examples/${d}`)]
  for (const d of appDirs) {
    if (!isDir(d)) continue
    for (const f of fs.readdirSync(path.join(repoRoot, d)))
      if (f === 'package.json' || f.startsWith('vite.config.')) roots.push(`${d}/${f}`)
  }

  const texts: string[] = roots.map(read)
  const pkg = JSON.parse(read('package.json') || '{}') as { scripts?: Record<string, string> }
  for (const [k, v] of Object.entries(pkg.scripts ?? {})) if (/e2e/.test(k)) texts.push(v)
  const ci = read('.github/workflows/ci.yml')
  for (const job of ['install', 'e2e-suite']) {
    const m = new RegExp(`\\n  ${job}:\\n([\\s\\S]*?)(?=\\n  [a-z0-9_-]+:\\n|$)`).exec(ci)
    if (!m) throw new Error(`ci.yml has no \`${job}\` job — update e2eReachableScripts`)
    texts.push(m[1]!)
  }

  const found = new Set<string>()
  const queue: string[] = []
  const enqueue = (f: string): void => {
    if (found.has(f)) return
    found.add(f)
    queue.push(f)
  }
  const add = (p: string): void => {
    const clean = p.replace(/\/+$/, '').replace(/[.,;:)]+$/, '')
    const candidates = [clean, `${clean}.ts`, `${clean}.mjs`, `${clean}.js`, `${clean}/index.ts`]
    for (const c of candidates) {
      if (!c.startsWith('scripts/')) continue
      if (isDir(c)) {
        const files: string[] = []
        walk(c, files)
        for (const f of files) enqueue(f)
        return
      }
      if (exists(c)) {
        enqueue(c)
        return
      }
    }
  }
  const scan = (text: string, from?: string): void => {
    for (const m of text.matchAll(/scripts\/[A-Za-z0-9_./-]+/g)) {
      // `../../scripts/x` and `./scripts/x` both name the root `scripts/x`.
      add(m[0])
    }
    if (!from) return
    for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      add(rel(path.resolve(path.join(repoRoot, path.dirname(from)), m[1]!)))
    }
  }
  for (const t of texts) scan(t)
  while (queue.length > 0) {
    const f = queue.shift()!
    if (/\.(ts|mts|mjs|js|sh)$/.test(f)) scan(read(f), f)
  }
  return found
}

// ── CLI ────────────────────────────────────────────────────────────────────

function main(): void {
  let base = 'origin/main'
  let all = false
  let list = false
  let scriptsFor: string | undefined
  for (const arg of process.argv.slice(2)) {
    if (arg === '--all') all = true
    else if (arg === '--list') list = true
    else if (arg.startsWith('--base=')) base = arg.slice('--base='.length)
    else if (arg.startsWith('--scripts-for=')) scriptsFor = arg.slice('--scripts-for='.length)
  }

  // `--scripts-for="a b c"` resolves a BATCH of suite names to the package
  // scripts that run them, one per line. The workflow batches by NAME (see
  // scripts/ci-batch.ts) and needs the scripts back; resolving here keeps this
  // file the single source of the name → script mapping rather than
  // duplicating it into YAML, where it would drift silently.
  if (scriptsFor !== undefined) {
    const wanted = scriptsFor.split(/\s+/).filter(Boolean)
    const byName = new Map(SUITES.map((s) => [s.name, s.script]))
    const missing = wanted.filter((n) => !byName.has(n))
    if (missing.length > 0) {
      console.error(`[e2e-affected] unknown suite(s): ${missing.join(', ')}`)
      process.exit(1)
    }
    console.log(wanted.map((n) => byName.get(n)!).join('\n'))
    return
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
      changed = gitChangedFilesZ(`${base}...HEAD`, { stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      changed = null // can't diff → selectSuites returns ALL (safe)
    }
  }

  let e2eScripts: ReadonlySet<string> | undefined
  try {
    e2eScripts = e2eReachableScripts(process.cwd())
  } catch (err) {
    // Derivation failed → every `scripts/` change forces the full run.
    console.error(`[e2e-affected] could not derive e2e-reachable scripts: ${String(err)}`)
  }
  const chosen = selectSuites(changed, { all, e2eScripts })

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
