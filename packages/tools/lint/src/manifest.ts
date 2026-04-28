import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/lint',
  title: 'Pyreon-specific Linter',
  tagline:
    'Pyreon-specific linter — 61 rules across 12 categories, config files, watch mode, AST cache, CLI + LSP',
  description:
    'Pyreon-specific lint rules powered by `oxc-parser`. Covers reactivity (11), JSX (11), lifecycle (5), performance (4), SSR (3), architecture (7), store (3), form (3), styling (4), hooks (3), accessibility (3), router (4) — 61 rules total. Programmatic API (`lint`, `lintFile`), CLI (`pyreon-lint`), watch mode (fs.watch + 100ms debounce + AstCache), LSP server, and `.pyreonlintrc.json` config with per-rule options via ESLint-style tuple form. Notable rules: `pyreon/no-process-dev-gate` (auto-fixable; replaces dead-in-browser `typeof process` gates with `import.meta.env?.DEV`), `pyreon/require-browser-smoke-test` (locks in T1.1 browser-test durability).',
  category: 'server',
  features: [
    '61 rules across 12 categories',
    'lint(options) programmatic API + lintFile() low-level entry',
    'CLI: pyreon-lint with --preset / --fix / --watch / --format / --rule-options',
    '4 presets: recommended, strict, app, lib',
    'Per-rule options via tuple form in config or `--rule-options id=\'{json}\'`',
    'AstCache (FNV-1a hash) for repeat runs',
    'LSP server for IDE integration (startLspServer)',
    'Inline suppression: // pyreon-lint-ignore <rule> OR // pyreon-lint-disable-next-line <rule>',
  ],
  longExample: `import { lint, lintFile, allRules, getPreset, AstCache } from '@pyreon/lint'

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
//   pyreon-lint --list                                     # list all 61 rules
//   pyreon-lint --rule-options 'pyreon/no-window-in-ssr={"exemptPaths":["src/foundation/"]}' src/`,
  api: [
    {
      name: 'lint',
      kind: 'function',
      signature: 'lint(options?: LintOptions): LintResult',
      summary:
        '61 rules across 12 categories. Auto-loads `.pyreonlintrc.json`. Presets: `recommended`, `strict`, `app`, `lib`. Per-rule options via tuple form in config (`["error", { exemptPaths: [...] }]`) or `ruleOptionsOverrides`. Wrong-typed options surface on `result.configDiagnostics`. Uses `oxc-parser` with AST caching.',
      example: `import { lint } from "@pyreon/lint"

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
})`,
      seeAlso: ['lintFile', 'getPreset', 'AstCache'],
    },
    {
      name: 'lintFile',
      kind: 'function',
      signature:
        'lintFile(filePath: string, sourceText: string, rules: Rule[], config: LintConfig, cache?: AstCache, configDiagnosticsSink?: ConfigDiagnostic[]): LintFileResult',
      summary:
        'Low-level single-file API. Optional `AstCache` for repeat runs (FNV-1a hash keyed). Optional `configDiagnosticsSink` collects malformed-option diagnostics; without it they print to stderr.',
      example: `import { lintFile, allRules, getPreset, AstCache } from "@pyreon/lint"

const cache = new AstCache()
const config = getPreset("recommended")
const configSink: ConfigDiagnostic[] = []
const result = lintFile("app.tsx", source, allRules, config, cache, configSink)`,
      seeAlso: ['lint', 'AstCache'],
    },
    {
      name: 'cli',
      kind: 'function',
      signature:
        "pyreon-lint [--preset name] [--fix] [--format text|json|compact] [--quiet] [--watch] [--list] [--config path] [--ignore path] [--rule id=severity] [--rule-options id='{json}'] [path...]",
      summary:
        "CLI entry. Config: `.pyreonlintrc.json` (reference `schema/pyreonlintrc.schema.json` for IDE autocomplete) or `package.json`'s `'pyreonlint'` field. Ignore: `.pyreonlintignore` + `.gitignore`. Watch: `fs.watch` recursive with 100ms debounce. `--rule-options id='{json}'` passes per-rule options on a single run.",
      example: `pyreon-lint --preset strict --quiet    # CI mode
pyreon-lint --fix                       # auto-fix
pyreon-lint --watch src/                # watch mode
pyreon-lint --list                      # list all 61 rules
pyreon-lint --format json               # machine-readable
pyreon-lint --rule-options 'pyreon/no-window-in-ssr={"exemptPaths":["src/foundation/"]}' src/`,
      seeAlso: ['lint'],
    },
    {
      name: 'no-process-dev-gate',
      kind: 'constant',
      signature: 'rule: pyreon/no-process-dev-gate (architecture, error, auto-fixable)',
      summary:
        "The `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` pattern works in vitest (Node, `process` is defined) but is silently dead code in real Vite browser bundles because Vite does NOT polyfill `process` for the client. Every `console.warn` gated on the broken constant never fires for real users in dev mode — unit tests pass while users get nothing. Use `import.meta.env.DEV` instead — Vite/Rolldown literal-replace it at build time, prod tree-shakes the warning to zero bytes, and vitest sets it to `true` automatically. Server-only packages (`zero`, `core/server`, `core/runtime-server`, `vite-plugin`, `cli`, `lint`, `mcp`, `storybook`, `typescript`) and test files are exempt. Reference implementation: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`. The rule has an auto-fix that replaces the broken expression with `import.meta.env?.DEV === true`.",
      example: `// ❌ Wrong — dead code in real Vite browser bundles
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
if (__DEV__) console.warn('hello')

// ✅ Correct — Vite literal-replaces import.meta.env.DEV at build time
// @ts-ignore — provided by Vite/Rolldown at build time
const __DEV__ = import.meta.env?.DEV === true
if (__DEV__) console.warn('hello')`,
      mistakes: [
        "Copying the `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` pattern from existing codebases — it works in Node but is dead in browser bundles",
        "Trying to test with `delete globalThis.process` — vitest's own `import.meta.env` depends on `process`, so deleting it breaks the FIXED gate too (not because the gate is wrong, but because vitest can't resolve it)",
        'Adding `process: { env: { ... } }` polyfills to vite.config.ts as a workaround — fix the source instead',
        "Using the rule for server-only packages — they're correctly exempt because Node always has `process`",
      ],
      seeAlso: ['require-browser-smoke-test'],
    },
    {
      name: 'require-browser-smoke-test',
      kind: 'constant',
      signature:
        'rule: pyreon/require-browser-smoke-test (architecture, error in recommended/strict/lib, off in app)',
      summary:
        "Locks in the durability of the T1.1 browser smoke harness (PRs #224, #227, #229, #231). Every browser-categorized package MUST ship at least one `*.browser.test.{ts,tsx}` file under `src/`. Without this rule, new browser packages can quietly ship without smoke coverage and we drift back to the world before T1.1 — happy-dom silently masks environment-divergence bugs (PR #197 mock-vnode metadata drop, PR #200 `typeof process` dead code, multi-word event delegation bug). Default browser-package list mirrors `.claude/rules/test-environment-parity.md`. The rule fires once per package on its `src/index.ts`, walks the package directory looking for `*.browser.test.*`, and reports if none are found. Off in `app` preset because apps don't ship as packages with smoke obligations.",
      example: `// Per-package config (optional — defaults cover all known browser packages)
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
}`,
      mistakes: [
        'Adding a new browser-running package without a browser test — the rule will fail your PR',
        'Hardcoding the browser-package list in the rule — the list lives in `.claude/rules/browser-packages.json` (single source of truth), not in the rule source',
        'Disabling the rule globally — use `exemptPaths` to exempt specific packages still under construction',
        'Shipping a `sanity.browser.test.ts` with `expect(1).toBe(1)` just to satisfy the rule — it passes but provides zero signal. The rule is a GATE, not a quality check; review actual contents on PR',
      ],
      seeAlso: ['no-process-dev-gate'],
    },
  ],
})
