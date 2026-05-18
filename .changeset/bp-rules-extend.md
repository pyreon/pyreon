---
'@pyreon/lint': minor
---

feat(lint): autofix `query-options-as-function` + extend best-practice rules to i18n & router (76 rules / 17 cat)

Follow-up to #632 (extend more libraries + autofix the mechanically-safe ones).

- **`pyreon/query-options-as-function` is now auto-fixable** (`--fix`): the
  options object literal is wrapped in `() => (...)` (pure syntactic
  thunk; the intended reactivity fix, no other behavior change).
- **New opt-in rule `pyreon/i18n-prefer-trans-for-rich-jsx`** (`i18n`
  category — new; severity `info`; dep-gated `@pyreon/i18n`): flags
  `{t('…')}` interleaved with JSX element siblings (rich content) —
  use `<Trans>`. Zero-FP: a single element's children-array check;
  plain-text `{t('title')}` never fires.
- **New opt-in rule `pyreon/prefer-typed-search-params`** (`router`
  category; severity `info`; dep-gated `@pyreon/router`): manual
  `new URLSearchParams(...)` in a router-aware file → use
  `useTypedSearchParams()`. Zero-FP: literal `new URLSearchParams` +
  in-file `@pyreon/router` import.

Both new rules follow the #632 contract: `meta.optIn: true` (off in
`recommended`/`strict`/`app`/`lib`; enabled by the `best-practices`
preset or per-rule config), `package.json` dependency auto-detection,
`exemptPaths`, prescriptive AI-actionable messages. `RuleCategory` gains
`'i18n'`. Backward-compatible (opt-in default = no behavior change).

Bisect-verified per rule + per autofix; `@pyreon/lint` 595 tests pass
(incl. updated count/category/opt-in-set meta-tests + a new
`bp-extend-rules.test.ts`). Docs (CLAUDE.md, lint.md, README,
anti-patterns.md, manifest) updated.
