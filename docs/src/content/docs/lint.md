---
title: '@pyreon/lint'
description: Pyreon-specific linter — 89 rules for signals, JSX, SSR, performance, architecture, routing, SSG, and opt-in best practices (frontend a11y/CLS, query/rx/form/i18n/router/storage library usage).
---

`@pyreon/lint` is a framework-specific linter that catches Pyreon anti-patterns at the AST level. Powered by `oxc-parser` for fast ESTree/TS-ESTree parsing.

<PackageBadge name="@pyreon/lint" href="/docs/lint" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/lint
```

```bash [bun]
bun add @pyreon/lint
```

```bash [pnpm]
pnpm add @pyreon/lint
```

```bash [yarn]
yarn add @pyreon/lint
```

:::

## CLI Usage

```bash
# Lint current directory with recommended preset
pyreon-lint

# Strict mode for CI (warnings become errors)
pyreon-lint --preset strict --quiet

# Auto-fix fixable issues
pyreon-lint --fix

# Watch mode — re-lint on file changes
pyreon-lint --watch src/

# JSON output for tooling integration
pyreon-lint --format json

# List all 89 rules
pyreon-lint --list

# Override a specific rule
pyreon-lint --rule pyreon/no-classname=off

# Use a custom config file
pyreon-lint --config ./custom-lint.json
```

### Options

| Option              | Description                                             |
| ------------------- | ------------------------------------------------------- |
| `--preset <name>`   | Preset: `recommended` (default), `strict`, `app`, `lib`, `best-practices` |
| `--fix`             | Auto-fix fixable issues                                 |
| `--format <fmt>`    | Output: `text` (default), `json`, `compact`             |
| `--quiet`           | Only show errors (hide warnings and info)               |
| `--watch`           | Watch mode — re-lint on file changes                    |
| `--list`            | List all available rules                                |
| `--rule <id>=<sev>` | Override rule severity                                  |
| `--rule-options <id>=<json>` | Override per-rule options (JSON object)        |
| `--config <path>`   | Custom config file path                                 |
| `--ignore <path>`   | Custom ignore file path                                 |
| `--version, -v`     | Show version                                            |
| `--help, -h`        | Show help                                               |

## Configuration

### Config File

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
  "include": ["src/**/*.{ts,tsx}"],
  "exclude": ["**/*.test.ts", "**/generated/**"]
}
```

**Rule options.** Each rule entry is either a bare severity (`"error"`) or a `[severity, options]` tuple (ESLint-style). Rules that support path-based exemption read `options.exemptPaths: string[]` — each entry is a substring match against the file path. Currently: `no-window-in-ssr`, `no-raw-addeventlistener`, `no-raw-setinterval`, `no-process-dev-gate`, `require-browser-smoke-test`, `dev-guard-warnings`, `no-imperative-effect-on-create`, `no-unbatched-updates`, `no-props-destructure`. `require-browser-smoke-test` also accepts an `additionalPackages: string[]` option to opt new browser packages in.

**Validation.** Each rule declares its option shape in `meta.schema`. The runner validates user config once per `(rule, options)` pair — unknown option keys emit a warning, wrong-typed values emit an error and disable the rule for the run. Diagnostics surface on `LintResult.configDiagnostics` (and stderr) so CI / LSP / JSON reporters pick them up.

**JSON Schema.** The `$schema` reference above enables IDE autocomplete + validation while editing the config in VSCode, IntelliJ, Zed, or any JSON-aware editor.

Or add a `"pyreonlint"` field to your `package.json`:

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

Config files are searched in this order:

1. `.pyreonlintrc.json`
2. `.pyreonlintrc`
3. `pyreonlint.config.json`
4. `package.json` `"pyreonlint"` field

### Ignore File

Create `.pyreonlintignore` (same format as `.gitignore`):

```
# Ignore generated code
src/generated/
**/*.gen.ts

# Ignore test fixtures
src/tests/fixtures/
```

`.gitignore` patterns are also respected automatically.

## Programmatic API

```typescript
import { lint, listRules } from '@pyreon/lint'

// Lint a directory
const result = lint({ paths: ['src/'], preset: 'recommended' })
console.log(result.totalErrors, result.totalWarnings)

// List all rules
const rules = listRules()
```

### Single file with caching

```typescript
import { lintFile, allRules, getPreset, AstCache } from '@pyreon/lint'

const cache = new AstCache()
const config = getPreset('recommended')

// First lint — parses and caches AST
const r1 = lintFile('app.tsx', source, allRules, config, cache)

// Same source — cache hit, no re-parse
const r2 = lintFile('app.tsx', source, allRules, config, cache)
```

### Watch mode

```typescript
import { watchAndLint } from '@pyreon/lint'

watchAndLint({
  paths: ['src/'],
  preset: 'recommended',
  format: 'text',
})
```

## Presets

- **`recommended`** — All rules at their default severity. Good for development.
- **`strict`** — All warnings promoted to errors. For CI and pre-commit hooks.
- **`app`** — Recommended, but library-only rules are turned off: `dev-guard-warnings`, `no-error-without-prefix`, `no-circular-import`, `no-cross-layer-import`, and `require-browser-smoke-test`. Note that `no-process-dev-gate` stays **on** in `app` — the bundler-coupled dev-gate bug hits user-facing browser code regardless of whether the project ships as a library or an app. For Pyreon applications.
- **`lib`** — Strict, plus every architecture rule is forced to `error`: `no-circular-import`, `no-cross-layer-import`, `dev-guard-warnings`, `no-error-without-prefix`, `no-process-dev-gate`, and `require-browser-smoke-test`. For Pyreon packages and libraries.
- **`best-practices`** — `recommended` **plus every opt-in best-practice rule enabled** (the `frontend`, `query`, `rx` categories + form's `no-signal-in-form-initial-values`). These are **off in all other presets** by design — best practices are opinionated, so you opt in explicitly and never get an unexpected score/CI penalty.

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

Per-rule config in `.pyreonlintrc.json` **always wins** over the preset (enable one, disable another, change severity, scope via `exemptPaths`).

**Dependency auto-detection.** Library-scoped opt-in rules (`query` / `rx` / `i18n`, form's signal rule, router's `prefer-typed-search-params`, and `frontend`'s `prefer-zero-image`) only activate when the linted project actually declares the relevant `@pyreon/*` package in its `package.json` (`dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies`). A project that doesn't use `@pyreon/query` never sees `query-options-as-function` — zero config, zero noise. The check walks up to the nearest `package.json` and is cached per manifest. Per-rule config still overrides if you want to force a rule on/off regardless.

Every opt-in rule's message is prescriptive (states the fix) so an AI assistant reading lint output knows exactly how to resolve it; `no-positive-tabindex` is auto-fixable (`--fix`).

## Rules (76)

### Reactivity (13)

| Rule                            | Severity | Fixable | Description                                                                        |
| ------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------- |
| `pyreon/no-bare-signal-in-jsx`  | error    | yes     | `{count()}` won't be reactive — wrap in `() => count()`                            |
| `pyreon/no-signal-in-loop`      | error    |         | `signal()` inside loops creates signals on every iteration                         |
| `pyreon/no-signal-in-props`     | warn     |         | `<C x={sig()} />` captures the value once unless the compiler wraps it             |
| `pyreon/no-async-effect`        | error    |         | `async` in `effect`/`renderEffect`/`computed` — reads after `await` aren't tracked |
| `pyreon/no-context-destructure` | warn     |         | Destructuring `useContext()` breaks reactivity when the provider uses getters      |
| `pyreon/no-signal-call-write`   | error    |         | `sig(value)` does NOT write — use `sig.set(value)` / `sig.update(fn)`              |
| `pyreon/no-nested-effect`       | warn     |         | `effect()` inside `effect()` — use `computed()`                                    |
| `pyreon/no-peek-in-tracked`     | error    |         | `.peek()` inside effect/computed bypasses tracking                                 |
| `pyreon/no-unbatched-updates`   | warn     |         | 3+ `.set()` calls without `batch()`                                                |
| `pyreon/prefer-computed`        | warn     |         | `effect()` that only sets a signal — use `computed()`                              |
| `pyreon/no-effect-assignment`   | warn     |         | `effect(() => signal.update(...))` — use `computed()`                              |
| `pyreon/no-signal-leak`         | warn     |         | Signal created but never read                                                      |
| `pyreon/storage-signal-v-forwarding` | error |        | Signal-like wrapper callable missing `_v` forwarding — breaks `_bindText` fast path |

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

### Lifecycle (5)

| Rule                                    | Severity | Description                                                                       |
| --------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `pyreon/no-missing-cleanup`             | warn     | `onMount` with timer/listener but no cleanup return                               |
| `pyreon/no-mount-in-effect`             | warn     | `onMount()` inside `effect()` runs every re-execution                             |
| `pyreon/no-effect-in-mount`             | info     | `effect()` inside `onMount()` is redundant                                        |
| `pyreon/no-dom-in-setup`                | warn     | DOM access in component setup — use `onMount`                                     |
| `pyreon/no-imperative-effect-on-create` | warn     | `effect()` doing DOM/IO/timer work at component setup — move it into `onMount()`  |

### Performance (5)

| Rule                                    | Severity | Description                                                            |
| --------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `pyreon/no-large-for-without-by`        | error    | `<For>` without `by` — O(n) reconciliation                             |
| `pyreon/no-effect-in-for`               | warn     | `effect()` inside `<For>` creates N effects                            |
| `pyreon/no-heavy-import-only-in-handler`| warn     | Heavy module imported statically but used only in a deferred scope — use a dynamic `import()` |
| `pyreon/no-eager-import`                | info     | Static import of heavy packages — use `lazy()`                         |
| `pyreon/prefer-show-over-display`       | info     | Conditional `display` style — use `<Show>`                             |

### SSR (3)

| Rule                            | Severity | Description                                                 |
| ------------------------------- | -------- | ----------------------------------------------------------- |
| `pyreon/no-window-in-ssr`       | error    | Browser globals outside `onMount`/typeof guard              |
| `pyreon/no-mismatch-risk`       | warn     | `Date.now()`/`Math.random()` in render — hydration mismatch |
| `pyreon/prefer-request-context` | warn     | Module-level state in SSR handlers                          |

### Architecture (7)

| Rule                                | Severity | Fixable | Description                                                                |
| ----------------------------------- | -------- | ------- | -------------------------------------------------------------------------- |
| `pyreon/no-circular-import`         | error    |         | Violates package dependency layer order                                    |
| `pyreon/no-cross-layer-import`      | error    |         | Core importing from UI-system                                              |
| `pyreon/dev-guard-warnings`         | error    |         | `console.warn` without `__DEV__` guard                                     |
| `pyreon/no-process-dev-gate`        | error    | yes     | Bundler-coupled dev gate — use bundler-agnostic `process.env.NODE_ENV`     |
| `pyreon/require-browser-smoke-test` | error    |         | Browser-categorized package with no `*.browser.test.{ts,tsx}` under `src/` |
| `pyreon/no-deep-import`             | warn     |         | Deep import into `@pyreon/*/src/` internals                                |
| `pyreon/no-error-without-prefix`    | warn     | yes     | Error message without `[Pyreon]` prefix                                    |

### Router (4)

| Rule                                      | Severity | Description                                          |
| ----------------------------------------- | -------- | ---------------------------------------------------- |
| `pyreon/no-href-navigation`               | warn     | `<a href>` instead of `<Link>` in router apps        |
| `pyreon/no-imperative-navigate-in-render` | error    | `navigate()` in component body causes infinite loops |
| `pyreon/no-missing-fallback`              | warn     | Route config without catch-all / 404 route           |
| `pyreon/prefer-use-is-active`             | info     | `location.pathname ===` — use `useIsActive()`        |

### SSG (3)

Route-scoped (`src/routes/`) rules for `@pyreon/zero` static-site generation.

| Rule                              | Severity | Description                                                                            |
| --------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `pyreon/revalidate-not-pure-literal` | error | `export const revalidate` must be a numeric literal or `false` — non-literals are silently dropped from the build-time ISR manifest |
| `pyreon/missing-get-static-paths` | warn     | Dynamic route (`[id].tsx` / `[...slug].tsx`) without `export const getStaticPaths` — silently skipped by SSG auto-detect |
| `pyreon/invalid-loader-export`    | error    | `export const loader` is not callable — crashes the SSR runtime with `loader is not a function` |

### Store (3)

| Rule                               | Severity | Description                                      |
| ---------------------------------- | -------- | ------------------------------------------------ |
| `pyreon/no-duplicate-store-id`     | error    | Duplicate `defineStore()` IDs                    |
| `pyreon/no-mutate-store-state`     | warn     | Direct `.set()` on store signals outside actions |
| `pyreon/no-store-outside-provider` | warn     | Store hook in SSR without provider               |

### Form (4)

| Rule                                  | Severity | Description                                        |
| ------------------------------------- | -------- | -------------------------------------------------- |
| `pyreon/no-unregistered-field`        | warn     | `useField()` without `register()`                  |
| `pyreon/no-submit-without-validation` | warn     | `useForm({ onSubmit })` without validators         |
| `pyreon/prefer-field-array`           | info     | `signal([])` in form files — use `useFieldArray()` |
| `pyreon/no-signal-in-form-initial-values` ᵒ | warn | `useForm({ initialValues: { x: sig() } })` snapshots the signal once — pass the plain value / use a reactive field |

### Styling (4)

| Rule                               | Severity | Description                                        |
| ---------------------------------- | -------- | -------------------------------------------------- |
| `pyreon/no-inline-style-object`    | warn     | Inline style object creates new object each render |
| `pyreon/no-dynamic-styled`         | warn     | `styled()` inside component body                   |
| `pyreon/no-theme-outside-provider` | warn     | `useTheme()` without provider                      |
| `pyreon/prefer-cx`                 | info     | String concatenation for class names — use `cx()`  |

### Hooks (3)

| Rule                             | Severity | Description                             |
| -------------------------------- | -------- | --------------------------------------- |
| `pyreon/no-raw-addeventlistener` | info     | Use `useEventListener()` — auto-cleanup |
| `pyreon/no-raw-setinterval`      | info     | Use `onMount` with cleanup return       |
| `pyreon/no-raw-localstorage`     | info     | Use `useStorage()` — reactive, SSR-safe |

### Accessibility (3)

| Rule                  | Severity | Description                                       |
| --------------------- | -------- | ------------------------------------------------- |
| `pyreon/dialog-a11y`  | warn     | `<dialog>` without `aria-label`/`aria-labelledby` |
| `pyreon/overlay-a11y` | warn     | `<Overlay>` without role/aria attributes          |
| `pyreon/toast-a11y`   | warn     | Toast component without `role="alert"`            |

> ᵒ = **opt-in** best-practice rule (off in `recommended`/`strict`/`app`/`lib`; enable via `best-practices` preset or per-rule config). Library-scoped ones additionally auto-gate on `package.json` deps — see [Opt-in best-practice rules](#opt-in-best-practice-rules).

### Frontend (4) ᵒ

Opt-in frontend best practices — accessibility + layout-shift (CLS) + asset optimization.

| Rule                            | Severity | Fixable | Description                                                                              |
| ------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------- |
| `pyreon/require-img-alt`        | error    |         | `<img>` without an `alt` attribute — required for a11y (`alt=""` for decorative is fine)  |
| `pyreon/img-requires-dimensions`| warn     |         | `<img>` without both `width` & `height` — causes layout shift (CLS); set intrinsic dimensions |
| `pyreon/no-positive-tabindex`   | warn     | yes     | `tabIndex={n}` where n > 0 breaks natural tab order — use `0` (autofix) or `-1`           |
| `pyreon/prefer-zero-image`      | info     |         | Raw `<img>` in a `@pyreon/zero` project — prefer `<Image>` for lazy-load + srcset + blur (dep-gated) |

### Query (1) ᵒ

Auto-gated on a `@pyreon/query` dependency.

| Rule                               | Severity | Description                                                                                          |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `pyreon/query-options-as-function` | error (**auto-fixable**) | `useQuery`/`useInfiniteQuery`/`useQueries`/`useSuspenseQuery` with an options **object literal** — `--fix` wraps it in `() => ({ ... })` so `queryKey` tracks signals and refetches reactively (`useMutation` excluded). Also a proactive MCP `validate` detector (flagged before commit, not just in lint output). |

### Rx (1) ᵒ

Auto-gated on a `@pyreon/rx` dependency.

| Rule                    | Severity | Description                                                                                  |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `pyreon/rx-prefer-pipe` | info     | Nested rx transforms (`map(filter(src, …), …)`) — compose via `pipe(src, filter(…), map(…))` for a single computed instead of N |

### I18n (1) ᵒ

Auto-gated on a `@pyreon/i18n` dependency.

| Rule                                  | Severity | Description                                                                                  |
| ------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `pyreon/i18n-prefer-trans-for-rich-jsx` | info   | `{t('…')}` interleaved with JSX element siblings (rich content) — use the `<Trans>` component for safe JSX interpolation. Plain-text `{t('title')}` never fires (zero-FP: single element's children-array check) |

### Router — opt-in (1) ᵒ

Auto-gated on a `@pyreon/router` dependency. (The 4 non-opt-in router rules are listed under [Router](#router-4) above.)

| Rule                             | Severity | Description                                                                              |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `pyreon/prefer-typed-search-params` | info  | Manual `new URLSearchParams(...)` in a router-aware file — use `useTypedSearchParams()` for typed, auto-coerced, SSR-safe search params |

## Notable Rules

### `pyreon/no-process-dev-gate` (auto-fixable)

Pyreon ships libraries to npm; consumers compile with whatever bundler they use — Vite, Webpack (Next.js), Rolldown, esbuild, Rollup, Parcel, or Bun. Two dev-gate patterns are broken in library code and this rule flags both:

- `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` — dead code in real Vite browser bundles, because Vite does not polyfill `process`. The whole expression statically folds to `false` and the dev warning never fires.
- `import.meta.env.DEV` (and `(import.meta as ViteMeta).env?.DEV === true`) — Vite/Rolldown-only. Under Webpack/Next.js, esbuild, Rollup, Parcel, or Bun, `import.meta.env` is `undefined` and the warning never fires, even in development.

The auto-fix rewrites both to the bundler-agnostic library convention used by React, Vue, Preact, and Solid:

```ts
// ❌ flagged
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') warn()
if (import.meta.env.DEV) warn()

// ✅ auto-fixed to
if (process.env.NODE_ENV !== 'production') warn()
```

Every modern bundler auto-replaces `process.env.NODE_ENV` at consumer build time and tree-shakes the dev branch to zero bytes in production — no consumer config needed. Server-only packages (`zero`, `runtime-server`, `server`, `vite-plugin`) are exempt because they always run in Node where `process` is real. The companion rule `pyreon/dev-guard-warnings` recognises `if (process.env.NODE_ENV === 'production') return` as a valid early-return guard so warnings in the function body don't fire spuriously. Stays **on** in the `app` preset (the bug hits user-facing browser code regardless of project type).

### `pyreon/require-browser-smoke-test`

Every browser-categorized package must ship at least one `*.browser.test.{ts,tsx}` file under `src/`. The rule fires once per package on its `src/index.ts`, walks the package directory for browser smoke tests, and reports if none exist. This locks in the browser smoke harness: without it, new browser-running packages can silently ship without real-Chromium coverage, and happy-dom masks environment-divergence bugs (mock-vnode metadata drops, `typeof process` dead code, event-delegation bugs that only surface in a real browser). The default browser-package list mirrors `.claude/rules/test-environment-parity.md`; extend via the `additionalPackages` option, opt out via `exemptPaths`. **Off** in the `app` preset — applications don't ship as packages with smoke obligations — and forced to `error` in `lib`.

### `pyreon/no-imperative-effect-on-create`

`effect()` is for pure reactive subscriptions (signal reads driving signal writes). When an `effect()` callback at component-body scope does imperative work — `fetch()`, `setTimeout`/`setInterval`, `requestAnimationFrame`/`requestIdleCallback`, `queueMicrotask`, or `document.*` / `window.*` / `localStorage.*` / `sessionStorage.*` access — that work allocates per instance and runs synchronously during component setup, which compounds badly under many component instances. Move it into `onMount(() => { ... })`:

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
