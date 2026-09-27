# @pyreon/cli

The `pyreon` developer-tool binary — anti-pattern scanning, Plain-Mode readiness/codemod, package install recipes, project scaffolding, MCP/Atlas/Loom/Lathe front doors, project health audit, AI context generation, environment + version-skew check, dependency alignment, and linting.

`@pyreon/cli` ships the `pyreon` command. **`pyreon check`** is the fast, file-scoped anti-pattern scan — it runs the compiler's static detectors over git-changed files (or explicit paths) and prints each Pyreon/React anti-pattern with its inline fix, exiting non-zero so it doubles as a pre-commit / CI gate (`--fix` applies the mechanically-safe fixes in place). **`pyreon plain`** is a Plain-Mode readiness report (per-file convertibility + a declined-shape histogram) and, with `--write`, the classic → plain codemod. **`pyreon add <pkg...>`** installs one or more `@pyreon/*` packages — auto-detecting the project's package manager from the lockfile — and prints a tailored, verified setup recipe for each. **`pyreon new [name] [--native]`** scaffolds a new project (a thin delegator to `@pyreon/create-zero` / `@pyreon/create-multiplatform`). **`pyreon mcp`** / **`pyreon atlas`** / **`pyreon loom`** / **`pyreon lathe`** are thin, dependency-free delegators to the MCP server, the Atlas component workbench, the Loom dependency observatory, and the Lathe spec-to-client generator — a single front door instead of a separately-remembered `npx @pyreon/X`. The flagship subcommand is **`pyreon doctor`** — a single entry point that runs every gate Pyreon enforces (15 gates: lint rules, anti-pattern detection, distribution hygiene, doc-claim sync, island/SSG/content/native audits, dependency-fabric health, memory-leak heuristics, type-surface audit, bundle budgets) in parallel and produces a 0-100 health score with a per-category breakdown. **`pyreon context`** writes a `.pyreon/context.json` snapshot of the project's routes, components, and islands for AI coding assistants. **`pyreon info`** reports the environment and every installed `@pyreon/*` version, flagging version skew before it trips the duplicate-instance guard; **`pyreon upgrade`** is the fix — it aligns every `@pyreon/*` dependency to one version. **`pyreon lint`** is a thin front door to `@pyreon/lint` that forwards every `pyreon-lint` flag. Output renders with brand-mapped ANSI colors on a TTY (`NO_COLOR` / `FORCE_COLOR` honored), JSON for tooling, and GitHub Actions annotations for inline PR review.

## Install

```bash
bun add -D @pyreon/cli
```

`@pyreon/cli` declares `typescript` as a peer dependency (`>=5.0.0`) because the audit gates lean on TypeScript's compiler API for AST analysis. It works in any project — the gates that target Pyreon-specific surfaces (SSG conventions, islands, doc claims) skip gracefully when the project isn't a Pyreon repo.

## `pyreon check`

Fast, file-scoped Pyreon/React anti-pattern scan — the terminal-native twin of the MCP `validate` tool. Runs `detectPyreonPatterns` ("using Pyreon wrong" footguns — `signal-write-as-call`, `<For>` without `by`, destructured props, …) and `detectReactPatterns` ("from React" mistakes — `useState`, `className`, …), printing each finding with its inline fix.

```bash
pyreon check                 # scan git-changed .ts/.tsx files (the pre-commit inner loop)
pyreon check src/            # scan a directory (recursive; skips node_modules/lib/dist/build/.git/coverage)
pyreon check src/App.tsx     # scan specific files
pyreon check --fix           # apply the mechanically-safe auto-fixes in place
pyreon check --json          # machine-readable findings for tooling
```

Exits non-zero on any finding. `--fix` applies `migratePyreonCode` + `migrateReactCode` (only the mechanically-safe fixes; anything else stays reported so it still gates).

## `pyreon plain`

Plain-Mode readiness report + classic → plain codemod (see [Plain Mode](https://pyreon.dev/docs/plain-mode)). Dry-run (default) is per-file: already plain / converts fully / partial with every declined shape named / nothing to convert, plus a declined-shape histogram. `--write` applies `@pyreon/compiler`'s `migrateToPlain` in place — per-**binding**, so a binding converts only when every reference has a plain form; everything else stays byte-untouched with a named reason.

```bash
pyreon plain                # readiness report for the whole tree under cwd (unlike `check`, no git-changed default)
pyreon plain src/           # scope to a directory or file
pyreon plain --json         # machine-readable report
pyreon plain --write        # apply the codemod to every fully-convertible binding
```

## `pyreon add`

Install one or more `@pyreon/*` packages **and print exactly how to wire each one in** — the root provider plus a usage snippet, tailored per package.

```bash
pyreon add query                    # installs @pyreon/query (bare name → @pyreon/query)
pyreon add query toast i18n         # several at once
pyreon add @pyreon/form --dry-run   # show the plan + recipe without installing
pyreon add query --json             # machine-readable plan
```

Auto-detects the package manager from the lockfile (`bun.lock`/`bun.lockb` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm), walking up from the current directory. Curated recipes exist for the flagship packages (query, toast, i18n, permissions, form, store, router, head) plus the dev-tool packages whose "usage" is a command rather than JSX (loom, atlas, config); any other `@pyreon/*` package still installs with a generic docs pointer.

## `pyreon new`

Scaffold a new Pyreon project.

```bash
pyreon new my-app             # web / full-stack app (delegates to @pyreon/create-zero)
pyreon new my-app --native    # multiplatform (SwiftUI + Compose) via @pyreon/create-multiplatform
pyreon new my-app --dry-run   # print the npx command without running it
```

A thin, dependency-free delegator: it `npx`-runs the matching `create-*` scaffolder, pinned to `@latest` so a new project always starts on the freshest templates. Every other arg (project name, `--template`, `--yes`, …) passes straight through.

## `pyreon mcp` / `pyreon atlas` / `pyreon loom` / `pyreon lathe`

Thin, dependency-free delegators — every arg after the subcommand passes straight through to the underlying package's own CLI.

```bash
pyreon mcp                        # launch the stdio MCP server (blocks; the client talks over stdin/stdout)
pyreon atlas scan .               # derive + verify the Atlas component catalog
pyreon loom scan .                # analyze the workspace's dependency fabric (red exit on error findings)
pyreon lathe generate ./api.yaml  # generate a client from an OpenAPI spec
pyreon <mcp|atlas|loom|lathe> --dry-run <args>   # print the npx command without running it
```

`pyreon mcp` / `pyreon atlas` / `pyreon loom` / `pyreon lathe` are deliberately **not** pinned to `@latest` (unlike `pyreon new`): `npx @pyreon/X` prefers the project-local install when present, so the tool that runs matches the Pyreon version actually installed, and only fetches on demand when the project doesn't have it.

## `pyreon doctor`

A project-wide health audit that runs a battery of independent **gates** in parallel, aggregates every finding into a unified report, and computes a **0-100 health score** with a letter grade and a per-category bar chart.

```bash
pyreon doctor                          # 13 fast gates (~1-2 s wall, parallel), scored output
pyreon doctor --full                   # adds 2 slow gates (audit-types, bundle-budgets) — 15 total
pyreon doctor --fix                    # auto-fix what we can (lint + react-patterns)
pyreon doctor --json                   # full DoctorReport as JSON
pyreon doctor --gha                    # GitHub Actions annotations (one per finding)
pyreon doctor --ci                     # exit non-zero on non-advisory error findings
pyreon doctor --only lint,doc-claims   # restrict to listed gates
pyreon doctor --skip pyreon-patterns   # exclude listed gates
pyreon doctor --audit-min-risk high    # tighten the test-environment audit
pyreon doctor --format text|json|gha   # explicit format (alternative to --json / --gha)
pyreon doctor --roots src,apps/*       # explicit scan roots (non-standard layouts)
```

### Scan scope — workspace roots

The file-scanning gates (`react-patterns`, `pyreon-patterns`, `lint`, `audit-tests`) resolve their scan scope from the workspace's OWN configuration — the root `package.json` `workspaces` globs (array or `{ packages }` shape) or `pnpm-workspace.yaml` — discovered by walking up from the cwd, so results are identical from any directory in the repo. Multi-root layouts (`apps/* + packages/* + modules/*`) are fully covered; a repo with no workspaces is treated as a single package (nearest `package.json` dir). Per package, `src/**` is scanned when present (else the package tree), always minus tests / fixtures / `.d.ts`.

- The report header prints the resolved scope (`Scope: 4 package root(s) from workspaces (…)`) and per-gate scanned counts — what was scanned is visible at a glance, not just the verdict.
- **A gate that matches no files is SKIPPED with a warning, never a clean pass** — its category is "not measured" and does not contribute a free 100 to the score. When NOTHING was measured, the score renders as `—` and `--ci` exits non-zero (an enforcement run that inspected zero files is a misconfiguration, not a pass).
- `--roots <glob,...>` overrides discovery for non-standard layouts; `pyreon.doctor.excludeRoots` globs in the root package.json exclude demo/docs workspaces from health grading.

### Gates (15 total — 13 fast + 2 slow)

| Gate | Category | Speed | What it catches |
| --- | --- | --- | --- |
| `react-patterns` | correctness | fast | `useState` / `useEffect` / `className` / `htmlFor` / React-package imports |
| `pyreon-patterns` | correctness | fast | `<For>` missing `by`, destructured props, signal-write-as-call, and more — codes a `@pyreon/lint` rule fully owns are deferred to the `lint` gate |
| `lint` | per-rule | fast | Every configured `@pyreon/lint` rule across first-party source (reads `.pyreonlintrc.json`) |
| `distribution` | architecture | fast | `sideEffects` declared, source maps shipped (not excluded) — includes a live `npm pack --dry-run` probe |
| `doc-claims` | documentation | fast | Hand-quoted numeric claims agree with source of truth |
| `islands-audit` | architecture | fast | Cross-file island foot-guns (`duplicate-name`, `never-with-registry-entry`, `registry-mismatch`, `nested-island`, `dead-island`) |
| `dependency-fabric` | architecture | fast | The workspace's dependency fabric via the project's OWN installed `@pyreon/loom` — phantom deps, version drift, runtime cycles, prod-imports-of-dev-deps, peer mismatches. Skips (never installs) when loom isn't present |
| `ssg-audit` | architecture | fast | `_404.tsx` placement, dynamic routes missing `getStaticPaths` (warn — legit under `mode: 'ssr'`/`'isr'`), non-literal `revalidate` exports |
| `content-audit` | architecture | fast | `@pyreon/zero-content` — missing frontmatter title, broken internal link, orphaned `.md` file |
| `native-audit` | architecture | fast | Multiplatform (PMTC) hazards in `.tsx` files importing `@pyreon/primitives` — web-only package imports, native-unsupported top-level decls |
| `audit-tests` | testing | fast | Mock-vnode test patterns (the silent-metadata-drop bug class) |
| `check-dedup` | architecture | fast | Duplicate `@pyreon/*` versions in the lockfile |
| `audit-leak-classes` | `best-practices` (advisory) | fast | Memory-leak class heuristics (A / C / D / I) — advisory, excluded from grade + `--ci` |
| `audit-types` | architecture | slow (`--full`) | Typed-but-unimplemented public-interface fields |
| `bundle-budgets` | performance | slow (`--full`) | Gzipped main-entry size vs locked `bundle-budgets.json` budget |

**Framework-internal gates skip in consumer apps.** `doc-claims`, `audit-leak-classes`, `audit-types`, and `bundle-budgets` all detect they aren't running inside the Pyreon monorepo (via the presence of their companion `scripts/*.ts`) and return **skipped** — excluded from the composite score rather than scoring 0 and dragging an otherwise-clean consumer app's grade down. `native-audit` self-skips when no `@pyreon/primitives` importer is found. They all surface in the report's skipped-gates footer.

### Score formula

- Per-finding penalty: `error = 10`, `warning = 3`, `info = 1` points.
- Per-category subscore: `100 - clamp(sum of penalties, 0, 100)`.
- Overall: mean of *included* category subscores (categories with no gate coverage drop out).
- Grades: `A ≥ 90`, `B ≥ 80`, `C ≥ 70`, `D ≥ 60`, `F` otherwise.

The `best-practices` category (opt-in best-practice `@pyreon/lint` rules) is **advisory** — scored + displayed in its own bar but never enters the overall mean, and its errors never fail `--ci`.

### Legacy flags

`--audit-tests`, `--check-islands`, `--check-ssg`, `--check-content`, `--check-native` are accepted as backward-compat shortcuts — they map to `--only <gate>` internally, and compose when several are passed together. An explicit `--only` always wins.

### Output formats

**Text** (default — TTY): score banner, per-category bars, top-N findings, skipped-gates footer. Colors degrade via `@pyreon/ansi` (`NO_COLOR` / `FORCE_COLOR` honored). File paths are OSC-8 hyperlinks in terminals that support them.

**JSON** (`--json` / `--format=json`) — emits the full `DoctorReport`:

```json
{
  "score": 92,
  "grade": "A",
  "categories": [
    { "category": "correctness", "score": 87, "errors": 1, "warnings": 1, "infos": 0, "grade": "B", "included": true }
  ],
  "findings": [
    {
      "category": "correctness",
      "severity": "error",
      "code": "react-patterns/no-usestate",
      "gate": "react-patterns",
      "message": "useState imported from React. Use signal() from @pyreon/reactivity.",
      "location": { "path": "/abs/src/App.tsx", "relPath": "src/App.tsx", "line": 1, "column": 9 },
      "fix": "import { signal } from \"@pyreon/reactivity\"",
      "fixable": false
    }
  ],
  "gates": [/* meta.elapsedMs + meta.scanned + meta.skipped per gate */],
  "totals": { "errors": 1, "warnings": 1, "infos": 0 },
  "elapsedMs": 1402,
  "timestamp": "2026-06-24T10:00:00.000Z"
}
```

**GitHub Actions** (`--gha` / `--format=gha`) — one `::error`/`::warning`/`::notice` per finding, rendered as inline annotations in the PR's "Files changed" tab:

```text
::notice::pyreon doctor score: 92/100 (A) — 1 errors, 1 warnings, 0 info
::error title=react-patterns%2Fno-usestate,file=src%2FApp.tsx,line=1,col=9::useState imported from React. Use signal() from @pyreon/reactivity.
```

### Plain doctor always exits 0

Without `--ci`, `pyreon doctor` is **informational** — it prints the report and always exits 0. Use `--ci` to gate a build: it exits non-zero **only** on non-advisory error findings (warnings/info never fail; advisory `best-practices` errors are excluded).

## `pyreon context`

```bash
pyreon context                        # writes .pyreon/context.json
pyreon context --out path/to/ctx.json # custom output path
```

Scans the project (delegated to `@pyreon/compiler`'s project scanner) for components, file-system routes, and `island()` declarations, writes the JSON, prints a summary, and ensures `.pyreon/` is in `.gitignore`:

```json
{
  "components": [{ "name": "UserCard", "file": "src/components/UserCard.tsx", "..." : "..." }],
  "routes": [{ "path": "/users/:id", "..." : "..." }],
  "islands": [{ "name": "SearchBar", "file": "src/islands/SearchBar.tsx", "hydrate": "idle" }]
}
```

## `pyreon info`

```bash
pyreon info          # environment + installed @pyreon versions + skew check
pyreon info --json   # machine-readable report
```

Reports the Pyreon CLI version, runtime (node/bun/platform), the project name (and whether it's a `@pyreon/zero` app), and every `@pyreon/*` package installed in `node_modules` with its version. Pyreon ships its packages on one synced version trajectory, so when the installed set spans **more than one version** `info` flags the skew — the condition that can trip the `registerSingleton` duplicate-instance guard (`[Pyreon] Duplicate @pyreon/X detected`) and split context/reactivity across instances at runtime:

```text
  ! Version skew — 2 versions installed:
      0.51.0: @pyreon/core, @pyreon/router
      0.30.0: @pyreon/query
```

Self-contained — reads the project's `package.json` + `node_modules/@pyreon/*` only; no framework packages required.

## `pyreon upgrade`

```bash
pyreon upgrade              # dry-run: show how to align @pyreon/* to one version
pyreon upgrade --write      # rewrite package.json ranges (then run your install)
pyreon upgrade --to 0.51.0  # target a specific version
pyreon upgrade --exact      # pin without the caret (0.51.0, not ^0.51.0)
```

The fix for the skew `pyreon info` detects. Rewrites every `@pyreon/*` range in `package.json` to one target — by default the **highest** version already present (aligning laggards up), or an explicit `--to`. **Dry-run by default**:

```text
  pyreon upgrade → align 1 package(s) to 0.51.0

    @pyreon/core  ^0.30.0 → ^0.51.0
```

`upgrade` never runs your package manager's install itself — run it after `--write`. `workspace:` / `link:` / `file:` / git specifiers and non-`@pyreon` dependencies are left untouched.

## `pyreon lint`

```bash
pyreon lint                  # lint . with the recommended preset
pyreon lint src --fix        # auto-fix fixable findings
pyreon lint --preset strict  # any pyreon-lint flag works
pyreon lint --format json    # text (default) | json | compact
pyreon lint --watch          # re-lint on change
pyreon lint --lsp            # language-server mode
```

A thin front door to `@pyreon/lint` — it forwards **every** `pyreon-lint` flag verbatim. `pyreon lint` and the standalone `pyreon-lint` binary share **one** implementation (the exported `runCli` entry), so the two can never drift. Exits non-zero when there are lint errors.

## Programmatic API

```ts
import { doctor, generateContext } from '@pyreon/cli'
import type { DoctorOptions, DoctorReport, GateName, ContextOptions, ProjectContext } from '@pyreon/cli'

const exitCode = await doctor({
  cwd: process.cwd(),
  fix: false,
  json: false,
  ci: true,
  full: false,
  only: ['lint', 'react-patterns'] as GateName[],
})
// In --ci mode, the returned number is the count of non-advisory error
// findings (the CLI exits 1 when it's > 0). Without --ci, it's the total
// finding count and the CLI exits 0.

await generateContext({ cwd: process.cwd(), outPath: '.pyreon/context.json' })
```

`doctor(options)` returns the exit-code-shaped count described above and prints the chosen format to stdout. `generateContext(options)` returns the scanned `ProjectContext` and writes it to disk. CLI-only command handlers (`check`, `plain`, `add`, `new`, `mcp`, `atlas`, `loom`, `lathe`, `info`, `upgrade`) are lazy-loaded per command and are not re-exported from the main entry — they're reachable via their own module path for tests/tooling.

## CI integration

```yaml
# .github/workflows/ci.yml
- name: Pyreon Doctor
  run: bunx pyreon doctor --ci --gha
```

`--gha` emits inline annotations; `--ci` fails the build on errors but not warnings/info.

## Gotchas

- **`pyreon doctor` runs gates in parallel** via `Promise.all` — a gate that throws is caught and recorded as a single `<gate>/gate-failed` error finding instead of taking down the whole run.
- **Slow gates (`audit-types`, `bundle-budgets`) require `--full`** — they spawn subprocesses and can add 10-30s; the default set keeps the inner loop fast.
- **Categories without gate coverage drop out of the overall score** — adding the first gate to a category can change the mean meaningfully.
- **`pyreon mcp`/`atlas`/`loom`/`lathe` are NOT pinned to `@latest`** (unlike `pyreon new`) — they prefer the project-local install so the tool version matches your installed Pyreon version.

## Documentation

Full docs: [pyreon.dev/docs/cli](https://pyreon.dev/docs/cli) (or `docs/src/content/docs/cli.md` in this repo).

## License

MIT
