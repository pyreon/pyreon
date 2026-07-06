# @pyreon/cli

The `pyreon` developer-tool binary — project health audit, AI context generation, environment + version-skew check, dependency alignment, linting.

`@pyreon/cli` ships the `pyreon` command-line tool. `pyreon new [name] [--native]` scaffolds a new project (a thin delegator to `@pyreon/create-zero` / `@pyreon/create-multiplatform`). `pyreon mcp` launches the Pyreon MCP server for AI assistants (a thin delegator to `@pyreon/mcp`, preferring the project-local install). The flagship subcommand is `pyreon doctor` — a single entry point that runs every gate Pyreon enforces (lint rules, anti-pattern detection, distribution hygiene, doc-claim sync, three project audits, type-surface audit, bundle budgets) and produces a 0-100 health score with per-category breakdown. `pyreon check` is the fast, file-scoped counterpart — it runs the compiler's static detectors over your git-changed files (or explicit paths) and prints each Pyreon/React anti-pattern with its inline fix, exiting non-zero so it doubles as a pre-commit / CI gate (`--fix` applies the mechanically-safe fixes in place). `pyreon add <pkg...>` installs one or more `@pyreon/*` packages — auto-detecting the project's package manager from the lockfile — and prints a tailored, verified setup recipe for each (the root provider to add + a usage snippet + a docs link). `pyreon context` writes a `.pyreon/context.json` snapshot of the project's routes, components, and islands for AI coding assistants. `pyreon info` reports the environment and every installed `@pyreon/*` version, flagging version skew before it trips the duplicate-instance guard. Output renders with brand-mapped ANSI colors on a TTY (NO_COLOR / FORCE_COLOR honored), JSON for tooling, and GitHub Actions annotations for inline PR review.

## Install

```bash
bun add -D @pyreon/cli
```

## `pyreon doctor`

```bash
pyreon doctor                          # 8 fast gates (~2-5 s), scored output
pyreon doctor --full                   # adds 2 slow gates (audit-types, bundle-budgets)
pyreon doctor --fix                    # auto-fix what we can (lint + react-patterns)
pyreon doctor --json                   # full DoctorReport as JSON
pyreon doctor --gha                    # GitHub Actions annotations (one per finding)
pyreon doctor --ci                     # exit non-zero on error findings only
pyreon doctor --only lint,doc-claims   # restrict to listed gates
pyreon doctor --skip pyreon-patterns   # exclude listed gates
pyreon doctor --audit-min-risk high    # tighten test-environment audit
pyreon doctor --format text|json|gha   # explicit format (alternative to --json / --gha)
```

### Gates (10 total — 8 fast + 2 slow)

| Gate              | Category      | Speed | What it catches                                                |
| ----------------- | ------------- | ----- | -------------------------------------------------------------- |
| `react-patterns`  | correctness   | fast  | `useState` / `useEffect` / `className` / React imports         |
| `pyreon-patterns` | correctness   | fast  | 15 Pyreon-specific anti-patterns (`detectPyreonPatterns`)      |
| `lint`            | varies        | fast  | All 80 `@pyreon/lint` rules                                    |
| `distribution`    | architecture  | fast  | `sideEffects` declared, source maps shipped (not excluded)     |
| `doc-claims`      | documentation | fast  | Hand-quoted numeric claims agree with source of truth          |
| `audit-tests`     | testing       | fast  | Mock-vnode test patterns (PR #197 bug class)                   |
| `islands-audit`   | architecture  | fast  | Cross-file island foot-guns (5 detector codes)                 |
| `ssg-audit`       | architecture  | fast  | `_404.tsx` placement, missing `getStaticPaths`, …              |
| `audit-types`     | architecture  | slow  | Typed-but-unimplemented public-interface fields                |
| `bundle-budgets`  | performance   | slow  | Gzipped main-entry size vs locked `bundle-budgets.json` budget |

### Score formula

- Per-finding penalty: `error = 10`, `warning = 3`, `info = 1` points.
- Per-category subscore: `max(0, 100 - sum(penalties))`.
- Overall: mean of *included* category subscores (categories with no gate coverage drop out).
- Grades: `A ≥ 90`, `B ≥ 80`, `C ≥ 70`, `D ≥ 60`, `F` otherwise.

The opt-in best-practice `@pyreon/lint` rules (frontend a11y/CLS, query/rx/i18n/router/form/storage library usage) route into an **advisory** category — scored + displayed in its own bar but never enters the overall mean. Opinionated ≠ broken; advisory findings don't tank the objective grade and don't break `--ci`.

### Legacy flags

`--audit-tests`, `--check-islands`, `--check-ssg` are accepted as backward-compat shortcuts — they map to `--only <gate>` internally.

### Output formats

**Text** (default — TTY): big-score banner, per-category bars, top-N findings, skipped-gates footer. Colors follow the Pyreon brand handoff (256-color xterm-8-bit, ember scarce — only on error/fail states). OSC-8 hyperlinks on file paths.

**JSON** (`--json`):

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
      "code": "react-patterns/use-state-import",
      "gate": "react-patterns",
      "message": "useState imported from React. Use signal() from @pyreon/reactivity.",
      "location": { "path": "/abs/src/App.tsx", "relPath": "src/App.tsx", "line": 1, "column": 9 },
      "fix": "import { signal } from \"@pyreon/reactivity\""
    }
  ],
  "gates": [/* meta.elapsedMs + meta.skipped per gate */],
  "totals": { "errors": 1, "warnings": 1, "infos": 0 },
  "elapsedMs": 2300,
  "timestamp": "2026-05-14T12:00:00.000Z"
}
```

**GitHub Actions** (`--gha`):

```text
::error file=src/App.tsx,line=1,col=9::useState imported from React. Use signal() from @pyreon/reactivity.
```

GitHub renders these inline in the PR "Files changed" tab.

## `pyreon context`

```bash
pyreon context                # writes .pyreon/context.json
pyreon context --out ./ai.json
```

Generates a project snapshot AI coding assistants can read instead of crawling the filesystem:

```json
{
  "framework": "pyreon",
  "version": "0.20.0",
  "generatedAt": "…",
  "routes":     [{ "path": "/users/:id", "name": "user", "params": ["id"], "hasLoader": true, "hasGuard": false }],
  "components": [{ "name": "UserCard", "file": "src/components/UserCard.tsx", "props": [...], "hasSignals": true }],
  "islands":    [{ "name": "SearchBar", "file": "src/islands/SearchBar.tsx", "hydrate": "idle" }]
}
```

## `pyreon info`

```bash
pyreon info          # environment + installed @pyreon versions + skew check
pyreon info --json   # machine-readable report
```

Reports the Pyreon CLI version, runtime (node/bun/platform), the project name,
and every `@pyreon/*` package installed in `node_modules` with its version.
Pyreon ships its packages on one synced version trajectory, so when the
installed set spans **more than one version** `info` flags the skew — the
condition that can trip the `registerSingleton` duplicate-instance guard
(`[Pyreon] Duplicate @pyreon/X detected`) and split context/reactivity across
instances at runtime:

```text
  ! Version skew — 2 versions installed:
      0.36.0: @pyreon/core, @pyreon/router
      0.30.0: @pyreon/query
```

Self-contained — reads the project's `package.json` + `node_modules/@pyreon/*`
only; no framework packages required.

## `pyreon upgrade`

```bash
pyreon upgrade              # dry-run: show how to align @pyreon/* to one version
pyreon upgrade --write      # rewrite package.json ranges (then install)
pyreon upgrade --to 0.37.0  # target a specific version
pyreon upgrade --exact      # pin without the caret (0.37.0, not ^0.37.0)
```

The fix for the skew `pyreon info` detects. It rewrites every `@pyreon/*`
range in `package.json` to one target — by default the **highest** version
present (aligning laggards up), or an explicit `--to`. **Dry-run by default**
(prints the plan); `--write` applies, then run your package manager's install:

```text
  pyreon upgrade → align 1 package(s) to 0.37.0

    @pyreon/core  ^0.30.0 → ^0.37.0
```

`workspace:` / `link:` / `file:` / git specifiers and non-`@pyreon` deps are
left untouched.

## `pyreon lint`

```bash
pyreon lint                  # lint . with the recommended preset
pyreon lint src --fix        # fix what's fixable
pyreon lint --preset strict  # any pyreon-lint flag works
pyreon lint --watch          # re-lint on change
pyreon lint --lsp            # language-server mode
```

A thin front door to `@pyreon/lint` — it forwards **every** `pyreon-lint`
flag verbatim (`--preset` / `--fix` / `--format` / `--quiet` / `--rule` /
`--config` / `--ignore` / `--watch` / `--lsp` / paths). Both `pyreon lint` and
the standalone `pyreon-lint` bin call the same `runCli` entry, so there's one
implementation, never drift. Exits non-zero when there are lint errors.

## Programmatic API

```ts
import { doctor, generateContext } from '@pyreon/cli'
import type { DoctorOptions, DoctorReport, GateName } from '@pyreon/cli'

const exitCode = await doctor({
  cwd: process.cwd(),
  fix: false,
  format: 'json',
  only: ['lint', 'distribution'],
})

await generateContext({ cwd: process.cwd(), outPath: '.pyreon/context.json' })
```

`doctor()` returns the process exit code (0 = no errors; 1 = errors present when `ci: true`).

## CI integration

```yaml
# .github/workflows/ci.yml
- name: Pyreon Doctor
  run: bunx @pyreon/cli doctor --ci --gha
```

`--gha` emits inline annotations; `--ci` fails the build on errors but not warnings/info.

## Gotchas

- **`pyreon doctor` runs gates in parallel** via `Promise.all` — gates do not see each other's findings, so a finding's gate is recorded in the JSON output for downstream filtering.
- **Slow gates (`audit-types`, `bundle-budgets`) require `--full`** — they spawn subprocesses and can add 10-30 s; default-set keeps the inner loop fast.
- **Categories without gate coverage drop out of the overall score** — adding the first gate to a category can change the mean meaningfully.

## Documentation

Full docs: [pyreon.dev/docs/cli](https://pyreon.dev/docs/cli) (or `docs/src/content/docs/cli.md` in this repo).

## License

MIT
