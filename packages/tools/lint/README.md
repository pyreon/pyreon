# @pyreon/lint

Pyreon-specific linter powered by [oxc-parser](https://github.com/nicolo-ribaudo/oxc-parser) — 51 rules across 11 categories for signals, JSX, SSR, performance, and architecture.

## Installation

```bash
bun add @pyreon/lint
```

## Usage

### CLI

```bash
# Lint current directory with recommended preset
pyreon-lint

# Lint specific paths
pyreon-lint src/ components/

# Use a preset
pyreon-lint --preset strict src/

# Auto-fix fixable issues
pyreon-lint --fix src/

# JSON output
pyreon-lint --format json src/

# Only show errors (skip warnings and info)
pyreon-lint --quiet src/

# Override a rule
pyreon-lint --rule pyreon/no-map-in-jsx=off src/

# List all rules
pyreon-lint --list
```

### Programmatic API

```ts
import { lint, listRules, lintFile, applyFixes } from '@pyreon/lint'

// Lint files
const result = lint({
  paths: ['src/'],
  preset: 'recommended',
  fix: false,
  quiet: false,
})

console.log(`${result.totalErrors} errors, ${result.totalWarnings} warnings`)

// List all rules
for (const rule of listRules()) {
  console.log(`${rule.id} (${rule.severity}): ${rule.description}`)
}

// Lint a single source string
import { getPreset } from '@pyreon/lint'
import { allRules } from '@pyreon/lint/rules'

const fileResult = lintFile('app.tsx', source, allRules, getPreset('recommended'))
```

## Rules (51)

### Reactivity (8)

| Rule                           | Severity | Fixable | Description                                       |
| ------------------------------ | -------- | ------- | ------------------------------------------------- |
| `pyreon/no-bare-signal-in-jsx` | error    | Yes     | Flags `{count()}` in JSX text — wrap in `() =>`   |
| `pyreon/no-signal-in-loop`     | error    | No      | Flags signal()/computed() inside loops            |
| `pyreon/no-nested-effect`      | warn     | No      | Flags effect() inside effect()                    |
| `pyreon/no-peek-in-tracked`    | error    | No      | Flags .peek() inside effect/computed              |
| `pyreon/no-unbatched-updates`  | warn     | No      | Flags 3+ .set() calls without batch()             |
| `pyreon/prefer-computed`       | warn     | No      | Suggests computed() for effect with single .set() |
| `pyreon/no-effect-assignment`  | warn     | No      | Flags effect with single .update()                |
| `pyreon/no-signal-leak`        | warn     | No      | Reports unused signal declarations                |
| `pyreon/no-signal-call-write`  | error    | No      | Flags `sig(value)` write attempts on signals      |

### JSX (11)

| Rule                            | Severity | Fixable | Description                                |
| ------------------------------- | -------- | ------- | ------------------------------------------ |
| `pyreon/no-map-in-jsx`          | warn     | No      | Prefer `<For>` over .map() in JSX          |
| `pyreon/use-by-not-key`         | error    | Yes     | Use `by` not `key` on `<For>`              |
| `pyreon/no-classname`           | error    | Yes     | Use `class` not `className`                |
| `pyreon/no-htmlfor`             | error    | Yes     | Use `for` not `htmlFor`                    |
| `pyreon/no-onchange`            | warn     | Yes     | Prefer `onInput` over `onChange` on inputs |
| `pyreon/no-ternary-conditional` | warn     | No      | Prefer `<Show>` over ternary with JSX      |
| `pyreon/no-and-conditional`     | warn     | No      | Prefer `<Show>` over `&&` with JSX         |
| `pyreon/no-index-as-by`         | warn     | No      | Don't use index as `by` prop               |
| `pyreon/no-missing-for-by`      | warn     | No      | `<For>` should have `by` prop              |
| `pyreon/no-props-destructure`   | error    | No      | Don't destructure component props          |
| `pyreon/no-children-access`     | info     | No      | Direct props.children access in renderers  |

### Lifecycle (5)

| Rule                                    | Severity | Fixable | Description                              |
| --------------------------------------- | -------- | ------- | ---------------------------------------- |
| `pyreon/no-missing-cleanup`             | warn     | No      | onMount with timers needs cleanup return |
| `pyreon/no-mount-in-effect`             | warn     | No      | Don't call onMount inside effect         |
| `pyreon/no-effect-in-mount`             | info     | No      | effect() inside onMount is unusual       |
| `pyreon/no-dom-in-setup`                | warn     | No      | DOM queries outside onMount/effect       |
| `pyreon/no-imperative-effect-on-create` | warn     | No      | Imperative work in effect() at setup     |

### Performance (4)

| Rule                              | Severity | Fixable | Description                                |
| --------------------------------- | -------- | ------- | ------------------------------------------ |
| `pyreon/no-large-for-without-by`  | error    | No      | `<For>` must have `by` for reconciliation  |
| `pyreon/no-effect-in-for`         | warn     | No      | Don't create effects inside `<For>`        |
| `pyreon/no-eager-import`          | info     | No      | Lazy-load heavy packages                   |
| `pyreon/prefer-show-over-display` | info     | No      | Use `<Show>` instead of CSS display toggle |

### SSR (3)

| Rule                            | Severity | Fixable | Description                         |
| ------------------------------- | -------- | ------- | ----------------------------------- |
| `pyreon/no-window-in-ssr`       | error    | No      | Browser globals outside safe scopes |
| `pyreon/no-mismatch-risk`       | warn     | No      | Non-deterministic calls in JSX      |
| `pyreon/prefer-request-context` | warn     | No      | Module-level state in server files  |

### Architecture (5)

| Rule                             | Severity | Fixable | Description                        |
| -------------------------------- | -------- | ------- | ---------------------------------- |
| `pyreon/no-circular-import`      | error    | No      | Enforce package layer order        |
| `pyreon/no-deep-import`          | warn     | No      | No @pyreon/\*/src/ imports         |
| `pyreon/no-cross-layer-import`   | error    | No      | Core can't import ui-system        |
| `pyreon/dev-guard-warnings`      | error    | No      | console.warn/error needs `__DEV__` |
| `pyreon/no-error-without-prefix` | warn     | Yes     | Errors need [Pyreon] prefix        |

### Store (3)

| Rule                               | Severity | Fixable | Description                      |
| ---------------------------------- | -------- | ------- | -------------------------------- |
| `pyreon/no-store-outside-provider` | warn     | No      | Store hooks need provider in SSR |
| `pyreon/no-mutate-store-state`     | warn     | No      | Use actions, not direct .set()   |
| `pyreon/no-duplicate-store-id`     | error    | No      | Unique defineStore() IDs         |

### Form (3)

| Rule                                  | Severity | Fixable | Description                         |
| ------------------------------------- | -------- | ------- | ----------------------------------- |
| `pyreon/no-unregistered-field`        | warn     | No      | useField() without register()       |
| `pyreon/no-submit-without-validation` | warn     | No      | useForm onSubmit without validators |
| `pyreon/prefer-field-array`           | info     | No      | signal([]) in form files            |

### Styling (4)

| Rule                               | Severity | Fixable | Description                    |
| ---------------------------------- | -------- | ------- | ------------------------------ |
| `pyreon/no-inline-style-object`    | warn     | No      | Inline style objects in JSX    |
| `pyreon/no-dynamic-styled`         | warn     | No      | styled() inside functions      |
| `pyreon/prefer-cx`                 | info     | No      | Use cx() for class composition |
| `pyreon/no-theme-outside-provider` | warn     | No      | useTheme() without provider    |

### Hooks (3)

| Rule                             | Severity | Fixable | Description            |
| -------------------------------- | -------- | ------- | ---------------------- |
| `pyreon/no-raw-addeventlistener` | info     | No      | Use useEventListener() |
| `pyreon/no-raw-setinterval`      | info     | No      | Wrap timers in onMount |
| `pyreon/no-raw-localstorage`     | info     | No      | Use useStorage()       |

### Accessibility (3)

| Rule                  | Severity | Fixable | Description                          |
| --------------------- | -------- | ------- | ------------------------------------ |
| `pyreon/toast-a11y`   | warn     | No      | Toast components need role/aria-live |
| `pyreon/dialog-a11y`  | warn     | No      | `<dialog>` needs aria-label          |
| `pyreon/overlay-a11y` | warn     | No      | `<Overlay>` needs role/aria-label    |

## Presets

| Preset        | Description                          |
| ------------- | ------------------------------------ |
| `recommended` | All rules at default severity        |
| `strict`      | All warnings promoted to errors      |
| `app`         | Recommended minus library-only rules |
| `lib`         | Strict plus architecture checks      |

## Rule Options

Every rule entry in your config accepts either a bare severity or a `[severity, options]` tuple — ESLint-style. The tuple form lets you pass per-rule options without a bespoke API per rule.

```json
// .pyreonlintrc.json
{
  "$schema": "./node_modules/@pyreon/lint/schema/pyreonlintrc.schema.json",
  "preset": "recommended",
  "rules": {
    "pyreon/no-window-in-ssr": "error",
    "pyreon/no-raw-addeventlistener": [
      "info",
      { "exemptPaths": ["packages/core/runtime-dom/", "src/foundation/"] }
    ]
  }
}
```

The `$schema` reference enables IDE autocomplete + validation when editing the config — VSCode, IntelliJ, Zed, and the LSP all pick it up automatically.

**Convention: `exemptPaths`.** Rules that support path-based exemption read `options.exemptPaths: string[]`. Each entry is a substring match against the file path. Missing or empty → no exemptions. Rules currently supporting `exemptPaths`:

- `pyreon/no-window-in-ssr` — packages that are DOM-only (no SSR scenario)
- `pyreon/no-raw-addeventlistener` — packages implementing `useEventListener` / event delegation
- `pyreon/no-raw-setinterval` — packages implementing `useInterval` / `useTimeout`
- `pyreon/no-process-dev-gate` — server-only directories (Node environments)
- `pyreon/dev-guard-warnings` — server-only + demo / example directories
- `pyreon/require-browser-smoke-test` — packages explicitly opted out (e.g. experimental); also accepts `additionalPackages: string[]` to extend the browser-categorized list

**Validation.** Each rule declares its option shape in `meta.schema`. The runner validates user config once per `(rule, options)` pair:

- Unknown option keys → warning surfaced on `LintResult.configDiagnostics` (and stderr), rule stays enabled
- Wrong-typed values → error surfaced on `LintResult.configDiagnostics` (and stderr), rule disabled for that run
- Rules without a schema accept any options (no validation)

Programmatic consumers (CI dashboards, LSP, JSON reporters) read `result.configDiagnostics` alongside `result.files[].diagnostics`.

**CLI option overrides.** `--rule-options id='{json}'` passes JSON-encoded options to a specific rule from the command line — useful for one-off lint runs without editing the config file:

```bash
pyreon-lint --rule-options 'pyreon/no-window-in-ssr={"exemptPaths":["src/foundation/"]}' src/
```

## Custom Rules

```ts
import type { Rule } from '@pyreon/lint'

const myRule: Rule = {
  meta: {
    id: 'custom/my-rule',
    category: 'reactivity',
    description: 'My custom rule',
    severity: 'warn',
    fixable: false,
    // Optional: declare options shape. If present, the runner validates
    // user config against it. Supported types:
    //   'string' | 'string[]' | 'number' | 'boolean'
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    // Read options from user config (tuple form).
    const options = context.getOptions()
    // Or use the `isPathExempt` helper for the `exemptPaths` convention:
    //   import { isPathExempt } from '@pyreon/lint'
    //   if (isPathExempt(context)) return {}

    return {
      CallExpression(node) {
        context.report({
          message: 'Something is wrong',
          span: { start: node.start, end: node.end },
        })
      },
    }
  },
}
```

## License

MIT
