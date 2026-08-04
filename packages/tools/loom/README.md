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
| `phantom-dep` | error (published) / warning (private) | shipping source imports a package at RUNTIME that the manifest never declares — hoisting luck |
| `phantom-type-dep` | info | a `import type` / `.d.ts` import of an undeclared package — erased at build, so consumers are fine, but typecheck rides on hoisting |
| `prod-import-of-dev-dep` | warning (published) / info (private) | shipping source leans at RUNTIME on a devDependency consumers won't have |
| `peer-mismatch` | warning | an internal peer range disagreeing with the workspace copy by a major |
| `unused-dep` | info | a declared dependency no source file imports — lexical evidence only, verify before removing |

`loom scan` exits non-zero on error findings (`--strict` includes warnings) — wire it into CI and the fabric gates itself.

## Honest limits

- The import scan is **lexical** (comments and template-literal contents stripped, specifier grammar validated) — an import mentioned in an ordinary-quoted string can still false-positive, which is why `unused-dep` stays `info` and every finding carries its file evidence.
- Type-only detection is **statement-level**: `import type` / `export type` (multi-line included) and every import inside a `.d.ts`. An INLINE modifier — `import { type A, b } from 'x'` — is treated as a runtime import, because it is one, and under `verbatimModuleSyntax` even `import { type A } from 'x'` still emits the statement.
- tsconfig aliases are read from the package's own `tsconfig.json` plus the workspace root's, following one **relative** `extends` hop. An alias declared only through a chain that leaves the repo (a base config in `node_modules`) is not seen; the cost is a possible `phantom-dep` on that alias, never a wrong graph.
- `loom.devPaths` in the root manifest declares package-relative globs that are **not shipping source** — build-time codegen, manifest files, generators. Loom infers the dev surface from path shape (tests, configs, scripts), which cannot cover a repo's own build conventions: this monorepo's `src/manifest.ts` files import `@pyreon/manifest` at runtime to feed gen-docs, and `scripts/publish.ts` strips `src/` from every tarball, so no consumer can ever need it. Declaring `["src/manifest.ts"]` took this repo from 73 gating warnings to 18, with all 166 `unused-dep` findings intact — a declared path still counts as USED, it just stops counting as shipped.
- Loom reads **declared** truth (manifests + source), not installed state: no lockfile parsing, no registry calls. Outdated-vs-latest and duplicate-install analysis are explicitly future layers.
- Workspace globs support the shapes real repos use (`dir/*`, `dir/*/*`, `dir/**`, literals, negations, pnpm-workspace.yaml, object-form `workspaces`).

## The observatory (`loom dev`)

Five views over the same report: the layered **graph** (columns by resolution depth, cycle edges dashed red, hover-dimming), the **adjacency matrix**, **cycles** as actionable loop cards, **impact** (transitive dependents, ranked), and the **manifest** table. Plus a detail panel per package (metrics, depends-on / required-by, findings, resolution path), search (⌘K), keyboard navigation, and dark/light theming. Built entirely on the public Pyreon UI stack (rocketstyle on elements bases).

Vite + `@pyreon/vite-plugin` are optional peers: `loom scan` runs without them; `loom dev` names the install when missing.
