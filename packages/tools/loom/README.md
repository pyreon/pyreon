# @pyreon/loom

**Monorepo dependency observatory** — reads your workspace the way an install tool does and turns its dependency fabric into data: the internal graph (depths, cycles, blast radius), the external version-usage map, and a detector-driven issue list with honest severities.

> Status: private / pre-release. API and findings vocabulary may still move.

## Commands

```bash
loom scan .        # analyze + report; writes loom-report.json; red exit on errors
loom scan . --json # the full report as machine-readable JSON
loom dev .         # the observatory UI — graph · matrix · cycles · impact · manifest
```

## What the scan detects

| Code | Severity | What it means |
| --- | --- | --- |
| `version-drift` | error (cross-major) / warning (same-major) / info (root-overridden) | one external dep declared with different ranges across packages |
| `internal-range` | error | a workspace member referenced by a bare semver (registry install waiting to happen) or a `workspace:` pin whose major no longer exists |
| `cycle` | error | a runtime import loop between workspace packages (dev edges deliberately excluded — shared test utilities legitimately "cycle") |
| `phantom-dep` | error (published) / warning (private) | shipping source imports a package the manifest never declares — hoisting luck |
| `prod-import-of-dev-dep` | warning (published) / info (private) | shipping source leans on a devDependency consumers won't have |
| `peer-mismatch` | warning | an internal peer range disagreeing with the workspace copy by a major |
| `unused-dep` | info | a declared dependency no source file imports — lexical evidence only, verify before removing |

`loom scan` exits non-zero on error findings (`--strict` includes warnings) — wire it into CI and the fabric gates itself.

## Honest limits

- The import scan is **lexical** (comments and template-literal contents stripped, specifier grammar validated) — an import mentioned in an ordinary-quoted string can still false-positive, which is why `unused-dep` stays `info` and every finding carries its file evidence.
- Loom reads **declared** truth (manifests + source), not installed state: no lockfile parsing, no registry calls. Outdated-vs-latest and duplicate-install analysis are explicitly future layers.
- Workspace globs support the shapes real repos use (`dir/*`, `dir/*/*`, `dir/**`, literals, negations, pnpm-workspace.yaml, object-form `workspaces`).

## The observatory (`loom dev`)

Five views over the same report: the layered **graph** (columns by resolution depth, cycle edges dashed red, hover-dimming), the **adjacency matrix**, **cycles** as actionable loop cards, **impact** (transitive dependents, ranked), and the **manifest** table. Plus a detail panel per package (metrics, depends-on / required-by, findings, resolution path), search (⌘K), keyboard navigation, and dark/light theming. Built entirely on the public Pyreon UI stack (rocketstyle on elements bases).

Vite + `@pyreon/vite-plugin` are optional peers: `loom scan` runs without them; `loom dev` names the install when missing.
