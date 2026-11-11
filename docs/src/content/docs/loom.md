---
title: Loom
description: The monorepo dependency observatory — workspace graph, version-sync drift, cycles, phantom deps, and blast radius, as data.
---

`@pyreon/loom` reads your workspace the way an install tool does and turns its dependency fabric into **data**: the internal graph (depths, cycles, blast radius), the external version-usage map, and a detector-driven issue list with honest severities. One scan, three consumers: your terminal, your CI, and the observatory UI.

<PackageBadge name="@pyreon/loom" href="/docs/loom" />

## Installation

```bash
pyreon add @pyreon/loom
```

Or with zero setup: `pyreon loom <cmd>` delegates to the project-local install.

## `loom scan` — the fabric as findings

```bash
pyreon loom scan .
# loom: 142 workspace package(s), 147 external dep(s), 681 internal edge(s), depth 8, 0 cycle(s).
#
# WARNING · 8
#   ▲ version-drift [happy-dom] — `happy-dom` is declared with 2 different ranges (^20.11.1 · ^20.0.0)
#   …
#   → loom-report.json
```

It reads the same declarations an install tool reads — root `workspaces` globs (npm/bun/yarn array + object forms, `packages/*/*`-style nesting, negations) plus `pnpm-workspace.yaml` — and analyzes:

| Code | Severity | What it means |
| --- | --- | --- |
| `version-drift` | error / warning / info | one external dep declared with different ranges. Cross-major = error; same-major = warning; root-overridden = info. **Peer ranges are contracts, not pins** (excluded from the grouping), and a range that's a strict superset of the rest (`>=5 <7` ⊇ `^6.0.3`) reads as policy → info |
| `internal-range` | error | a workspace member referenced by a bare semver (a registry install waiting to happen) or a `workspace:` pin whose major no longer exists |
| `cycle` | error | a **runtime** import loop between workspace packages — dev edges are deliberately excluded, because monorepos legitimately share test utilities both ways |
| `phantom-dep` | error (published) / warning (private) | shipping source imports a package the manifest never declares — hoisting luck that explodes under isolated stores |
| `prod-import-of-dev-dep` | warning (published) / info (private) | shipping source leans on a devDependency consumers won't have |
| `peer-mismatch` | warning | an internal peer range disagreeing with the workspace copy by a major |
| `unused-dep` | info | a declared dependency no source file imports — lexical evidence only; verify before removing |

`loom scan` **exits non-zero on error findings** (`--strict` includes warnings) — wire it into CI and the fabric gates itself. `--json` prints the full report to stdout and *only* that — the write notice goes to stderr, so `loom scan . --json > report.json` is a valid JSON file; `--no-imports` skips the lexical detectors; `--no-write` skips the report file.

A scan that finds **no workspace packages fails** rather than reporting a clean fabric — it measured nothing. Run it from inside a member package and the error names the workspace root to scan instead. Unknown or misspelled flags and config keys are errors with a did-you-mean, never silently ignored; options take a value as `--out site` or `--out=site`.

## `loom dev` — the observatory

```bash
pyreon loom dev .            # http://localhost:5230, or the next free port
pyreon loom dev . --port 4000  # exactly this port, or fail
```

Five views over the same report, in the Pyreon tool-app layout: a top bar (workspace, view switch, error / warning / info counts and the exit code `loom scan` would return), the package list grouped by resolution depth (a severity glyph and the blast-radius count on every row; the filter field narrows it), the active view, a detail rail, and a status bar with the scan counts and the `loom.ignore` suppressions in force.

- **Graph** — internal packages in one column per resolution depth (ENTRY → DEPTH *n*). Selecting a package fills it and lights its blast radius: every transitive dependent and the edges a change travels along. Cycle edges dashed red; dev edges are an opt-in dotted layer; hover dims everything but a package's direct neighbours.
- **Matrix** — external version usage: rows are external dependencies, columns the packages declaring them, cells the declared range. On a drifting dependency the declarations that disagree with the usual range are coloured — red across majors, amber within one; phantom imports and unused declarations are marked in place. "drift only" (on by default when there is drift) narrows the rows to the `version-drift` findings. The **imports** chip switches to the internal adjacency matrix: rows depend on columns, foundations first, so a mark above the diagonal is a back-edge.
- **Cycles** — each runtime loop as a card: the ring of packages (clickable) and how to open it; an acyclic workspace says what was checked.
- **Impact** — the selected package's blast radius, then every package ranked by reach.
- **Manifest** — an excerpt of this scan's `loom-report.json` (counts, the gate, the first findings) with a download of the full report, and every node as a table row with its findings and status.

The detail rail shows deps · dependents · blast, the findings, what the package depends on, its blast radius, the resolution path from the nearest entry point, and the `loom.ignore` entry that would suppress its first finding (an external dependency shows its declared ranges and who declares each). With nothing selected (how it opens) the rail shows the workspace overview: counts, findings by severity, cycles, the five widest blast radii and the gate. Platform packages (only an optionalDependency of one parent, e.g. `@pyreon/compiler-<os>-<arch>`) are ranked under their parent, not beside it. ⌘K searches packages, findings, versions and edges; ↑↓ walks the list (also from the filter field); the graph has one tab stop, the selected box, and Enter selects. Below 860 px the list becomes a drawer, below 760 px the rail too (Escape closes them).

The theme is the shared Pyreon preference — `localStorage['pyreon-theme']` (`'light' | 'dark'`), otherwise `prefers-color-scheme` — so choosing light on the docs site, in Atlas or in Loom applies to all three, live across tabs. Loom's own key from before (`loom:theme`) is still read as a fallback. The report endpoint re-scans per request — edit a manifest, reload, see fresh truth; while it scans the page says so, and a rescan that fails (a manifest mid-edit) shows the reason with a reload button.

Vite + `@pyreon/vite-plugin` are **optional peers**: `loom scan` runs without them; `loom dev` names the install when missing. The dev server reports with the same settings `loom scan` resolves (config file + `package.json` key), and keeps its own dependency cache in `node_modules/.cache/loom-vite`, so it never invalidates your app's Vite cache.

## `loom build` — the observatory as a static site

```bash
pyreon loom build . --out=loom-dist --base=/deps/
# loom: 142 package(s) → loom-dist
```

Prerenders the same five views to plain files — one page per view at its own URL (`/`, `/matrix`, `/cycles`, `/impact`, `/manifests`), so you can link someone straight to the cycles view. The scan is baked in once, so the output works from any static host or opened straight from `file://`. `--out` defaults to `loom-dist`; `--base` sets the public path for a subdirectory deploy; `--no-imports` behaves as it does for `scan`. The build is a snapshot — re-run it after dependency changes to refresh.

`loom build` needs `vite`, `@pyreon/vite-plugin` **and** `@pyreon/zero` as dev dependencies (the site is a zero SSG app); when they are missing it names the exact install command. `loom scan` needs none of them.

## Configuration

Two homes, one shape. The root `package.json`'s `loom` key, or a `loom` section in the ecosystem-wide `pyreon.config.*`:

```ts
// pyreon.config.ts
import { defineConfig } from '@pyreon/config'

export default defineConfig({
  loom: {
    // Package-relative globs that are NOT shipping source.
    devPaths: ['src/manifest.ts', '**/*.gen.ts'],
    // Suppressions. `reason` is mandatory and is shown in the report.
    ignore: [{ dep: 'sharp', code: 'unused-dep', reason: 'loaded by the image plugin at runtime' }],
    // Exit non-zero on warnings without passing --strict at every call site.
    strict: true,
    // Adopt incrementally: raise a code once it is clean, lower one while it burns down.
    severity: { 'unused-dep': 'info', 'phantom-dep': 'error' },
  },
})
```

The manifest wins **per key**, so a project mid-migration can move one setting at a time without the manifest silently blanking everything it does not mention. Both homes go through one validator — two would let one home accept what the other rejects, which is a config that works until you move it.

### `devPaths` — what is not shipping source

Loom classifies imports by surface. Shipping source drives `phantom-dep` and `prod-import-of-dev-dep`, both statements about what a **consumer** receives; the dev surface only proves a dependency is used. Loom infers that surface from path shape — tests, configs, scripts — which covers the common cases and cannot cover a repo's own build conventions.

This monorepo is the worked example. Every package's `src/manifest.ts` imports `@pyreon/manifest` at runtime to feed the docs generator, and the publish script strips `src/` from every tarball, so no consumer can ever need it. Loom was right by its own rules and wrong about the world: **55 of the repo's 60 non-example gating warnings were that one convention**, stated nowhere a tool could read.

Declaring `devPaths: ['src/manifest.ts']` took it from **73 gating warnings to 18**, with all 166 `unused-dep` findings intact — a declared path still counts as **used**, it just stops counting as **shipped**.

### `severity` — adopting loom on an existing repo

Raise a code to `error` once it is clean, lower one to `info` while it is being burned down. Severity is applied **before** suppressions, so an explicit `ignore` still has the last word — a finding you deliberately waved through is not resurrected by a blanket raise. An unknown code is rejected with the list of real ones rather than quietly doing nothing.

### When a config file cannot be read

A `pyreon.config.*` that exists but fails to load is a **named error**, never a silent skip. `loom scan` has no bundler — vite is an optional peer used only by `loom dev` — so a TypeScript config needs a runtime that strips types (Bun, or Node ≥ 23.6). On an older Node, write `pyreon.config.mjs` or use the `package.json` key; the message says exactly that.

## Honest limits

- The import scan is **lexical** — comments and template-literal contents are stripped and specifier grammar is validated (an import line inside a recipe string doesn't count), but an import mentioned in an ordinary-quoted string can still false-positive. That's why `unused-dep` stays `info` and every finding carries its file evidence.
- Loom reads **declared** truth: no lockfile parsing, no registry calls. Outdated-vs-latest, duplicate-install analysis, and advisory feeds are explicitly future layers, not quietly half-done.
- Depth is longest-path from the entry points, hard-bounded at V−1 — packages inside a cycle keep the depth their first visit found.

## CI wiring

```yaml
- run: bunx loom scan .           # red exit on error findings
- run: bunx loom scan . --strict  # warnings gate too
```

The machine surface is `loom-report.json` — stable issue codes, structured evidence per finding, and the full model (packages, edges, depths, reach) for your own tooling.

It is written **next to the root manifest** — the workspace root, not a `dist/` or a temp dir — because that is where a CI step and your own tooling look for it without being told. It is a generated artifact, regenerated on every scan, so **gitignore it**: on a large monorepo it is hundreds of kilobytes, and running the gate above then `git add .` is enough to commit it by accident. Use `--no-write` when you only want the exit code (that is what `pyreon doctor`'s `dependency-fabric` gate does — auditing a repo must not leave a file in it), or `--json` to send the report to stdout instead.
