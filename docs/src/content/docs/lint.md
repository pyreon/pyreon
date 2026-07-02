---
title: '@pyreon/lint'
description: Pyreon-specific linter — 93 rules across 18 categories for signals, JSX, lifecycle, SSR, performance, architecture, routing, SSG, and opt-in best practices (frontend a11y/CLS, query/rx/form/i18n/router/storage library usage). CLI, programmatic API, watch mode, AST cache, and an LSP server.
---

`@pyreon/lint` is a framework-specific linter that catches Pyreon anti-patterns at the AST level — bare signal reads in JSX, props destructuring that breaks reactivity, browser globals in SSR code, bundler-coupled dev gates, and dozens more. It is powered by [`oxc-parser`](https://oxc.rs) for fast ESTree/TS-ESTree parsing, ships a CLI (`pyreon-lint`), a programmatic API (`lint` / `lintFile`), watch mode, an AST cache, and an LSP server for editor integration.

<PackageBadge name="@pyreon/lint" href="/docs/lint" />

It is **complementary to `oxlint`/`eslint`**, not a replacement: those catch general JS/TS issues; `@pyreon/lint` catches mistakes specific to Pyreon's signal model, JSX semantics, SSR contract, and package architecture. Every rule message is prescriptive — it states the fix — so the output is directly actionable by humans and AI assistants alike.

## Installation

:::code-group

```bash [npm]
npm install -D @pyreon/lint
```

```bash [bun]
bun add -d @pyreon/lint
```

```bash [pnpm]
pnpm add -D @pyreon/lint
```

```bash [yarn]
yarn add -D @pyreon/lint
```

:::

## Quick Start

```bash
# Lint the current directory with the recommended preset
pyreon-lint

# Strict mode for CI (warnings become errors), errors-only output
pyreon-lint --preset strict --quiet

# Auto-fix fixable issues
pyreon-lint --fix

# List every rule
pyreon-lint --list
```

Add it to your `package.json` scripts:

```json
{
  "scripts": {
    "lint:pyreon": "pyreon-lint --preset recommended",
    "lint:pyreon:ci": "pyreon-lint --preset strict --quiet"
  }
}
```

`pyreon-lint` exits with code `1` when there are any **errors** (warnings and infos do not fail the process; use `--preset strict` to promote warnings to errors for CI gating).

## CLI Usage

```bash
# Lint specific paths
pyreon-lint src/ app/

# Watch mode — re-lint on file changes
pyreon-lint --watch src/

# JSON output for tooling integration
pyreon-lint --format json

# Compact one-line-per-diagnostic output
pyreon-lint --format compact

# Override a specific rule's severity
pyreon-lint --rule pyreon/no-classname=off

# Override a rule's options (JSON object)
pyreon-lint --rule-options 'pyreon/no-window-in-ssr={"exemptPaths":["src/foundation/"]}' src/

# Use a custom config / ignore file
pyreon-lint --config ./custom-lint.json --ignore ./.customignore

# Start the LSP server (stdin/stdout JSON-RPC) for editor integration
pyreon-lint --lsp
```

### Flags

| Flag                          | Description                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `[path...]`                   | Files or directories to lint (default: `.`). Directories are walked recursively.            |
| `--preset <name>`             | Preset: `recommended` (default), `strict`, `app`, `lib`, `best-practices`                    |
| `--fix`                       | Apply auto-fixes for fixable diagnostics, writing changes back to disk                       |
| `--format <fmt>`              | Output format: `text` (default), `json`, `compact`                                           |
| `--quiet`                     | Only show errors (hide warnings and infos)                                                   |
| `--watch`                     | Watch mode — re-lint on file changes (`fs.watch` recursive + 100ms debounce + AST cache)     |
| `--list`                      | List all rules (`id`, category, severity, description, `[fixable]`) and the total count      |
| `--rule <id>=<sev>`           | Override one rule's severity, e.g. `--rule pyreon/no-window-in-ssr=off`                       |
| `--rule-options <id>=<json>`  | Override one rule's options on this run; `<json>` must be a JSON **object**                   |
| `--config <path>`             | Path to a config file (skips the auto-discovery walk)                                         |
| `--ignore <path>`             | Path to a custom ignore file                                                                 |
| `--lsp`                       | Start the LSP server over stdin/stdout JSON-RPC                                               |
| `--version`, `-v`             | Print the version                                                                            |
| `--help`, `-h`                | Print usage                                                                                  |

:::tip
`--rule` only sets a rule's **severity**; `--rule-options` only sets a rule's **options**. They can be combined. A `--rule-options` override is silently ignored for a rule whose effective severity is `off` (turning the rule on requires `--rule <id>=error` or a config entry).
:::

## Configuration

### Config file

Create `.pyreonlintrc.json` in your project root:

```json
{
  "$schema": "./node_modules/@pyreon/lint/schema/pyreonlintrc.schema.json",
  "preset": "recommended",
  "rules": {
    "pyreon/no-classname": "off",
    "pyreon/no-eager-import": "warn",
    "pyreon/no-window-in-ssr": [
      "error",
      { "exemptPaths": ["src/foundation/"] }
    ]
  },
  "include": ["src/"],
  "exclude": ["generated", ".test."]
}
```

The `$schema` reference enables IDE autocomplete + validation while editing the config in VSCode, IntelliJ, Zed, or any JSON-aware editor.

#### `LintConfigFile` shape

| Field     | Type                                    | Description                                                                         |
| --------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| `preset`  | `'recommended' \| 'strict' \| 'app' \| 'lib' \| 'best-practices'` | Base preset; rule entries below override it.               |
| `rules`   | `Record<string, RuleEntry>`             | Per-rule severity / options. Overrides the preset.                                  |
| `include` | `string[]`                              | Substring patterns — a file is linted only if its path matches one of them.         |
| `exclude` | `string[]`                              | Substring patterns — a matching file is skipped (takes precedence over `include`).  |

:::note
`include` / `exclude` are **substring matches against the file path**, not full glob patterns. `"exclude": ["generated", ".test."]` skips any path containing `generated` or `.test.`. The directory walk additionally skips dot-directories, `node_modules`, `lib`, and `dist` automatically, and only considers JS/TS files.
:::

#### Rule entries

Each entry in `rules` is either a **bare severity** or a `[severity, options]` **tuple** (ESLint-style):

```json
{
  "rules": {
    "pyreon/no-classname": "off",
    "pyreon/no-window-in-ssr": ["error", { "exemptPaths": ["packages/core/runtime-dom/"] }],
    "pyreon/require-browser-smoke-test": ["error", { "additionalPackages": ["@my-org/widgets"] }]
  }
}
```

Severities are `"error"`, `"warn"`, `"info"`, or `"off"`.

#### `package.json` field

Instead of a standalone file, you can put the config under a `"pyreonlint"` field in `package.json`:

```json
{
  "pyreonlint": {
    "preset": "strict",
    "rules": {
      "pyreon/no-inline-style-object": "off"
    }
  }
}
```

#### Discovery order

`loadConfig(cwd)` walks up from the working directory toward the filesystem root, returning the first config it finds. Within each directory the search order is:

1. `.pyreonlintrc.json`
2. `.pyreonlintrc`
3. `pyreonlint.config.json`
4. `package.json` `"pyreonlint"` field

`--config <path>` bypasses the walk and loads that file directly.

#### Resolution precedence

For a single run, rule severity/options are resolved in this order (later wins):

1. The base **preset** (`--preset` flag → config-file `preset` → `recommended`)
2. Config-file `rules` entries
3. CLI `--rule <id>=<sev>` severity overrides / programmatic `ruleOverrides`
4. CLI `--rule-options <id>=<json>` options overrides / programmatic `ruleOptionsOverrides`

### Per-rule options & `exemptPaths`

Several rules read an `exemptPaths: string[]` option — each entry is a substring matched against the file path, letting you opt specific files/directories out of a rule **without hardcoding paths in the rule source** (which would ship to every consuming project). Rules that honor `exemptPaths` today:

`no-window-in-ssr`, `prefer-isserver`, `no-bare-signal-in-jsx`, `no-unbatched-updates`, `no-props-destructure`, `no-imperative-effect-on-create`, `no-heavy-import-only-in-handler`, `dev-guard-warnings`, `no-error-without-prefix`, `no-process-dev-gate`, `no-module-signal-in-server-package`, `no-querySelector-cast-in-test`, `require-browser-smoke-test`, `vitest-config-uses-shared`, `no-raw-addeventlistener`, `no-raw-setinterval`, and every opt-in best-practice rule (`frontend/*`, `query-options-as-function`, `rx-prefer-pipe`, `i18n-prefer-trans-for-rich-jsx`, `prefer-typed-search-params`, `no-storage-write-as-call`, `no-signal-in-form-initial-values`).

`require-browser-smoke-test` additionally accepts `additionalPackages: string[]` to opt new browser packages into its coverage check.

```json
{
  "rules": {
    "pyreon/no-window-in-ssr": ["error", { "exemptPaths": ["src/client-only/"] }]
  }
}
```

#### Option validation

Each rule that takes options declares an option shape in `meta.schema` (`Record<string, 'string' | 'string[]' | 'number' | 'boolean'>`). The runner validates user-supplied options once per `(rule, options)` pair:

- **Unknown option key** → a `warn`-severity config diagnostic; the rule still runs.
- **Wrong-typed value** → an `error`-severity config diagnostic; the rule is **disabled for the run**.

These config-level diagnostics surface on `LintResult.configDiagnostics` (and on stderr / the JSON reporter) so CI, the LSP, and JSON consumers all see them alongside file diagnostics.

### Ignore file

Create `.pyreonlintignore` (same format as `.gitignore`):

```gitignore
# Ignore generated code
src/generated/
**/*.gen.ts

# Ignore test fixtures
src/tests/fixtures/
```

`.gitignore` patterns are respected automatically in addition to `.pyreonlintignore`. Pass `--ignore <path>` to load a custom ignore file.

## Inline suppression

Suppress a diagnostic on the **immediately following line** with a comment. Two equivalent syntaxes are accepted — `pyreon-lint-ignore` (short) and `pyreon-lint-disable-next-line` (long-form, the convention several rule docstrings use):

```tsx
// pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
if (next === editor.value.peek()) return // intentional loop-prevention read

// pyreon-lint-ignore pyreon/no-window-in-ssr
const w = window.innerWidth // guarded elsewhere

// pyreon-lint-ignore
// ^ omitting the rule id suppresses EVERY rule on the next line
const x = someBroadlyFlaggedExpression()
```

Omitting the rule id suppresses all rules on the next line; including it suppresses only that rule. The comment must match exactly — word-boundary matching means a typo like `// pyreon-lint-ignored` is **not** treated as a suppression (so a misspelled directive fails loudly rather than silently disabling the rule).

## Presets

`@pyreon/lint` ships five presets. The first four cover the common lifecycle (dev → CI → app/library); `best-practices` opts you into the full opinionated rule surface.

| Preset           | Built from                                | Use for                                    |
| ---------------- | ----------------------------------------- | ------------------------------------------ |
| `recommended`    | Every non-opt-in rule at its default severity | Day-to-day development                  |
| `strict`         | `recommended` with all `warn` → `error`   | CI and pre-commit gating                   |
| `app`            | `recommended` minus library-only rules    | Pyreon **applications**                    |
| `lib`            | `strict` with all architecture rules forced to `error` | Pyreon **packages / libraries**   |
| `best-practices` | `recommended` **plus every opt-in rule enabled** | Projects that want the full a11y/CLS + library-usage best-practice surface |

### `recommended`

All rules at their declared default severity, **except** opt-in best-practice rules (`meta.optIn`), which are forced **off** so they never add unexpected noise.

### `strict`

`recommended` with every `warn` promoted to `error`. `info` rules stay `info`; `off` (opt-in) rules stay `off`. This is the CI/pre-commit preset — any warning now fails the run.

### `app`

`recommended` with the **library-only** architecture rules turned off, because applications don't ship as packages with those obligations:

- `pyreon/dev-guard-warnings` → `off`
- `pyreon/no-error-without-prefix` → `off`
- `pyreon/no-circular-import` → `off`
- `pyreon/no-cross-layer-import` → `off`
- `pyreon/require-browser-smoke-test` → `off`

:::warning{title="no-process-dev-gate stays ON in the app preset"}
The bundler-coupled dev-gate bug hits **user-facing browser code regardless** of whether the project ships as a library or an app — so `pyreon/no-process-dev-gate` is deliberately kept on in `app`. (`recommended`/`strict`/`lib` keep it on too.)
:::

### `lib`

`strict`, plus every architecture rule forced to `error`:

- `pyreon/no-circular-import`
- `pyreon/no-cross-layer-import`
- `pyreon/dev-guard-warnings`
- `pyreon/no-error-without-prefix`
- `pyreon/no-process-dev-gate`
- `pyreon/require-browser-smoke-test`

For Pyreon packages and libraries — the strongest preset.

### `best-practices`

`recommended` **plus every opt-in best-practice rule enabled** at its declared severity. The opt-in rules (the `frontend`, `query`, `rx`, `i18n`, `storage` categories + `form`'s `no-signal-in-form-initial-values` + `router`'s `prefer-typed-search-params`) are **off in all other presets by design** — best practices are opinionated, so you opt in explicitly. Library-scoped opt-in rules still self-gate on your `package.json` dependencies even under `best-practices`, so you only see rules for libraries you actually use.

### Opt-in best-practice rules

Rules tagged opt-in (`meta.optIn`) are **off in `recommended` / `strict` / `app` / `lib`**. Enable them either wholesale via `--preset best-practices` / `"preset": "best-practices"`, or per-rule:

```json
{
  "preset": "recommended",
  "rules": {
    "pyreon/require-img-alt": "error",
    "pyreon/query-options-as-function": "error",
    "pyreon/rx-prefer-pipe": "off"
  }
}
```

Per-rule config in your config file **always wins** over the preset — enable one, disable another, change severity, or scope with `exemptPaths`.

#### Dependency auto-detection

Library-scoped opt-in rules — `query`, `rx`, `i18n`, `storage`, form's `no-signal-in-form-initial-values`, router's `prefer-typed-search-params`, and `frontend`'s `prefer-zero-image` — only activate when the linted project actually declares the relevant `@pyreon/*` package in its `package.json` (`dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies`). A project that doesn't use `@pyreon/query` never sees `query-options-as-function` — zero config, zero noise. The check (`isProjectDependency`) walks up to the nearest `package.json` and is cached per manifest. Per-rule config still overrides if you want to force a rule on or off regardless of deps.

## Rules

There are **93 rules across 18 categories**. The `frontend`, `query`, `rx`, `i18n`, and `storage` categories (plus the two opt-in rules in `form` and `router`) are opt-in best-practice rules — off in the standard presets. Run `pyreon-lint --list` for the authoritative list with live severities.

### Categories at a glance

| Category          | Rules | Opt-in? | Purpose                                                             |
| ----------------- | ----- | ------- | ------------------------------------------------------------------ |
| `reactivity`      | 14    |         | Signal/effect/computed correctness — tracking, batching, leaks     |
| `jsx`             | 11    |         | Pyreon JSX semantics — `class`/`for`, `<For>`/`by`, props, `<Show>`|
| `lifecycle`       | 6     |         | `onMount`/`effect` setup-vs-mount, cleanup, idempotent `init*`     |
| `performance`     | 6     |         | Keyed lists, lazy imports, leak-prone timers                       |
| `ssr`             | 4     |         | Browser globals, hydration mismatch, per-request state             |
| `architecture`    | 10    |         | Import layering, dev gates, error prefixes, test/config contracts  |
| `store`           | 3     |         | `defineStore` ids, mutation discipline, provider scope             |
| `form`            | 4     | 1 of 4  | `useField`/`register`, validation, field arrays                    |
| `styling`         | 4     |         | Inline style objects, dynamic `styled()`, theme/cx usage           |
| `hooks`           | 3     |         | Prefer auto-cleanup hooks over raw listeners/timers/storage        |
| `accessibility`   | 3     |         | Dialog / overlay / toast ARIA                                      |
| `router`          | 5     | 1 of 5  | `<Link>` vs `<a>`, navigate-in-render, fallback, active state      |
| `ssg`             | 3     |         | `@pyreon/zero` route exports (`getStaticPaths`, `revalidate`, `loader`) |
| `frontend`        | 10    | ✅ all  | Accessibility + layout-shift (CLS) + asset optimization            |
| `query`           | 1     | ✅      | `@pyreon/query` options-as-function                                |
| `rx`              | 1     | ✅      | `@pyreon/rx` pipe composition                                      |
| `i18n`            | 1     | ✅      | `@pyreon/i18n` `<Trans>` for rich JSX                              |
| `storage`         | 1     | ✅      | `@pyreon/storage` `.set()` vs call-write                           |

Opt-in (`ᵒ`) rules below are off in `recommended`/`strict`/`app`/`lib` — enable via `best-practices` or per-rule config; library-scoped ones additionally auto-gate on `package.json` deps.

### Reactivity (14)

| Rule                                  | Severity | Fixable | Description                                                                        |
| ------------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------- |
| `pyreon/no-bare-signal-in-jsx`        | error    | yes     | `{count()}` won't be reactive — wrap in `() => count()`                            |
| `pyreon/no-signal-in-loop`            | error    |         | `signal()` inside loops creates signals on every iteration                         |
| `pyreon/no-signal-in-props`           | warn     |         | `<C x={sig()} />` captures the value once unless the compiler wraps it             |
| `pyreon/no-async-effect`              | error    |         | `async` in `effect`/`renderEffect`/`computed` — reads after `await` aren't tracked |
| `pyreon/no-context-destructure`       | warn     |         | Destructuring `useContext()` breaks reactivity when the provider uses getters      |
| `pyreon/no-signal-call-write`         | error    |         | `sig(value)` does NOT write — use `sig.set(value)` / `sig.update(fn)`              |
| `pyreon/no-nested-effect`             | warn     |         | `effect()` inside `effect()` — use `computed()`                                    |
| `pyreon/no-peek-in-tracked`           | error    |         | `.peek()` inside effect/computed bypasses tracking                                 |
| `pyreon/no-unbatched-updates`         | warn     |         | 3+ `.set()` calls without `batch()`                                                |
| `pyreon/prefer-computed`              | warn     |         | `effect()` that only sets a signal — use `computed()`                              |
| `pyreon/no-effect-assignment`         | warn     |         | `effect(() => signal.update(...))` — use `computed()`                              |
| `pyreon/no-signal-leak`               | warn     |         | Signal created but never read                                                      |
| `pyreon/storage-signal-v-forwarding`  | error    |         | Signal-like wrapper callable missing `_v` forwarding — breaks the `_bindText` fast path |
| `pyreon/no-iterate-children-without-resolve` | error |     | Iterating `props.children` at the VNode level (`cloneVNode`, `.map`/`.filter`, `.props`) must first unwrap a possible compiler accessor via `resolveChildren(…)` |

### JSX (11)

| Rule                            | Severity | Fixable | Description                                   |
| ------------------------------- | -------- | ------- | --------------------------------------------- |
| `pyreon/no-classname`           | error    | yes     | Use `class` not `className`                   |
| `pyreon/no-htmlfor`             | error    | yes     | Use `for` not `htmlFor`                       |
| `pyreon/use-by-not-key`         | error    | yes     | Use `by` not `key` on `<For>`                 |
| `pyreon/no-props-destructure`   | error    |         | Destructuring props breaks reactivity         |
| `pyreon/no-map-in-jsx`          | warn     |         | Use `<For>` instead of `.map()`               |
| `pyreon/no-onchange`            | warn     | yes     | Use `onInput` not `onChange` on inputs        |
| `pyreon/no-ternary-conditional` | warn     |         | Use `<Show>` instead of ternary               |
| `pyreon/no-and-conditional`     | warn     |         | Use `<Show>` instead of `&&`                  |
| `pyreon/no-index-as-by`         | warn     |         | Index keys cause reconciliation bugs          |
| `pyreon/no-missing-for-by`      | warn     |         | `<For>` without `by` uses index-based diffing |
| `pyreon/no-children-access`     | info     |         | Raw `props.children` in renderer files        |

### Lifecycle (6)

| Rule                                    | Severity | Description                                                                       |
| --------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `pyreon/no-missing-cleanup`             | warn     | `onMount` with timer/listener but no cleanup return                               |
| `pyreon/no-mount-in-effect`             | warn     | `onMount()` inside `effect()` runs every re-execution                             |
| `pyreon/no-effect-in-mount`             | info     | `effect()` inside `onMount()` is redundant                                        |
| `pyreon/no-dom-in-setup`                | warn     | DOM access in component setup — use `onMount`                                     |
| `pyreon/no-imperative-effect-on-create` | warn     | `effect()` doing DOM/IO/timer work at component setup — move it into `onMount()`  |
| `pyreon/init-fn-needs-idempotency`      | warn     | Exported `init*` fn called without a refcount/boolean guard registers effects N times |

### Performance (6)

| Rule                                    | Severity | Description                                                            |
| --------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `pyreon/no-large-for-without-by`        | error    | `<For>` without `by` — O(n) reconciliation                             |
| `pyreon/no-effect-in-for`               | warn     | `effect()` inside `<For>` creates N effects                            |
| `pyreon/no-heavy-import-only-in-handler`| warn     | Heavy module imported statically but used only in a deferred scope — use a dynamic `import()` |
| `pyreon/promise-race-needs-cleartimeout`| warn     | `Promise.race([work, setTimeout-reject])` without `clearTimeout` in `finally` leaks the timer |
| `pyreon/no-eager-import`                | info     | Static import of heavy packages — use `lazy()`                         |
| `pyreon/prefer-show-over-display`       | info     | Conditional `display` style — use `<Show>`                             |

### SSR (4)

| Rule                            | Severity | Description                                                 |
| ------------------------------- | -------- | ----------------------------------------------------------- |
| `pyreon/no-window-in-ssr`       | error    | Browser globals outside `onMount`/typeof guard              |
| `pyreon/no-mismatch-risk`       | warn     | `Date.now()`/`Math.random()` in render — hydration mismatch |
| `pyreon/prefer-request-context` | warn     | Module-level state in SSR handlers                          |
| `pyreon/prefer-isserver`        | warn     | Prefer `isServer`/`isClient` from `@pyreon/reactivity` over hand-rolled `typeof window`/`typeof document` |

### Architecture (10)

| Rule                                       | Severity | Fixable | Description                                                                |
| ------------------------------------------ | -------- | ------- | -------------------------------------------------------------------------- |
| `pyreon/no-circular-import`                | error    |         | Violates package dependency layer order                                    |
| `pyreon/no-cross-layer-import`             | error    |         | Core importing from UI-system                                              |
| `pyreon/dev-guard-warnings`                | error    |         | `console.warn` without a dev guard                                         |
| `pyreon/no-process-dev-gate`               | error    | yes     | Bundler-coupled dev gate — use bundler-agnostic `process.env.NODE_ENV`     |
| `pyreon/require-browser-smoke-test`        | error    |         | Browser-categorized package with no `*.browser.test.{ts,tsx}` under `src/` |
| `pyreon/no-module-signal-in-server-package`| error    |         | Module-scoped signals in server packages race between requests — use per-request state |
| `pyreon/no-querySelector-cast-in-test`     | error    |         | In tests, `el.querySelector(x) as T` should use `query()` from `@pyreon/test-utils` |
| `pyreon/vitest-config-uses-shared`         | error    |         | Per-package vitest config must use `defineNodeConfig`/`defineBrowserConfig` |
| `pyreon/no-deep-import`                     | warn     |         | Deep import into `@pyreon/*/src/` internals                                |
| `pyreon/no-error-without-prefix`           | warn     | yes     | Error message without a `[Pyreon]` prefix                                  |

### Store (3)

| Rule                               | Severity | Description                                      |
| ---------------------------------- | -------- | ------------------------------------------------ |
| `pyreon/no-duplicate-store-id`     | error    | Duplicate `defineStore()` IDs                    |
| `pyreon/no-mutate-store-state`     | warn     | Direct `.set()` on store signals outside actions |
| `pyreon/no-store-outside-provider` | warn     | Store hook in SSR without provider               |

### Form (4)

| Rule                                        | Severity | Description                                        |
| ------------------------------------------- | -------- | -------------------------------------------------- |
| `pyreon/no-unregistered-field`              | warn     | `useField()` without `register()`                  |
| `pyreon/no-submit-without-validation`       | warn     | `useForm({ onSubmit })` without validators         |
| `pyreon/prefer-field-array`                 | info     | `signal([])` in form files — use `useFieldArray()` |
| `pyreon/no-signal-in-form-initial-values` ᵒ | warn     | `useForm({ initialValues: { x: sig() } })` snapshots the signal once — pass the plain value / use a reactive field |

### Styling (4)

| Rule                               | Severity | Description                                        |
| ---------------------------------- | -------- | -------------------------------------------------- |
| `pyreon/no-inline-style-object`    | warn     | Inline style object creates a new object each render |
| `pyreon/no-dynamic-styled`         | warn     | `styled()` inside component body                   |
| `pyreon/no-theme-outside-provider` | warn     | `useTheme()` without provider                      |
| `pyreon/prefer-cx`                 | info     | String concatenation for class names — use `cx()`  |

### Hooks (3)

| Rule                             | Severity | Description                                            |
| -------------------------------- | -------- | ------------------------------------------------------ |
| `pyreon/no-raw-addeventlistener` | info     | Use `useEventListener()` — auto-cleanup                |
| `pyreon/no-raw-setinterval`      | info     | Use `onMount` with cleanup return                      |
| `pyreon/no-raw-localstorage`     | info     | Use `useStorage()` — reactive, SSR-safe                |

### Accessibility (3)

| Rule                  | Severity | Description                                       |
| --------------------- | -------- | ------------------------------------------------- |
| `pyreon/dialog-a11y`  | warn     | `<dialog>` without `aria-label`/`aria-labelledby` |
| `pyreon/overlay-a11y` | warn     | `<Overlay>` without role/aria attributes          |
| `pyreon/toast-a11y`   | warn     | Toast component without `role="alert"`            |

### Router (5)

| Rule                                      | Severity | Description                                          |
| ----------------------------------------- | -------- | ---------------------------------------------------- |
| `pyreon/no-href-navigation`               | warn     | `<a href>` instead of `<Link>` in router apps        |
| `pyreon/no-imperative-navigate-in-render` | error    | `navigate()` in component body causes infinite loops |
| `pyreon/no-missing-fallback`              | warn     | Route config without a catch-all / 404 route         |
| `pyreon/prefer-use-is-active`             | info     | `location.pathname ===` — use `useIsActive()`        |
| `pyreon/prefer-typed-search-params` ᵒ     | info     | Manual `new URLSearchParams(...)` — use `useTypedSearchParams()` (auto-gated on `@pyreon/router`) |

### SSG (3)

Route-scoped (`src/routes/`) rules for `@pyreon/zero` static-site generation.

| Rule                                 | Severity | Description                                                                          |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------------ |
| `pyreon/revalidate-not-pure-literal` | error    | `export const revalidate` must be a numeric literal or `false` — non-literals are silently dropped from the build-time ISR manifest |
| `pyreon/missing-get-static-paths`    | warn     | Dynamic route (`[id].tsx` / `[...slug].tsx`) without `export const getStaticPaths` — silently skipped by SSG auto-detect |
| `pyreon/invalid-loader-export`       | error    | `export const loader` is not callable — crashes the SSR runtime with `loader is not a function` |

### Frontend (10) ᵒ

Opt-in frontend best practices — accessibility + layout-shift (CLS) + asset optimization. All off in the standard presets.

| Rule                              | Severity | Fixable | Description                                                                              |
| --------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------- |
| `pyreon/require-img-alt`          | error    |         | `<img>` without an `alt` attribute — required for a11y (`alt=""` for decorative is fine)  |
| `pyreon/img-requires-dimensions`  | warn     |         | `<img>` without both `width` & `height` — causes layout shift (CLS); set intrinsic dimensions |
| `pyreon/no-positive-tabindex`     | warn     | yes     | `tabIndex={n}` where n > 0 breaks natural tab order — use `0` (autofix) or `-1`           |
| `pyreon/no-discarded-optimize-fields` | warn |        | A raw `<img src={x.src}>` that discards the rest of a `?optimize` descriptor (CLS + no responsive images) |
| `pyreon/no-autofocus`             | warn     | yes     | `autoFocus` disorients screen-reader/keyboard users by moving focus on load (autofix removes it) |
| `pyreon/no-redundant-role`        | warn     | yes     | An ARIA `role` that duplicates the element's implicit role (autofix removes it)           |
| `pyreon/anchor-is-valid`          | warn     |         | `<a>` that isn't a valid link — missing `href`, or `href` is `""`/`#`/`javascript:`       |
| `pyreon/heading-order`            | warn     |         | A skipped heading level (e.g. `<h1>` → `<h3>`) breaks the screen-reader outline           |
| `pyreon/color-contrast`           | warn     |         | A low-contrast `color`/`background` literal-hex pair in a style object (below the WCAG AA `4.5:1` ratio)  |
| `pyreon/prefer-zero-image`        | info     |         | Raw `<img>` in a `@pyreon/zero` project — prefer `<Image>` for lazy-load + srcset + blur (auto-gated on `@pyreon/zero`) |

### Query (1) ᵒ

Auto-gated on a `@pyreon/query` dependency.

| Rule                               | Severity | Description                                                                                          |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `pyreon/query-options-as-function` | error (**fixable**) | `useQuery`/`useInfiniteQuery`/`useQueries`/`useSuspenseQuery` with an options **object literal** — `--fix` wraps it in `() => ({ ... })` so `queryKey` tracks signals and refetches reactively (`useMutation` excluded). Also a proactive MCP `validate` detector (flagged before commit). |

### Rx (1) ᵒ

Auto-gated on a `@pyreon/rx` dependency.

| Rule                    | Severity | Description                                                                                  |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `pyreon/rx-prefer-pipe` | info     | Nested rx transforms (`map(filter(src, …), …)`) — compose via `pipe(src, filter(…), map(…))` for a single computed instead of N |

### I18n (1) ᵒ

Auto-gated on a `@pyreon/i18n` dependency.

| Rule                                    | Severity | Description                                                                                  |
| --------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `pyreon/i18n-prefer-trans-for-rich-jsx` | info     | `{t('…')}` interleaved with JSX element siblings (rich content) — use `<Trans>` for safe JSX interpolation. Plain-text `{t('title')}` never fires (zero-FP) |

### Storage (1) ᵒ

Auto-gated on a `@pyreon/storage` dependency.

| Rule                             | Severity | Fixable | Description                                                                              |
| -------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------- |
| `pyreon/no-storage-write-as-call`| error    | yes     | Writing to a storage signal by calling it (`s(x)`) reads-and-discards — use `s.set(x)`/`s.update(fn)` (autofix to `.set`) |

## Notable Rules

### `pyreon/no-process-dev-gate` (auto-fixable)

Pyreon ships libraries to npm; consumers compile with whatever bundler they use — Vite, Webpack (Next.js), Rolldown, esbuild, Rollup, Parcel, or Bun. Two dev-gate patterns are broken in library code and this rule flags both:

- `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` — dead code in real Vite browser bundles, because Vite does not polyfill `process`. The whole expression statically folds to `false` and the dev warning never fires.
- `import.meta.env.DEV` (and `(import.meta as ViteMeta).env?.DEV === true`) — Vite/Rolldown-only. Under Webpack/Next.js, esbuild, Rollup, Parcel, or Bun, `import.meta.env` is `undefined` and the warning never fires, even in development.

```ts
// ❌ flagged — dead in real Vite browser bundles
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') warn()
// ❌ flagged — Vite/Rolldown-only, undefined elsewhere
if (import.meta.env.DEV) warn()

// ✅ auto-fixed to the bundler-agnostic convention
if (process.env.NODE_ENV !== 'production') warn()
```

Every modern bundler auto-replaces `process.env.NODE_ENV` at consumer build time and tree-shakes the dev branch to zero bytes in production — no consumer config needed. The companion rule `pyreon/dev-guard-warnings` recognises `if (process.env.NODE_ENV === 'production') return` as a valid early-return guard so warnings in the function body don't fire spuriously. Server-only packages are exempt because they always run in Node where `process` is real. **Stays on in `app`** — the bug hits user-facing browser code regardless of project type.

:::warning{title="Don't copy the typeof-process pattern from other codebases"}
The `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` pattern works in Node (and in vitest) but is dead code in browser bundles. Vitest passing is not proof the gate works for real users.
:::

:::warning{title="Don't test by deleting globalThis.process"}
Vitest's own `import.meta.env` depends on `process`, so `delete globalThis.process` breaks the *fixed* gate too — not because the gate is wrong, but because vitest can't resolve it. Don't add `process: { env: {...} }` polyfills to `vite.config.ts` as a workaround either — fix the source.
:::

:::warning{title="Don't use the rule for server-only packages"}
Server-only packages are correctly exempt — they always run in Node where `process` is real.
:::

### `pyreon/require-browser-smoke-test`

Every browser-categorized package must ship at least one `*.browser.test.{ts,tsx}` file under `src/`. The rule fires once per package on its `src/index.ts`, walks the package directory for browser smoke tests, and reports if none exist. This locks in the browser smoke harness: without it, new browser-running packages can silently ship without real-Chromium coverage, and happy-dom masks environment-divergence bugs (mock-vnode metadata drops, `typeof process` dead code, event-delegation bugs that only surface in a real browser). The default browser-package list mirrors `.claude/rules/browser-packages.json`; extend via `additionalPackages`, opt out via `exemptPaths`. **Off** in `app`, forced to **error** in `lib`.

```json
{
  "rules": {
    "pyreon/require-browser-smoke-test": [
      "error",
      {
        "additionalPackages": ["@my-org/my-browser-pkg"],
        "exemptPaths": ["packages/experimental/"]
      }
    ]
  }
}
```

:::warning{title="A trivial smoke test passes the gate but gives zero signal"}
`require-browser-smoke-test` is a **gate**, not a quality check. A `sanity.browser.test.ts` with `expect(1).toBe(1)` satisfies it but proves nothing — review the actual test contents on PR.
:::

:::warning{title="Don't hardcode the browser-package list in the rule"}
The list lives in `.claude/rules/browser-packages.json` (the single source of truth), not in the rule source. Use `additionalPackages` to extend it.
:::

### `pyreon/no-imperative-effect-on-create`

`effect()` is for pure reactive subscriptions (signal reads driving signal writes). When an `effect()` callback at component-body scope does imperative work — `fetch()`, `setTimeout`/`setInterval`, `requestAnimationFrame`/`requestIdleCallback`, `queueMicrotask`, or `document.*` / `window.*` / `localStorage.*` / `sessionStorage.*` access — that work allocates per instance and runs synchronously during component setup, which compounds badly under many instances. Move it into `onMount(() => { ... })`:

```tsx
// ❌ flagged — imperative work in a per-instance effect
effect(() => {
  document.addEventListener('keydown', onKey)
})

// ✅ imperative work belongs in onMount
onMount(() => {
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
})
```

Pure effects (`effect(() => sum.set(a() + b()))`, `effect(() => console.log(count()))`) are **not** flagged. Foundation hooks (`@pyreon/hooks`, `@pyreon/rx`) are exempt via `exemptPaths` — they're the abstraction layer that wraps timers/listeners for users.

### `pyreon/no-async-effect`

`async` functions passed to `effect()`, `renderEffect()`, or `computed()` only track signal reads up to the first `await` — reads after an `await` happen in a detached microtask with no active tracking context, so the effect never re-runs when those signals change. Read every tracked signal synchronously before the first `await`, or move the async work into an event handler / `onMount`.

### `pyreon/no-signal-call-write` & `pyreon/no-signal-in-props`

`no-signal-call-write` flags `sig(value)` where `sig` was declared `const sig = signal(...)` / `computed(...)` — the callable form is read-only; the argument is ignored. Use `sig.set(value)` or `sig.update(fn)`. `no-signal-in-props` flags `<Comp x={sig()} />` shapes where the signal value is captured once unless the compiler wraps it — prefer the `props.x` access pattern (or pass the accessor) so the prop stays reactive.

### `pyreon/no-context-destructure`

Destructuring `useContext()` (`const { mode } = useContext(Ctx)`) captures the value once at setup time. If the provider exposes values via getters (`get mode()`), destructuring evaluates the getter immediately and the value becomes static. Keep the context object reference and read properties lazily inside reactive scopes: `const ctx = useContext(Ctx)` then `ctx.mode`.

### `pyreon/no-iterate-children-without-resolve`

Library code that iterates `props.children` at the VNode level — `cloneVNode(children, …)`, `(Array.isArray(children) ? children : [children]).map/filter(…)`, or reading `children.props` — must first unwrap a possible compiler-emitted accessor function. The compiler's prop-inlining wrap can deliver `props.children` as a function; iterating it directly silently produces `{type: undefined}` → `<undefined>` DOM tags. Resolve at body entry with `resolveChildren(…)` or `typeof X === 'function' ? X() : X`.

### `pyreon/query-options-as-function` (auto-fixable, dep-gated)

`@pyreon/query` hooks take options as a **function** so `queryKey` can read signals and refetch reactively. An options **object literal** captures the key once. `--fix` wraps it:

```tsx
// ❌ flagged — captures id() once
useQuery({ queryKey: ['user', id()], queryFn: fetchUser })

// ✅ auto-fixed — refetches when id() changes
useQuery(() => ({ queryKey: ['user', id()], queryFn: fetchUser }))
```

`useMutation` is excluded (its options are imperative — no tracking). This rule is also a proactive MCP `validate` detector, so an AI assistant flags it before commit, not just after running lint.

## Programmatic API

```ts
import { lint, listRules } from '@pyreon/lint'

// Lint a directory tree
const result = lint({ paths: ['src/'], preset: 'recommended' })
console.log(result.totalErrors, result.totalWarnings, result.totalInfos)

// Surface config-level diagnostics (malformed rule options, etc.)
for (const d of result.configDiagnostics) console.log(d.severity, d.ruleId, d.message)

// Enumerate every rule's metadata
for (const rule of listRules()) {
  console.log(`${rule.id} (${rule.category}, ${rule.severity})${rule.fixable ? ' [fixable]' : ''}`)
}
```

### `lint(options)` — the high-level entry

`LintOptions`:

| Field                  | Type                                  | Description                                                              |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `paths`                | `string[]` (required)                 | Files / directories to lint (directories walked recursively)             |
| `preset`               | `PresetName`                          | Base preset; defaults to the config-file preset or `recommended`         |
| `fix`                  | `boolean`                             | Apply auto-fixes and write changed files back to disk                    |
| `quiet`                | `boolean`                             | Drop warnings + infos from each file's diagnostics                       |
| `ruleOverrides`        | `Record<string, Severity>`            | Per-rule severity overrides (highest priority for severity)              |
| `ruleOptionsOverrides` | `Record<string, RuleOptions>`         | Per-rule options merged on top of config-file options                    |
| `config`               | `string`                              | Path to a specific config file (skips auto-discovery)                    |
| `ignore`               | `string`                              | Path to a custom ignore file                                             |

Returns `LintResult`: `{ files, totalErrors, totalWarnings, totalInfos, configDiagnostics }`. Each `files[i]` is a `LintFileResult` (`{ filePath, diagnostics, fixedSource? }`).

```ts
// Severity + options overrides on a single run
lint({
  paths: ['.'],
  ruleOverrides: { 'pyreon/no-classname': 'off' },
  ruleOptionsOverrides: {
    'pyreon/no-window-in-ssr': { exemptPaths: ['src/foundation/'] },
  },
})
```

### `lintFile(...)` — the low-level single-file entry

For tooling that owns the file-gathering loop (watchers, editors, custom CI). Takes a parsed-or-to-be-parsed source string, the rule set, a config, and an optional AST cache:

```ts
import { lintFile, allRules, getPreset, AstCache } from '@pyreon/lint'
import type { ConfigDiagnostic } from '@pyreon/lint'

const cache = new AstCache()
const config = getPreset('recommended')
const configSink: ConfigDiagnostic[] = []

// First call parses + caches the AST (FNV-1a hash keyed by source text)
const r1 = lintFile('app.tsx', source, allRules, config, cache, configSink)

// Same source → cache hit, no re-parse
const r2 = lintFile('app.tsx', source, allRules, config, cache, configSink)
```

`lintFile(filePath, sourceText, rules, config, cache?, configDiagnosticsSink?)` returns `LintFileResult`. Pass a `configDiagnosticsSink` array to collect malformed-option diagnostics; without it they print to stderr. Inline suppression comments and option validation are applied inside `lintFile`, so every entry point (CLI, `lint`, watcher, LSP) behaves identically.

### `applyFixes(source, diagnostics)`

Apply every fixable diagnostic to a source string and return the result. Fixes are sorted by position descending and applied end-to-start so earlier offsets stay valid:

```ts
import { applyFixes } from '@pyreon/lint'

const fixed = applyFixes(source, fileResult.diagnostics)
```

(`lint({ fix: true })` and `pyreon-lint --fix` use this internally and write the result back to disk.)

### `getPreset(name)`, `allRules`, `listRules()`

```ts
import { getPreset, allRules, listRules } from '@pyreon/lint'

const config = getPreset('strict')   // resolve a preset to a LintConfig
allRules                              // Rule[] — the full rule set (used by lintFile)
listRules()                           // RuleMeta[] — id, category, severity, fixable, description
```

### `loadConfig` / `loadConfigFromPath`

```ts
import { loadConfig, loadConfigFromPath } from '@pyreon/lint'

const fromCwd = loadConfig(process.cwd())            // walks up for .pyreonlintrc.json / package.json field
const fromFile = loadConfigFromPath('./lint.json')   // load a specific file
```

`loadConfig` returns `LintConfigFile | null`; `loadConfigFromPath` returns the parsed JSON or `null` if missing/invalid.

### `createIgnoreFilter`

```ts
import { createIgnoreFilter } from '@pyreon/lint'

const isIgnored = createIgnoreFilter(process.cwd(), './.customignore')
isIgnored('/abs/path/to/file.ts') // boolean — honors .pyreonlintignore + .gitignore + the custom file
```

### `AstCache`

```ts
import { AstCache } from '@pyreon/lint'

const cache = new AstCache() // FNV-1a hash keyed by source text — share across lintFile calls in watch mode
```

The cache keys parsed ASTs by a hash of the source text, so re-linting an unchanged file (the common case in watch mode and the LSP) skips re-parsing entirely.

### Reporters

```ts
import { formatText, formatJSON, formatCompact } from '@pyreon/lint'

console.log(formatText(result))     // human-readable, colorized when stdout is a TTY
console.log(formatJSON(result))     // machine-readable
console.log(formatCompact(result))  // one line per diagnostic
```

### `isProjectDependency` / file-role utilities

```ts
import { isProjectDependency, isTestFile, isPathExempt } from '@pyreon/lint'

isProjectDependency('@pyreon/query', '/abs/path/to/file.ts') // dep-gating used by opt-in rules
isTestFile('/abs/src/foo.test.ts')                            // true
isPathExempt('/abs/src/foundation/x.ts', ['src/foundation/']) // true — the exemptPaths helper
```

`@pyreon/lint` also re-exports import-analysis helpers used by the rules themselves — `extractImportInfo`, `getLocalName`, `importsName`, `isPyreonImport`, `isPyreonPackage`, and the `LineIndex` offset→line/column mapper — for authors building their own AST tooling on top of the same primitives.

### Watch mode

```ts
import { watchAndLint } from '@pyreon/lint'

watchAndLint({
  paths: ['src/'],
  preset: 'recommended',
  format: 'text', // 'text' | 'json' | 'compact'
})
```

`watchAndLint` uses `fs.watch` (recursive) with a 100ms debounce and the shared `AstCache`, clearing the screen and re-printing on each change. It accepts the same `LintOptions` fields as `lint` plus a required `format`.

## LSP server

`@pyreon/lint` ships a Language Server Protocol server for in-editor diagnostics and **inlay hints** that surface the compiler's reactivity analysis at the cursor:

```bash
pyreon-lint --lsp
```

```ts
import { startLspServer } from '@pyreon/lint'

startLspServer() // speaks JSON-RPC over stdin/stdout
```

The server advertises `textDocumentSync: full` and `inlayHintProvider: true`. On `textDocument/didOpen` / `didChange` it publishes diagnostics; on `textDocument/inlayHint` it renders structural reactivity facts as end-of-span ghost text. When the `PYREON_LPIH_CACHE` environment variable points at a live-program-inlay-hints cache file, the server also overlays **live runtime data** — signal fire counts, effect re-runs — at the source line that created each primitive (`🔥 signal fired N×`). `PYREON_LPIH_PATH_MAP` (format `from1=to1;from2=to2`) remaps host paths to container paths for dev-container / remote setups.

## CI integration

```yaml
# .github/workflows/lint.yml
- name: Pyreon lint
  run: bunx pyreon-lint --preset strict --quiet
```

`--preset strict` promotes every warning to an error so the job fails on any deviation; `--quiet` keeps the output to errors only. The `--format json` output (`{ files, totalErrors, totalWarnings, totalInfos, configDiagnostics }`) feeds dashboards and custom gates. For a ratcheted burn-down (counts may only decrease), pair the JSON output with a baseline file.

## API Reference

### Functions

| Export                                     | Signature                                                                                                       | Description                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `lint`                                     | `lint(options: LintOptions): LintResult`                                                                        | High-level entry: gather files, apply preset/overrides, lint, count      |
| `lintFile`                                 | `lintFile(filePath, sourceText, rules, config, cache?, configDiagnosticsSink?): LintFileResult`                 | Low-level single-file API with optional AST cache + config-diag sink     |
| `listRules`                                | `listRules(): RuleMeta[]`                                                                                       | Metadata for every rule                                                  |
| `applyFixes`                               | `applyFixes(sourceText: string, diagnostics: Diagnostic[]): string`                                             | Apply all fixable diagnostics to a source string                         |
| `getPreset`                                | `getPreset(name: PresetName): LintConfig`                                                                       | Resolve a preset name to a concrete config                               |
| `loadConfig`                               | `loadConfig(cwd: string): LintConfigFile \| null`                                                               | Walk up from `cwd` for a config file / `package.json` field              |
| `loadConfigFromPath`                       | `loadConfigFromPath(filePath: string): LintConfigFile \| null`                                                  | Load a specific config file                                              |
| `createIgnoreFilter`                       | `createIgnoreFilter(cwd: string, ignorePath?: string): (filePath: string) => boolean`                           | Build an ignore predicate from `.pyreonlintignore` + `.gitignore`        |
| `watchAndLint`                             | `watchAndLint(options: LintOptions & { format: string }): void`                                                 | Watch directories and re-lint on change (debounced, cached)              |
| `startLspServer`                           | `startLspServer(): void`                                                                                        | Start the LSP server over stdin/stdout JSON-RPC                          |
| `formatText` / `formatJSON` / `formatCompact` | `(result: LintResult): string`                                                                               | Render results in text / JSON / compact form                            |
| `isProjectDependency`                      | `isProjectDependency(pkg: string, filePath: string): boolean`                                                   | Dep-gating used by opt-in rules                                          |
| `isPathExempt`                             | `isPathExempt(filePath: string, exemptPaths: string[]): boolean`                                                | The `exemptPaths` substring-match helper                                 |
| `isTestFile`                               | `isTestFile(filePath: string): boolean`                                                                         | Classify a path as a test file                                           |
| `extractImportInfo` / `getLocalName` / `importsName` / `isPyreonImport` / `isPyreonPackage` | (import-analysis helpers)                                                     | Building blocks for AST tooling over imports                             |

### Values & classes

| Export       | Type             | Description                                                              |
| ------------ | ---------------- | ----------------------------------------------------------------------- |
| `allRules`   | `Rule[]`         | The full rule set, in registration order                                |
| `AstCache`   | `class`          | FNV-1a hash–keyed parsed-AST cache for repeat runs                      |
| `LineIndex`  | `class`          | Maps byte offsets to `{ line, column }`                                 |

### Types

| Export                                        | Description                                                       |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `LintOptions`                                 | Input to `lint` (`paths` required; preset/fix/quiet/overrides/…)  |
| `LintResult`                                  | `{ files, totalErrors, totalWarnings, totalInfos, configDiagnostics }` |
| `LintFileResult`                              | `{ filePath, diagnostics, fixedSource? }`                         |
| `Diagnostic`                                  | `{ ruleId, severity, message, span, loc, fix? }`                  |
| `ConfigDiagnostic`                            | Config-level diagnostic (malformed rule options)                  |
| `Fix`                                         | `{ span, replacement }`                                           |
| `Severity`                                    | `'error' \| 'warn' \| 'info' \| 'off'`                            |
| `PresetName`                                  | `'recommended' \| 'strict' \| 'app' \| 'lib' \| 'best-practices'` |
| `RuleCategory`                                | The 18 category literals                                          |
| `Rule` / `RuleMeta` / `RuleContext`           | Rule-authoring surface                                            |
| `RuleEntry` / `RuleOptions` / `RuleOptionsSchema` / `OptionType` | Config rule-entry + option shapes              |
| `LintConfig` / `LintConfigFile`               | Resolved config / on-disk config-file shape                       |
| `SourceLocation` / `Span`                     | Position primitives                                               |
| `ImportInfo` / `VisitorCallbacks`             | Import metadata / AST visitor map                                 |

### `RuleMeta` shape

```ts
interface RuleMeta {
  id: string                  // e.g. 'pyreon/no-bare-signal-in-jsx'
  category: RuleCategory
  description: string
  severity: Severity          // default severity
  fixable: boolean
  schema?: RuleOptionsSchema  // declared option shape, validated against user config
  optIn?: boolean             // opt-in best-practice rule (off in standard presets)
}
```

### `Diagnostic` shape

```ts
interface Diagnostic {
  ruleId: string
  severity: Severity
  message: string
  span: { start: number; end: number }
  loc: { line: number; column: number }
  fix?: { span: Span; replacement: string }
}
```
