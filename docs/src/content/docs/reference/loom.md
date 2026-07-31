---
title: "Dependency Observatory — API Reference"
description: "Monorepo dependency observatory — workspace graph, version-sync drift, cycles, phantom deps, and blast radius, as data"
---

# @pyreon/loom — API Reference

> **Generated** from `loom`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [loom](/docs/loom).

Loom reads a workspace the way an install tool does — root workspace globs (npm/bun/yarn array + object forms, `packages/*/*`-style nesting, negations, pnpm-workspace.yaml) and every member manifest — and turns the dependency fabric into DATA: the internal graph (longest-path depths, RUNTIME cycles with dev edges deliberately excluded, transitive blast radius), the external version-usage map (every dep → every declared range → who declares it), and a detector-driven issue list with honest severities. `loom scan` writes `loom-report.json` and exits non-zero on error findings, so wiring it into CI gates the fabric; `loom dev` serves the five-view observatory UI over the same report. Loom reads DECLARED truth only — no lockfile parsing, no registry calls (outdated/duplicate-install analysis are documented future layers).

## Features

- Workspace discovery matching real repos: npm/bun/yarn `workspaces` (array + object forms), pnpm-workspace.yaml, segment-wise globs (`packages/*/*`, `**`, negations)
- Graph analysis split by edge SEMANTICS: runtime (dependencies + peers) drives cycles/depths/reach; dev edges tracked separately — shared test utilities never read as circular
- Seven detectors with honest severities: version-drift (peer-contract + strict-superset-containment aware), internal-range, cycle, phantom-dep, prod-import-of-dev-dep, peer-mismatch, unused-dep (info — lexical evidence, not proof)
- Severity respects reality: a private package has no consumers, so its phantom-dep is a warning and its dev-dep import is info
- Lexical import scan that strips comments + template-literal contents and validates specifier grammar — recipe catalogs carrying whole import lines as strings never false-positive
- Red exit contract: `loom scan` fails CI on error findings (`--strict` includes warnings); `loom-report.json` is the machine surface with stable codes + per-finding evidence
- The observatory (`loom dev`): layered graph, adjacency matrix, cycle cards, blast-radius ranking, manifest table + detail panel, ⌘K, keyboard nav, dark/light — on the public Pyreon UI stack; vite + @pyreon/vite-plugin optional peers

## Complete example

A full, end-to-end usage of the package:

```tsx
$ loom scan .
loom: 142 workspace package(s), 147 external dep(s), 681 internal edge(s), depth 8, 0 cycle(s).

WARNING · 8
  ▲ version-drift [happy-dom] — \`happy-dom\` is declared with 2 different ranges (^20.11.1 · ^20.0.0)
  ▲ version-drift [esbuild] — \`esbuild\` is declared with 2 different ranges (^0.25.0 · ^0.24.2)

INFO · 12
  · unused-dep [tslib] — \`@pyreon/charts\` declares \`tslib\` as a dependency but no source file imports it — lexical evidence only
  → loom-report.json

$ loom scan . --strict     # warnings gate too (red exit)
$ loom scan . --json       # the full report as machine-readable JSON
$ loom dev . --port=5230   # the observatory UI over the same report
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`loom scan`](#loom-scan) | function | Read the workspace, analyze the dependency fabric, and report. |
| [`loom dev`](#loom-dev) | function | The observatory: five views over the scan report — the layered dependency graph (columns by resolution depth, cycle edge |
| [`buildReport`](#buildreport) | function | The programmatic engine behind the CLI — scan the workspace, analyze the graph, run every detector, fold the stats. |

## API

### loom scan `function`

```ts
loom scan [dir] [--strict] [--json] [--no-imports] [--no-write]
```

Read the workspace, analyze the dependency fabric, and report. Discovery reads the same declarations an install tool reads; analysis splits edges by semantics (runtime vs dev); seven detectors emit findings with stable codes, honest severities (error gates, warning advises, info knows its own limits), and structured evidence (which files import the phantom, which packages declare which range). Writes `loom-report.json` next to the root manifest and EXITS NON-ZERO on error-severity findings — the CI contract. `--strict` reds on warnings too; `--no-imports` skips the lexical detectors (phantom/dev-dep/unused); `--json` prints the full report.

**Example**

```tsx
$ loom scan .
loom: 5 workspace package(s), 6 external dep(s), 4 internal edge(s), depth 2, 1 cycle(s).

ERROR · 3
  ✗ cycle [@fix/auth] — Runtime dependency cycle: @fix/auth → @fix/data → @fix/auth
  ✗ version-drift [left-pad] — declared with 2 different ranges (^1.0.0 · ^2.0.0) — the majors differ
  ✗ phantom-dep [undeclared-pkg] — \`@fix/app\` imports \`undeclared-pkg\` in shipping source but never declares it
```

**Common mistakes**

- Treating a dev-edge "cycle" as a bug — loom deliberately excludes devDependencies from cycle detection; monorepos legitimately share test utilities both ways, and a detector that cries wolf is a dead gate
- Reading `unused-dep` as a removal order — it is INFO with lexical evidence only; bins, plugin autoloads, and CSS imports load without an import statement
- Expecting outdated-vs-latest or duplicate-install findings — loom reads DECLARED truth; lockfile + registry layers are documented future work, not silently half-done
- Running against a subdirectory that is not the workspace ROOT — the scan throws loudly rather than reporting a clean empty workspace (an empty scan is never a pass)
- Wiring `--strict` into CI before triaging warnings — same-major drift findings are real but common; gate on errors first, ratchet warnings down, then tighten

**See also:** `loom dev`

---

### loom dev `function`

```ts
loom dev [dir] [--port=5230]
```

The observatory: five views over the scan report — the layered dependency graph (columns by resolution depth, cycle edges dashed + animated, hover dims unrelated nodes), the internal adjacency matrix (keyboard-reachable cells), cycle cards with break-the-loop advice, blast-radius ranking (transitive dependents, counted not guessed), and the manifest table — plus a detail panel per package (metrics, depends-on / required-by, findings, resolution path), ⌘K search, kind filters, and dark/light theming. The report endpoint re-scans per request, so a manifest edit + reload shows fresh truth. Vite + @pyreon/vite-plugin are OPTIONAL peers: `loom scan` works without them; `loom dev` names the install when missing.

**Example**

```tsx
$ loom dev . --port=5230
loom dev: 142 package(s) → http://localhost:5230/
```

**Common mistakes**

- Expecting the UI in a project without Vite — `loom dev` needs vite + @pyreon/vite-plugin (optional peers) and its error names the exact install; `loom scan` never needs them
- Reading graph depth as import distance — depth is LONGEST-path from the entry points (how far below the surface a package sits), hard-bounded at V−1; packages inside a cycle keep the depth their first visit found

**See also:** `loom scan`

---

### buildReport `function`

```ts
(rootDir: string, options?: { noImports?: boolean }) => LoomReport
```

The programmatic engine behind the CLI — scan the workspace, analyze the graph, run every detector, fold the stats. One entry point; the CLI, the dev server, and your own tooling all consume the same `LoomReport` (model + external usage + graph analysis + issues + stats). Pure Node with zero runtime dependencies — safe to call from build scripts and CI tooling.

**Example**

```tsx
import { buildReport } from '@pyreon/loom'

const report = buildReport('.')
report.stats            // { internal, external, edges, depth, cycles, errors, warnings, infos }
report.graph.cycles     // string[][] — each runtime loop in order
report.issues.filter((i) => i.severity === 'error')
```

**Common mistakes**

- Re-deriving your own truth from the model instead of reading `report.graph` / `report.issues` — the analysis is the contract; nothing downstream should recompute cycles or reach differently

**See also:** `loom scan`

---
