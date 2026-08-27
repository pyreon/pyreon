---
'@pyreon/lint': minor
'@pyreon/cli': patch
---

Rule-set restructure: remove a duplicate rule that reported every defect twice, stop shipping this repo's own conventions to consumers, and make "why isn't this rule firing?" answerable.

**A duplicate rule shipped.** `pyreon/no-large-for-without-by` and `pyreon/no-missing-for-by` had byte-identical implementations — same visitor, same condition, same message string — under different ids, categories and severities. Both fired, so one `<For>` without a `by` prop produced two diagnostics at the same span with the same text, one `warning` and one `error`, disagreeing about how bad it is. The `performance` copy is deleted; `no-missing-for-by` survives and is promoted `warn` → `error`, which is the severity the deleted rule carried — keeping `warn` would have silently weakened the gate. Verified zero violations across `packages/`, `examples/` and `docs/`.

**Breaking (lint config):**

- `pyreon/no-large-for-without-by` no longer exists — remove it from `.pyreonlintrc.json`. Not aliased, per the pre-1.0 no-shims policy.
- `pyreon/no-missing-for-by` is now `error`.
- `pyreon/no-querySelector-cast-in-test` → `pyreon/no-query-selector-cast-in-test` (camelCase inside a kebab id is malformed, not a style choice).
- Six rules no longer ship on. See below.
- Rule count 99 → 98; `performance` category 6 → 5.

**Monorepo-scoped rules stop shipping to consumers.** Six rules encode the Pyreon *repository* rather than Pyreon the framework, and all six were on — several at `error` — in the presets a consumer selects. The split is drawn by measurement: these are exactly the rules whose source hardcodes an `@pyreon/*` specifier or a `packages/<layer>/` path — `no-circular-import`, `no-cross-layer-import`, `no-error-without-prefix`, `no-query-selector-cast-in-test`, `require-browser-smoke-test`, `vitest-config-uses-shared`. `dev-guard-warnings` hardcodes neither and is a genuine library-author rule, so it stays. New `RuleMeta.scope: 'framework' | 'monorepo'`; every shipped preset forces monorepo rules off, `best-practices` included, and `lib` stops promoting four of them to `error`. The Pyreon repo re-enables them by id in its own config, which makes that dependency visible instead of hidden in a shared preset.

**`pyreon-lint --why-off <rule>`.** A rule can be silently inert for four independent reasons, three of them invisible in config: `severity-off`, `opt-in`, `monorepo-scope`, `dependency-missing`. They compose, so a rule is often off for several at once and fixing one changes nothing. `--why-off` reports every reason that applies with the specific edit that lifts it, takes a bare or namespaced id, exits non-zero on an unknown rule with a did-you-mean, and surfaces configured `exemptPaths`. Exported programmatically as `explainRuleState` / `formatRuleState`. New `RuleMeta.requiresDependency` declares the dependency gate that previously lived only inside each rule body, with a test asserting the declaration matches the call the source makes.

**AST walks no longer follow `parent`.** Six rules hand-rolled a recursive walk that descends into anything holding a `.type` — including a `parent` back-reference, which climbs back up the tree and recurses until the stack blows. New `walkSubtree` helper driven by oxc's exported `visitorKeys`; measured across 2,994,091 nodes of this repo it reaches every typed child link except `Program.hashbang`, which has no children, and a test pins that premise. Two stateless walkers migrate onto it; the two that thread state through the recursion keep their own walk and gain the `parent` exclusion, since restructuring them to fit a generic helper would risk changing what they detect.

**One new autofix.** `no-signal-call-write` fixes `count(5)` → `count.set(5)`, gated on exactly one non-function argument — `sig(prev => …)` reads as update intent and `.set(fn)` would store the function as the value. `no-peek-in-tracked` deliberately gets no fixer: `.peek()` in a tracked scope is often intentional loop-prevention, and rewriting it would turn "skip writes during a write" into an infinite loop.

**A gate hole (`@pyreon/cli`).** `doc-claims` checked the rule count against CLAUDE.md, both READMEs, `docs/lint.md` and the manifest — but not `packages/tools/lint/package.json`, the published npm description and the first count a consumer sees. It had drifted to "56 rules" against an actual 98. That file and `.claude/rules/code-style.md` (stale at 97) are now covered; 33 claim sites, up from 30.

**Prevents recurrence.** `rule-registry.test.ts` lints a corpus with every rule enabled and fails if two rule ids ever emit an identical message at an identical span, so a future duplicate cannot land quietly. It also asserts id uniqueness, that no rule object is registered twice, strict kebab-case with no allowlist, that monorepo-scoped rules stay off in every shipped preset, and that ids matching an upstream ESLint name (`anchor-is-valid`, `no-autofocus`) are never renamed away from it.
