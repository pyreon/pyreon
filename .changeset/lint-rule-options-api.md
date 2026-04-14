---
"@pyreon/lint": minor
---

Per-rule options API — ESLint-style tuple form for rule config

- Rule entries now accept `Severity` OR `[Severity, RuleOptions]` — e.g.
  `"pyreon/no-window-in-ssr": ["error", { "exemptPaths": ["src/foundation/"] }]`.
  Bare-severity form continues to work.
- Rules that support path-based exemption read `options.exemptPaths: string[]` —
  currently `no-window-in-ssr`, `no-raw-addeventlistener`, `no-raw-setinterval`,
  `no-process-dev-gate`, `dev-guard-warnings`.
- `RuleContext` gains `getOptions(): RuleOptions`.
- `RuleMeta` gains optional `schema: Record<string, 'string' | 'string[]' | 'number' | 'boolean'>`.
  Runner validates user config once per `(rule, options)` pair: wrong-typed
  values disable the rule + emit an error; unknown option keys emit a warning;
  rules without a schema accept any options.
- Validation messages surface in `LintResult.configDiagnostics` (new field)
  in addition to stderr, so programmatic consumers / LSP / CI see them.
- `.pyreonlintrc.json` entries can use the tuple form; a shipped JSON Schema
  (`schema/pyreonlintrc.schema.json`) gives IDE autocomplete + validation when
  referenced via `$schema`.
- CLI: `--rule id=severity` still works; new `--rule-options id='{...}'`
  passes JSON-encoded options to a specific rule from the command line.
- New exported helpers: `isPathExempt(context)` (reads `options.exemptPaths`)
  and `isTestFile(filePath)` (universal `*.test.*` / `/tests/` matcher).
- `utils/package-classification.ts` renamed to `utils/file-roles.ts` (the
  monorepo-specific pattern arrays moved to the consuming project's config
  via `exemptPaths`).
