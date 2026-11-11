import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/loom',
  title: 'Dependency Observatory',
  tagline:
    'Monorepo dependency observatory — workspace graph, version-sync drift, cycles, phantom deps, and blast radius, as data',
  description:
    'Loom reads a workspace the way an install tool does — root workspace globs (npm/bun/yarn array + object forms, `packages/*/*`-style nesting, negations, pnpm-workspace.yaml) and every member manifest — and turns the dependency fabric into DATA: the internal graph (longest-path depths, RUNTIME cycles with dev edges deliberately excluded, transitive blast radius), the external version-usage map (every dep → every declared range → who declares it), and a detector-driven issue list with honest severities. `loom scan` writes `loom-report.json` and exits non-zero on error findings, so wiring it into CI gates the fabric; `loom dev` serves the five-view observatory UI over the same report. Loom reads DECLARED truth only — no lockfile parsing, no registry calls (outdated/duplicate-install analysis are documented future layers).',
  category: 'universal',
  multiplatform: {
    tier: 'web-only',
    rationale:
      'the dependency observatory — dev tooling, not app runtime',
  },
  features: [
    'Workspace discovery matching real repos: npm/bun/yarn `workspaces` (array + object forms), pnpm-workspace.yaml, segment-wise globs (`packages/*/*`, `**`, negations)',
    'Graph analysis split by edge SEMANTICS: runtime (dependencies + peers) drives cycles/depths/reach; dev edges tracked separately — shared test utilities never read as circular',
    'Eight detectors with honest severities: version-drift (peer-contract + strict-superset-containment aware), internal-range, cycle, phantom-dep (+ phantom-type-dep), prod-import-of-dev-dep, peer-mismatch, unused-dep (info — lexical evidence, not proof)',
    'Severity respects reality: a private package has no consumers, so its phantom-dep is a warning and its dev-dep import is info',
    'TYPE-AWARE import scan: `import type` / `export type` (multi-line included) and everything in a `.d.ts` are tracked separately from runtime imports — importing types from a devDependency is correct code, so it is never reported, while an undeclared type-only import surfaces as info-level `phantom-type-dep` rather than a runtime phantom',
    'Configured from the root `package.json`\'s `loom` key OR a `loom` section in the ecosystem-wide `pyreon.config.*` — same shape, manifest wins per key; carries devPaths, ignore (reason mandatory), strict, and per-code severity overrides so a repo can adopt loom incrementally. A config file that exists but cannot load is a NAMED error, never a silent skip',
    '`loom.devPaths` in the root manifest declares what is NOT shipping source (build-time codegen, manifest files) — loom infers the dev surface from path shape, which cannot know a repo strips `src/` at publish; on this monorepo one entry takes 73 gating warnings to 18 with every `unused-dep` intact',
    'tsconfig `paths` aware: `~/*`, `@app/*` and other internal aliases are read from the package + root tsconfig (JSONC, one `extends` hop) so they never scan as phantom packages',
    'Lexical import scan that strips comments + template-literal contents and validates specifier grammar — recipe catalogs carrying whole import lines as strings never false-positive',
    'Red exit contract: `loom scan` fails CI on error findings (`--strict` includes warnings); `loom-report.json` is the machine surface with stable codes + per-finding evidence',
    'The observatory (`loom dev`): layered graph, adjacency matrix, cycle cards, blast-radius ranking, manifest table + detail panel, ⌘K, keyboard nav, dark/light following the shared `pyreon-theme` preference — on the public Pyreon UI stack; vite + @pyreon/vite-plugin optional peers',
  ],
  longExample: `$ loom scan . --no-write
loom scan · . · 148 packages

  workspace packages  148
  external deps       227
  internal edges      858
  depth                11
  runtime cycles        0

  ℹ 305 info
  ℹ phantom-dep · \`@pyreon/example-react-compat\` imports \`react-dom\` in shipping source but never
     declares it — resolvable only through hoisting luck (ignored: \`@pyreon/vite-plugin\` with
     compat:'react' ALIASES react-dom (and react-dom/client) to @pyreon/react-compat/dom. Installing
     the real react-dom would defeat the example, whose entire point is that React-shaped code runs
     with no React present.)
     ↳ examples/react-compat/src/main.tsx
  ℹ phantom-type-dep · \`@pyreon/create-zero\` imports \`@pyreon/server\` type-only but never declares
     it — erased at runtime, so consumers are unaffected, but typecheck resolves it through hoisting
     luck; declare it in devDependencies
     ↳ packages/zero/create-zero/templates/app/src/routes/(admin)/dashboard.tsx
  …

✓ no errors or warnings · 305 info · 148 packages · 392 ms

$ loom scan . --strict     # warnings gate too (red exit)
$ loom scan . --json       # the full report as machine-readable JSON
$ loom dev . --port=5230   # the observatory UI over the same report`,
  api: [
    {
      name: 'loom scan',
      kind: 'function',
      signature: 'loom scan [dir] [--strict] [--json] [--no-imports] [--no-write]',
      summary:
        'Read the workspace, analyze the dependency fabric, and report. Discovery reads the same declarations an install tool reads; analysis splits edges by semantics (runtime vs dev); eight detectors emit findings with stable codes, honest severities (error gates, warning advises, info knows its own limits), and structured evidence (which files import the phantom, which packages declare which range). Writes `loom-report.json` next to the root manifest and EXITS NON-ZERO on error-severity findings — the CI contract. `--strict` reds on warnings too; `--no-imports` skips the lexical detectors (phantom/dev-dep/unused); `--json` prints the full report to stdout and ONLY that (the write notice moves to stderr), so `loom scan . --json > report.json` is a valid JSON file.',
      example: `$ loom scan .
loom scan · . · 5 packages

  workspace packages  5
  external deps       5
  internal edges      5
  depth               4
  runtime cycles      1

  ℹ 8 info
  ℹ unused-dep · \`@fix/app\` declares \`left-pad\` as a dependency but no source file imports it —
     lexical evidence only (bins/plugins/CSS load without an import statement); verify before
     removing
     ↳ packages/app/package.json
  ℹ unused-dep · \`@fix/app\` declares \`chalk\` as a dependency but no source file imports it — lexical
     evidence only (bins/plugins/CSS load without an import statement); verify before removing
     ↳ packages/app/package.json
  ℹ unused-dep · \`@fix/app\` declares \`pinned-pkg\` as a dependency but no source file imports it —
     lexical evidence only (bins/plugins/CSS load without an import statement); verify before
     removing
     ↳ packages/app/package.json
  ℹ unused-dep · \`@fix/util\` declares \`left-pad\` as a dependency but no source file imports it —
     lexical evidence only (bins/plugins/CSS load without an import statement); verify before
     removing
     ↳ packages/util/package.json
  ℹ unused-dep · \`@fix/util\` declares \`chalk\` as a dependency but no source file imports it —
     lexical evidence only (bins/plugins/CSS load without an import statement); verify before
     removing
     ↳ packages/util/package.json
  ℹ unused-dep · \`@fix/util\` declares \`never-imported\` as a dependency but no source file imports it
     — lexical evidence only (bins/plugins/CSS load without an import statement); verify before
     removing
     ↳ packages/util/package.json
  ℹ unused-dep · \`@fix/util\` declares \`pinned-pkg\` as a dependency but no source file imports it —
     lexical evidence only (bins/plugins/CSS load without an import statement); verify before
     removing
     ↳ packages/util/package.json
  ℹ version-drift · \`pinned-pkg\` is declared with 2 different ranges (^2.0.0 · ^3.0.0) — a root
     override pins it to 3.0.0, so installs agree, but the declarations still lie
     ↳ packages/app/package.json (^2.0.0)
     ↳ packages/util/package.json (^3.0.0)

  ! 3 warnings
  ! peer-mismatch · \`@fix/plugin\` peer-requires \`@fix/util\` at \`^9.0.0\` but the workspace ships
     1.0.0 — the peer contract and the local reality disagree by a major
     ↳ packages/plugin/package.json
  ! prod-import-of-dev-dep · \`@fix/app\` imports \`dev-only-pkg\` in shipping source but declares it
     only in devDependencies — consumers won't have it installed
     ↳ packages/app/src/index.ts
  ! version-drift · \`chalk\` is declared with 2 different ranges (^5.0.0 · ^5.2.0)
     ↳ packages/app/package.json (^5.0.0)
     ↳ packages/util/package.json (^5.2.0)

  ✗ 5 errors
  ✗ cycle · Runtime dependency cycle: @fix/auth → @fix/data → @fix/auth — imports resolve back to
     their origin, which blocks layering and can break module initialisation order
     ↳ packages/auth/package.json
  ✗ internal-range · \`@fix/app\` declares workspace member \`@fix/util\` as \`1.0.0\` (not \`workspace:\`)
     — a version slip silently installs the REGISTRY copy instead of linking the workspace
     ↳ packages/app/package.json
  ✗ internal-range · \`@fix/plugin\` declares workspace member \`@fix/util\` as \`^9.0.0\` (not
     \`workspace:\`) — a version slip silently installs the REGISTRY copy instead of linking the
     workspace
     ↳ packages/plugin/package.json
  ✗ phantom-dep · \`@fix/app\` imports \`undeclared-pkg\` in shipping source but never declares it —
     resolvable only through hoisting luck
     ↳ packages/app/src/index.ts
  ✗ version-drift · \`left-pad\` is declared with 2 different ranges (^1.0.0 · ^2.0.0) — the majors
     differ, so packages are building against different APIs
     ↳ packages/app/package.json (^1.0.0)
     ↳ packages/util/package.json (^2.0.0)

✗ 5 errors, 3 warnings, 8 info · 5 packages · 3 ms`,
      mistakes: [
        'Treating a dev-edge "cycle" as a bug — loom deliberately excludes devDependencies from cycle detection; monorepos legitimately share test utilities both ways, and a detector that cries wolf is a dead gate',
        'Reading `unused-dep` as a removal order — it is INFO with lexical evidence only; bins, plugin autoloads, and CSS imports load without an import statement',
        'Expecting outdated-vs-latest or duplicate-install findings — loom reads DECLARED truth; lockfile + registry layers are documented future work, not silently half-done',
        'Running against a subdirectory that is not the workspace ROOT — the scan throws loudly rather than reporting a clean empty workspace (an empty scan is never a pass)',
        'Wiring `--strict` into CI before triaging warnings — same-major drift findings are real but common; gate on errors first, ratchet warnings down, then tighten',
      ],
      seeAlso: ['loom dev'],
    },
    {
      name: 'loom dev',
      kind: 'function',
      signature: 'loom dev [dir] [--port=5230]',
      summary:
        'The observatory: five views over the scan report — the layered dependency graph (columns by resolution depth, cycle edges dashed + animated, hover dims unrelated nodes), the internal adjacency matrix (keyboard-reachable cells), cycle cards with break-the-loop advice, blast-radius ranking (transitive dependents, counted not guessed), and the manifest table — plus a detail panel per package (metrics, depends-on / required-by, findings, resolution path), ⌘K search, kind filters, and dark/light theming. The report endpoint re-scans per request, so a manifest edit + reload shows fresh truth. Vite + @pyreon/vite-plugin are OPTIONAL peers: `loom scan` works without them; `loom dev` names the install when missing.',
      example: `$ loom dev . --port=5230
loom dev: 142 package(s) → http://localhost:5230/`,
      mistakes: [
        'Expecting the UI in a project without Vite — `loom dev` needs vite + @pyreon/vite-plugin (optional peers) and its error names the exact install; `loom scan` never needs them',
        'Reading graph depth as import distance — depth is LONGEST-path from the entry points (how far below the surface a package sits), hard-bounded at V−1; packages inside a cycle keep the depth their first visit found',
      ],
      seeAlso: ['loom scan'],
    },
    {
      name: 'loom build',
      kind: 'function',
      signature: 'loom build [dir] [--out=<dir>] [--base=<path>]',
      summary:
        'Prerenders the observatory to a STANDALONE STATIC SITE — one prerendered page per view (graph / matrix / cycles / impact / manifest table), so a specific view has its own shareable URL instead of living behind a client-side signal. Output goes to `<dir>/loom-dist` by default (`--out=<dir>` to change it); `--base=<path>` sets the public base path for a subdirectory deploy. Needs `vite` + `@pyreon/vite-plugin` + `@pyreon/zero` as dev dependencies — `loom scan` needs NONE of them, so a CI gate that only runs `scan` is unaffected. The five views + the scan report are baked into the build so the output also works opened directly from `file://`, with no server.',
      example: `$ loom build . --out=dist/observatory
loom: 142 package(s) → dist/observatory`,
      mistakes: [
        'Running `loom build` in a project without Vite installed — it names the exact install (`vite @pyreon/vite-plugin @pyreon/zero`) rather than failing with a bare module-resolution error',
        'Expecting the static build to re-scan on reload like `loom dev` does — it is a SNAPSHOT of the workspace at build time; re-run `loom build` after dependency changes to refresh it',
      ],
      seeAlso: ['loom dev', 'loom scan'],
    },
    {
      name: 'buildReport',
      kind: 'function',
      signature: '(rootDir: string, options?: { noImports?: boolean }) => LoomReport',
      summary:
        'The programmatic engine behind the CLI — scan the workspace, analyze the graph, run every detector, fold the stats. One entry point; the CLI, the dev server, and your own tooling all consume the same `LoomReport` (model + external usage + graph analysis + issues + stats). Pure Node: its engine imports only `@pyreon/config` (to read `pyreon.config.ts`) — safe to call from build scripts and CI tooling.',
      example: `import { buildReport } from '@pyreon/loom'

const report = buildReport('.')
report.stats            // { internal, external, edges, depth, cycles, errors, warnings, infos }
report.graph.cycles     // string[][] — each runtime loop in order
report.issues.filter((i) => i.severity === 'error')`,
      mistakes: [
        'Re-deriving your own truth from the model instead of reading `report.graph` / `report.issues` — the analysis is the contract; nothing downstream should recompute cycles or reach differently',
      ],
      seeAlso: ['loom scan'],
    },
  ],
})
