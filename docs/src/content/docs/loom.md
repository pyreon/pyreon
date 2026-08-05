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

## `loom dev` — the observatory

```bash
pyreon loom dev . --port=5230
```

Five views over the same report:

- **Graph** — layered by resolution depth (ENTRY → DEPTH *n*), curved edges, cycle edges dashed red and animated, hover dims unrelated nodes.
- **Matrix** — the internal adjacency block; rows depend on columns, cycle back-edges in red, every cell keyboard-reachable.
- **Cycles** — each runtime loop as a card: the import chain as clickable chips, severity by length, break-the-loop advice.
- **Impact** — blast radius, counted not guessed: transitive dependents per package, ranked.
- **Manifest** — every node as a data row with per-package finding counts and a status badge.

Plus a detail panel per package (metrics, depends-on / required-by, findings, resolution path from the nearest entry point), ⌘K search, kind filters, ↑↓ navigation, and dark/light theming. The report endpoint re-scans per request — edit a manifest, reload, see fresh truth.

Vite + `@pyreon/vite-plugin` are **optional peers**: `loom scan` runs without them; `loom dev` names the install when missing.

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
