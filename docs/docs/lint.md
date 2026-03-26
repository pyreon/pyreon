---
title: "@pyreon/lint"
description: Pyreon-specific linter — 55 rules for signals, JSX, SSR, performance, architecture, and routing.
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

# Watch mode — re-lint on file changes
pyreon-lint --watch src/

# JSON output for tooling integration
pyreon-lint --format json

# List all 55 rules
pyreon-lint --list

# Override a specific rule
pyreon-lint --rule pyreon/no-classname=off

# Use a custom config file
pyreon-lint --config ./custom-lint.json
```

### Options

| Option | Description |
|---|---|
| `--preset <name>` | Preset: `recommended` (default), `strict`, `app`, `lib` |
| `--fix` | Auto-fix fixable issues |
| `--format <fmt>` | Output: `text` (default), `json`, `compact` |
| `--quiet` | Only show errors (hide warnings and info) |
| `--watch` | Watch mode — re-lint on file changes |
| `--list` | List all available rules |
| `--rule <id>=<sev>` | Override rule severity |
| `--config <path>` | Custom config file path |
| `--ignore <path>` | Custom ignore file path |
| `--version, -v` | Show version |
| `--help, -h` | Show help |

## Configuration

### Config File

Create `.pyreonlintrc.json` in your project root:

```json
{
  "preset": "recommended",
  "rules": {
    "pyreon/no-classname": "off",
    "pyreon/no-eager-import": "warn"
  },
  "include": ["src/**/*.{ts,tsx}"],
  "exclude": ["**/*.test.ts", "**/generated/**"]
}
```

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
import { lint, listRules } from "@pyreon/lint"

// Lint a directory
const result = lint({ paths: ["src/"], preset: "recommended" })
console.log(result.totalErrors, result.totalWarnings)

// List all rules
const rules = listRules()
```

### Single file with caching

```typescript
import { lintFile, allRules, getPreset, AstCache } from "@pyreon/lint"

const cache = new AstCache()
const config = getPreset("recommended")

// First lint — parses and caches AST
const r1 = lintFile("app.tsx", source, allRules, config, cache)

// Same source — cache hit, no re-parse
const r2 = lintFile("app.tsx", source, allRules, config, cache)
```

### Watch mode

```typescript
import { watchAndLint } from "@pyreon/lint"

watchAndLint({
  paths: ["src/"],
  preset: "recommended",
  format: "text",
})
```

## Presets

| Preset | Description |
|---|---|
| `recommended` | All rules at their default severity. Good for development. |
| `strict` | All warnings promoted to errors. For CI and pre-commit hooks. |
| `app` | Recommended + library-specific rules disabled. For Pyreon applications. |
| `lib` | Strict + extra architecture checks. For Pyreon packages and libraries. |

## Rules (55)

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

### Router (4)

| Rule | Severity | Description |
|---|---|---|
| `pyreon/no-href-navigation` | warn | `<a href>` instead of `<Link>` in router apps |
| `pyreon/no-imperative-navigate-in-render` | error | `navigate()` in component body causes infinite loops |
| `pyreon/no-missing-fallback` | warn | Route config without catch-all / 404 route |
| `pyreon/prefer-use-is-active` | info | `location.pathname ===` — use `useIsActive()` |

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
