---
title: "@pyreon/lint"
description: Pyreon-specific linter — 51 rules for signals, JSX, SSR, performance, and architecture.
---

`@pyreon/lint` is a framework-specific linter that catches Pyreon anti-patterns at the AST level. Powered by `oxc-parser` for fast ESTree/TS-ESTree parsing.

<PackageBadge name="@pyreon/lint" href="/docs/lint" />

## Installation

::: code-group
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

# JSON output for tooling integration
pyreon-lint --format json

# List all 51 rules
pyreon-lint --list

# Override a specific rule
pyreon-lint --rule pyreon/no-classname=off
```

### Options

| Option | Description |
|---|---|
| `--preset <name>` | Preset: `recommended` (default), `strict`, `app`, `lib` |
| `--fix` | Auto-fix fixable issues |
| `--format <fmt>` | Output: `text` (default), `json`, `compact` |
| `--quiet` | Only show errors (hide warnings and info) |
| `--list` | List all available rules |
| `--rule <id>=<sev>` | Override rule severity |

## Programmatic API

```typescript
import { lint, listRules } from "@pyreon/lint"

// Lint a directory
const result = lint({ cwd: "./src", preset: "recommended" })
console.log(result.counts) // { error: 0, warn: 2, info: 1, off: 0 }

// List all rules
const rules = listRules()
```

### Single file

```typescript
import { lintFile, allRules } from "@pyreon/lint"

const config = { rules: { "pyreon/no-classname": "error" } }
const result = lintFile("app.tsx", sourceCode, allRules, config)

for (const diag of result.diagnostics) {
  console.log(`${diag.loc.line}:${diag.loc.column} ${diag.severity} ${diag.message}`)
}
```

## Presets

| Preset | Description |
|---|---|
| `recommended` | All rules at their default severity. Good for development. |
| `strict` | All warnings promoted to errors. For CI and pre-commit hooks. |
| `app` | Recommended + library-specific rules disabled. For Pyreon applications. |
| `lib` | Strict + extra architecture checks. For Pyreon packages and libraries. |

## Rules (51)

### Reactivity (8)

| Rule | Severity | Fixable | Description |
|---|---|---|---|
| `pyreon/no-bare-signal-in-jsx` | error | yes | `{count()}` won't be reactive — wrap in `() => count()` |
| `pyreon/no-signal-in-loop` | error | | `signal()` inside loops creates signals on every iteration |
| `pyreon/no-nested-effect` | warn | | `effect()` inside `effect()` — use `computed()` |
| `pyreon/no-peek-in-tracked` | error | | `.peek()` inside effect/computed bypasses tracking |
| `pyreon/no-unbatched-updates` | warn | | 3+ `.set()` calls without `batch()` |
| `pyreon/prefer-computed` | warn | | `effect()` that only sets a signal — use `computed()` |
| `pyreon/no-effect-assignment` | warn | | `effect(() => signal.update(...))` — use `computed()` |
| `pyreon/no-signal-leak` | warn | | Signal created but never read |

### JSX (11)

| Rule | Severity | Fixable | Description |
|---|---|---|---|
| `pyreon/no-classname` | error | yes | Use `class` not `className` |
| `pyreon/no-htmlfor` | error | yes | Use `for` not `htmlFor` |
| `pyreon/use-by-not-key` | error | yes | Use `by` not `key` on `<For>` |
| `pyreon/no-props-destructure` | error | | Destructuring props breaks reactivity |
| `pyreon/no-map-in-jsx` | warn | | Use `<For>` instead of `.map()` |
| `pyreon/no-onchange` | warn | yes | Use `onInput` not `onChange` on inputs |
| `pyreon/no-ternary-conditional` | warn | | Use `<Show>` instead of ternary |
| `pyreon/no-and-conditional` | warn | | Use `<Show>` instead of `&&` |
| `pyreon/no-index-as-by` | warn | | Index keys cause reconciliation bugs |
| `pyreon/no-missing-for-by` | warn | | `<For>` without `by` uses index-based diffing |
| `pyreon/no-children-access` | info | | Raw `props.children` in renderer files |

### Lifecycle (4)

| Rule | Severity | Description |
|---|---|---|
| `pyreon/no-missing-cleanup` | warn | `onMount` with timer/listener but no cleanup return |
| `pyreon/no-mount-in-effect` | warn | `onMount()` inside `effect()` runs every re-execution |
| `pyreon/no-effect-in-mount` | info | `effect()` inside `onMount()` is redundant |
| `pyreon/no-dom-in-setup` | warn | DOM access in component setup — use `onMount` |

### Performance (4)

| Rule | Severity | Description |
|---|---|---|
| `pyreon/no-large-for-without-by` | error | `<For>` without `by` — O(n) reconciliation |
| `pyreon/no-effect-in-for` | warn | `effect()` inside `<For>` creates N effects |
| `pyreon/no-eager-import` | info | Static import of heavy packages — use `lazy()` |
| `pyreon/prefer-show-over-display` | info | Conditional `display` style — use `<Show>` |

### SSR (3)

| Rule | Severity | Description |
|---|---|---|
| `pyreon/no-window-in-ssr` | error | Browser globals outside `onMount`/typeof guard |
| `pyreon/no-mismatch-risk` | warn | `Date.now()`/`Math.random()` in render — hydration mismatch |
| `pyreon/prefer-request-context` | warn | Module-level state in SSR handlers |

### Architecture (5)

| Rule | Severity | Fixable | Description |
|---|---|---|---|
| `pyreon/no-circular-import` | error | | Violates package dependency layer order |
| `pyreon/no-cross-layer-import` | error | | Core importing from UI-system |
| `pyreon/dev-guard-warnings` | error | | `console.warn` without `__DEV__` guard |
| `pyreon/no-deep-import` | warn | | Deep import into `@pyreon/*/src/` internals |
| `pyreon/no-error-without-prefix` | warn | yes | Error message without `[Pyreon]` prefix |

### Store (3)

| Rule | Severity | Description |
|---|---|---|
| `pyreon/no-duplicate-store-id` | error | Duplicate `defineStore()` IDs |
| `pyreon/no-mutate-store-state` | warn | Direct `.set()` on store signals outside actions |
| `pyreon/no-store-outside-provider` | warn | Store hook in SSR without provider |

### Form (3)

| Rule | Severity | Description |
|---|---|---|
| `pyreon/no-unregistered-field` | warn | `useField()` without `register()` |
| `pyreon/no-submit-without-validation` | warn | `useForm({ onSubmit })` without validators |
| `pyreon/prefer-field-array` | info | `signal([])` in form files — use `useFieldArray()` |

### Styling (4)

| Rule | Severity | Description |
|---|---|---|
| `pyreon/no-inline-style-object` | warn | Inline style object creates new object each render |
| `pyreon/no-dynamic-styled` | warn | `styled()` inside component body |
| `pyreon/no-theme-outside-provider` | warn | `useTheme()` without provider |
| `pyreon/prefer-cx` | info | String concatenation for class names — use `cx()` |

### Hooks (3)

| Rule | Severity | Description |
|---|---|---|
| `pyreon/no-raw-addeventlistener` | info | Use `useEventListener()` — auto-cleanup |
| `pyreon/no-raw-setinterval` | info | Use `onMount` with cleanup return |
| `pyreon/no-raw-localstorage` | info | Use `useStorage()` — reactive, SSR-safe |

### Accessibility (3)

| Rule | Severity | Description |
|---|---|---|
| `pyreon/dialog-a11y` | warn | `<dialog>` without `aria-label`/`aria-labelledby` |
| `pyreon/overlay-a11y` | warn | `<Overlay>` without role/aria attributes |
| `pyreon/toast-a11y` | warn | Toast component without `role="alert"` |
