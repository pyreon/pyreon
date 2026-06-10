# @pyreon/lint

Pyreon-specific linter — 89 rules across 18 categories, CLI + LSP + programmatic API.

`@pyreon/lint` is a custom linter focused on Pyreon-specific correctness (signals, JSX-as-reactivity, SSR safety, lifecycle, architecture) — complementary to oxlint, not a replacement. Powered by `oxc-parser` for fast AST traversal with an FNV-1a-hashed AST cache for repeat runs. Ships a `pyreon-lint` CLI, a `lint()` programmatic API, a `--lsp` LSP server for IDE inlay hints + diagnostics, and `.pyreonlintrc.json` config files with per-rule options. Opt-in best-practice rules (frontend a11y/CLS, library-scoped query/rx/i18n/storage/form/router) auto-gate on the project's `package.json` deps — a project that doesn't use `@pyreon/query` never sees query rules.

## Install

```bash
bun add -D @pyreon/lint
```

## CLI

```bash
pyreon-lint                              # lint current dir, recommended preset
pyreon-lint src/ components/             # specific paths
pyreon-lint --preset strict src/         # strict — warns promoted to errors
pyreon-lint --preset best-practices      # enable every opt-in best-practice rule
pyreon-lint --fix src/                   # auto-fix fixable issues
pyreon-lint --format json src/           # JSON output (text | json | compact)
pyreon-lint --quiet src/                 # errors only
pyreon-lint --watch src/                 # watch + re-lint on change (100 ms debounce)
pyreon-lint --rule pyreon/no-map-in-jsx=off src/
pyreon-lint --rule-options pyreon/no-window-in-ssr='{"exemptPaths":["src/foundation/"]}'
pyreon-lint --config ./.pyreonlintrc.json
pyreon-lint --ignore ./.pyreonlintignore
pyreon-lint --list                       # list every rule with severity + category
pyreon-lint --lsp                        # start LSP server (stdin/stdout JSON-RPC)
```

Inline suppression — both prefixes are supported:

```ts
// pyreon-lint-ignore pyreon/no-window-in-ssr
window.location.href = '/login'

// pyreon-lint-disable-next-line pyreon/no-window-in-ssr
window.location.href = '/login'
```

Omitting the rule id suppresses every rule on the next line.

## Presets

| Preset           | What it does                                                                       |
| ---------------- | ---------------------------------------------------------------------------------- |
| `recommended`    | Default — every non-opt-in rule at its declared severity                           |
| `strict`         | `recommended` + warnings promoted to errors                                        |
| `app`            | `recommended` minus library-only rules (cross-layer / circular-import / …)         |
| `lib`            | `strict` + architecture rules + `require-browser-smoke-test` for browser packages  |
| `best-practices` | `recommended` + every opt-in best-practice rule enabled                            |

## Config file

`.pyreonlintrc.json` (or the `"pyreonlint"` field in `package.json`):

```json
{
  "$schema": "./node_modules/@pyreon/lint/schema/pyreonlintrc.schema.json",
  "preset": "recommended",
  "rules": {
    "pyreon/no-window-in-ssr": ["error", { "exemptPaths": ["src/foundation/"] }],
    "pyreon/require-img-alt": "warn",
    "pyreon/no-map-in-jsx": "off"
  }
}
```

ESLint-style tuple form: `[severity, options]`. Rules declare their option shape in `meta.schema`; invalid options disable the rule and emit a `LintResult.configDiagnostics` error.

## Rule categories (18)

| Category        | Count | Notes                                                                      |
| --------------- | ----- | -------------------------------------------------------------------------- |
| `reactivity`    | 14    | Signal misuse, peek-in-tracked, unbatched-updates, nested-effect, …        |
| `jsx`           | 11    | `class` over `className`, `<For by>` keying, no-props-destructure, …       |
| `lifecycle`     | 5     | onMount cleanup, mount-in-effect, missing fallback                         |
| `performance`   | 5     | Eager heavy imports, large `<For>` without `by`, heavy-import-in-handler   |
| `ssr`           | 3     | `no-window-in-ssr`, `no-dom-in-setup`, `prefer-request-context`            |
| `architecture`  | 7     | `no-process-dev-gate` (auto-fix), no-circular / no-cross-layer / …         |
| `store`         | 3     | Provider scope, mutation, duplicate ids                                    |
| `form`          | 4     | `no-unregistered-field`, `no-submit-without-validation`, …                 |
| `styling`       | 4     | `prefer-cx`, `no-inline-style-object`, `prefer-show-over-display`, …       |
| `hooks`         | 3     | No raw `addEventListener` / `localStorage` / `setInterval` in hook bodies  |
| `accessibility` | 3     | Toast / Dialog / Overlay ARIA                                              |
| `router`        | 5     | Imperative navigate in render, href navigation, prefer `useIsActive`       |
| `ssg`           | 3     | Revalidate-not-pure-literal, missing-getStaticPaths, invalid-loader-export |
| `frontend`      | 7     | **opt-in** — a11y/CLS: img-alt, dimensions, no-positive-tabindex, …        |
| `query`         | 1     | **opt-in** — `query-options-as-function` (auto-fix)                        |
| `rx`            | 1     | **opt-in** — `rx-prefer-pipe`                                              |
| `i18n`          | 1     | **opt-in** — `i18n-prefer-trans-for-rich-jsx`                              |
| `storage`       | 1     | **opt-in** — `no-storage-write-as-call` (auto-fix)                         |

The five **opt-in** categories + the `form/no-signal-in-form-initial-values` + `router/prefer-typed-search-params` rules default `off` in `recommended` / `strict` / `app` / `lib`. The `best-practices` preset enables them wholesale; library-scoped ones (`query`, `rx`, `i18n`, `storage`, `frontend/prefer-zero-image`) auto-gate on `package.json` deps via `isProjectDependency` so a project never sees rules for libraries it doesn't use.

## Programmatic API

```ts
import {
  lint,
  lintFile,
  listRules,
  applyFixes,
  loadConfig,
  getPreset,
  AstCache,
  watchAndLint,
  startLspServer,
  allRules,
  type LintResult,
  type Diagnostic,
  type Rule,
} from '@pyreon/lint'

// Lint files
const result: LintResult = lint({
  paths: ['src/'],
  preset: 'recommended',
  fix: false,
  quiet: false,
})
console.log(`${result.totalErrors} errors, ${result.totalWarnings} warnings`)
for (const d of result.configDiagnostics) console.log(d.ruleId, d.message)

// Lint a single source string (no filesystem)
const fileResult = lintFile('app.tsx', source, allRules, getPreset('recommended'))

// Apply auto-fixes to a source string
const fixed = applyFixes(source, fileResult.diagnostics)

// List every rule (metadata, severity, category, fixable, opt-in)
for (const rule of listRules()) console.log(rule.id, rule.severity, rule.category)
```

Watch mode:

```ts
import { watchAndLint } from '@pyreon/lint'

const stop = watchAndLint({
  paths: ['src/'],
  preset: 'recommended',
  onResult: (r) => console.log(`${r.totalErrors} errors`),
})
// later: stop()
```

LSP (also reachable via `pyreon-lint --lsp`):

```ts
import { startLspServer } from '@pyreon/lint'
startLspServer()   // stdin/stdout JSON-RPC; publishes diagnostics + inlay hints
```

## CLI subpath

```ts
import { /* internal cli entry */ } from '@pyreon/lint/cli'
```

The `./cli` export wires `process.argv` to `lint()` + a `formatText` / `formatJSON` / `formatCompact` reporter; the `pyreon-lint` bin file is a thin shim that imports it.

## CLI colors

The text reporter uses brand-mapped 256-color ANSI (matches the CLI spec §6.5 and `pyreon doctor`): error → ember-core (xterm 202), warning → ember-warm (220), info → cyan (45); glyphs `✗` / `!` / `ℹ`; file path bold, location + rule id dim. Respects `NO_COLOR` and `FORCE_COLOR`. `--format json|compact` is unchanged (machine formats, no color).

## Gotchas

- **Opt-in rules are off by default.** Use `--preset best-practices` (or enable per-rule in config) to surface frontend a11y / library-usage rules.
- **Library-scoped rules auto-gate** on `package.json` deps — adding `@pyreon/query` to your deps will start surfacing `pyreon/query-options-as-function` if the rule is enabled.
- **The `pyreon-lint` binary is published**; the `lint()` programmatic API is the stable surface for CI integrations.
- **AST cache is in-process only** — `lint()` re-parses files on every call across processes. Use `--watch` to amortize.

## Documentation

Full docs: [docs.pyreon.dev/docs/lint](https://docs.pyreon.dev/docs/lint) (or `docs/src/content/docs/lint.md` in this repo).

## License

MIT
