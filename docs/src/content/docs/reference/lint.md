---
title: "Pyreon-specific Linter — API Reference"
description: "Pyreon-specific linter — 91 rules across 18 categories, config files, watch mode, AST cache, CLI + LSP"
---

# @pyreon/lint — API Reference

> **Generated** from `lint`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [lint](/docs/lint).

Pyreon-specific lint rules powered by `oxc-parser`. Covers reactivity (14), JSX (11), lifecycle (6), performance (6), SSR (4), architecture (10), store (3), form (4), styling (4), hooks (3), accessibility (3), router (5), SSG (3), frontend (11), query (1), rx (1), i18n (1), storage (1) — 91 rules total. Programmatic API (`lint`, `lintFile`), CLI (`pyreon-lint`), watch mode (fs.watch + 100ms debounce + AstCache), LSP server, and `.pyreonlintrc.json` config with per-rule options via ESLint-style tuple form. The `frontend`/`query`/`rx`/`i18n`/`storage` categories + the `form`/`router` opt-in rules are **opt-in best-practice rules** (`meta.optIn`): off in the `recommended`/`strict`/`app`/`lib` presets, enabled wholesale by the `best-practices` preset or per-rule config. Library-scoped opt-in rules auto-gate on the project’s `package.json` dependencies (a project that doesn’t use `@pyreon/query` never sees query rules). Notable rules: `pyreon/no-process-dev-gate` (auto-fixable), `pyreon/query-options-as-function` (auto-fixable — wraps the options object literal in `() => (...)`; also a proactive MCP `validate` detector), `pyreon/require-img-alt` / `pyreon/img-requires-dimensions` / `pyreon/no-discarded-optimize-fields` (a11y + CLS — the last flags a raw `<img src={x.src}>` that discards a `?optimize` descriptor), `pyreon/heading-order` (a11y — flags a skipped heading level), `pyreon/color-contrast` (a11y — literal-hex contrast pairs), `pyreon/i18n-prefer-trans-for-rich-jsx`, `pyreon/prefer-typed-search-params`.

## Features

- 91 rules across 18 categories
- lint(options) programmatic API + lintFile() low-level entry
- CLI: pyreon-lint with --preset / --fix / --watch / --format / --rule-options
- 4 presets: recommended, strict, app, lib
- Per-rule options via tuple form in config or `--rule-options id='{json}'`
- AstCache (FNV-1a hash) for repeat runs
- LSP server for IDE integration (startLspServer)
- Inline suppression: // pyreon-lint-ignore &lt;rule&gt; OR // pyreon-lint-disable-next-line &lt;rule&gt;

## Complete example

A full, end-to-end usage of the package:

```tsx
import { lint, lintFile, allRules, getPreset, AstCache } from '@pyreon/lint'

// Programmatic — typical CI usage
const result = lint({ paths: ['src/'], preset: 'recommended' })
console.log(result.totalErrors, result.totalWarnings)
for (const d of result.configDiagnostics) console.log(d.ruleId, d.message)

// Per-rule overrides on a single run
lint({
  paths: ['.'],
  ruleOverrides: { 'pyreon/no-classname': 'off' },
  ruleOptionsOverrides: {
    'pyreon/no-window-in-ssr': { exemptPaths: ['src/foundation/'] },
  },
})

// Low-level single-file API with AST cache (watch mode)
const cache = new AstCache()
const config = getPreset('recommended')
const fileResult = lintFile('app.tsx', source, allRules, config, cache)

// CLI
//   pyreon-lint --preset strict --quiet                    # CI mode
//   pyreon-lint --fix                                      # auto-fix
//   pyreon-lint --watch src/                               # watch mode
//   pyreon-lint --list                                     # list all 91 rules
//   pyreon-lint --rule-options 'pyreon/no-window-in-ssr={"exemptPaths":["src/foundation/"]}' src/
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`lint`](#lint) | function | 91 rules across 18 categories. |
| [`lintFile`](#lintfile) | function | Low-level single-file API. |
| [`cli`](#cli) | function | CLI entry. |
| [`no-process-dev-gate`](#no-process-dev-gate) | constant | The `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` pattern works in vitest (Node, `process` i |
| [`require-browser-smoke-test`](#require-browser-smoke-test) | constant | Locks in the durability of the T1.1 browser smoke harness (PRs #224, #227, #229, #231). |

## API

### lint `function`

```ts
lint(options?: LintOptions): LintResult
```

91 rules across 18 categories. Auto-loads `.pyreonlintrc.json`. Presets: `recommended`, `strict`, `app`, `lib`. Per-rule options via tuple form in config (`["error", { exemptPaths: [...] }]`) or `ruleOptionsOverrides`. Wrong-typed options surface on `result.configDiagnostics`. Uses `oxc-parser` with AST caching.

**Example**

```tsx
import { lint } from "@pyreon/lint"

const result = lint({ paths: ["src/"], preset: "recommended" })
console.log(result.totalErrors, result.totalWarnings)
// Config-level diagnostics (malformed rule options, etc.)
for (const d of result.configDiagnostics) console.log(d.ruleId, d.message)

// Severity overrides + per-rule options overrides
lint({
  paths: ["."],
  ruleOverrides: { "pyreon/no-classname": "off" },
  ruleOptionsOverrides: {
    "pyreon/no-window-in-ssr": { exemptPaths: ["src/foundation/"] },
  },
})
```

**See also:** `lintFile` · `getPreset` · `AstCache`

---

### lintFile `function`

```ts
lintFile(filePath: string, sourceText: string, rules: Rule[], config: LintConfig, cache?: AstCache, configDiagnosticsSink?: ConfigDiagnostic[]): LintFileResult
```

Low-level single-file API. Optional `AstCache` for repeat runs (FNV-1a hash keyed). Optional `configDiagnosticsSink` collects malformed-option diagnostics; without it they print to stderr.

**Example**

```tsx
import { lintFile, allRules, getPreset, AstCache } from "@pyreon/lint"

const cache = new AstCache()
const config = getPreset("recommended")
const configSink: ConfigDiagnostic[] = []
const result = lintFile("app.tsx", source, allRules, config, cache, configSink)
```

**See also:** `lint` · `AstCache`

---

### cli `function`

```ts
pyreon-lint [--preset name] [--fix] [--format text|json|compact] [--quiet] [--watch] [--list] [--config path] [--ignore path] [--rule id=severity] [--rule-options id='{json}'] [path...]
```

CLI entry. Config: `.pyreonlintrc.json` (reference `schema/pyreonlintrc.schema.json` for IDE autocomplete) or `package.json`'s `'pyreonlint'` field. Ignore: `.pyreonlintignore` + `.gitignore`. Watch: `fs.watch` recursive with 100ms debounce. `--rule-options id='{json}'` passes per-rule options on a single run.

**Example**

```tsx
pyreon-lint --preset strict --quiet    # CI mode
pyreon-lint --fix                       # auto-fix
pyreon-lint --watch src/                # watch mode
pyreon-lint --list                      # list all 91 rules
pyreon-lint --format json               # machine-readable
pyreon-lint --rule-options 'pyreon/no-window-in-ssr={"exemptPaths":["src/foundation/"]}' src/
```

**See also:** `lint`

---

### no-process-dev-gate `constant`

```ts
rule: pyreon/no-process-dev-gate (architecture, error, auto-fixable)
```

The `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` pattern works in vitest (Node, `process` is defined) but is silently dead code in real Vite browser bundles because Vite does NOT polyfill `process` for the client. Every `console.warn` gated on the broken constant never fires for real users in dev mode — unit tests pass while users get nothing. Use `import.meta.env.DEV` instead — Vite/Rolldown literal-replace it at build time, prod tree-shakes the warning to zero bytes, and vitest sets it to `true` automatically. Server-only packages (`zero`, `core/server`, `core/runtime-server`, `vite-plugin`, `cli`, `lint`, `mcp`, `storybook`, `typescript`) and test files are exempt. Reference implementation: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`. The rule has an auto-fix that replaces the broken expression with `import.meta.env?.DEV === true`.

**Example**

```tsx
// ❌ Wrong — dead code in real Vite browser bundles
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
if (__DEV__) console.warn('hello')

// ✅ Correct — Vite literal-replaces import.meta.env.DEV at build time
// @ts-ignore — provided by Vite/Rolldown at build time
const __DEV__ = import.meta.env?.DEV === true
if (__DEV__) console.warn('hello')
```

**Common mistakes**

- Copying the `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` pattern from existing codebases — it works in Node but is dead in browser bundles
- Trying to test with `delete globalThis.process` — vitest's own `import.meta.env` depends on `process`, so deleting it breaks the FIXED gate too (not because the gate is wrong, but because vitest can't resolve it)
- Adding `process: { env: { ... } }` polyfills to vite.config.ts as a workaround — fix the source instead
- Using the rule for server-only packages — they're correctly exempt because Node always has `process`

**See also:** `require-browser-smoke-test`

---

### require-browser-smoke-test `constant`

```ts
rule: pyreon/require-browser-smoke-test (architecture, error in recommended/strict/lib, off in app)
```

Locks in the durability of the T1.1 browser smoke harness (PRs #224, #227, #229, #231). Every browser-categorized package MUST ship at least one `*.browser.test.{ts,tsx}` file under `src/`. Without this rule, new browser packages can quietly ship without smoke coverage and we drift back to the world before T1.1 — happy-dom silently masks environment-divergence bugs (PR #197 mock-vnode metadata drop, PR #200 `typeof process` dead code, multi-word event delegation bug). Default browser-package list mirrors `.claude/rules/test-environment-parity.md`. The rule fires once per package on its `src/index.ts`, walks the package directory looking for `*.browser.test.*`, and reports if none are found. Off in `app` preset because apps don't ship as packages with smoke obligations.

**Example**

```tsx
// Per-package config (optional — defaults cover all known browser packages)
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

**Common mistakes**

- Adding a new browser-running package without a browser test — the rule will fail your PR
- Hardcoding the browser-package list in the rule — the list lives in `.claude/rules/browser-packages.json` (single source of truth), not in the rule source
- Disabling the rule globally — use `exemptPaths` to exempt specific packages still under construction
- Shipping a `sanity.browser.test.ts` with `expect(1).toBe(1)` just to satisfy the rule — it passes but provides zero signal. The rule is a GATE, not a quality check; review actual contents on PR

**See also:** `no-process-dev-gate`

---
