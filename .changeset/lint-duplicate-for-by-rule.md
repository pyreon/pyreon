---
'@pyreon/lint': minor
'@pyreon/cli': patch
---

Remove `pyreon/no-large-for-without-by`, a byte-identical duplicate of `pyreon/no-missing-for-by` that made one defect report twice.

The two rules shipped the same visitor, the same condition and the same message string under different ids, categories and severities. A single `<For>` without a `by` prop therefore produced **two diagnostics at the same span with the same text** — one `warning` from `jsx/no-missing-for-by` and one `error` from `performance/no-large-for-without-by`, contradicting each other on how bad it is.

**Breaking (lint config):**

- `pyreon/no-large-for-without-by` no longer exists. Remove it from `.pyreonlintrc.json`; it is not aliased, per the pre-1.0 no-shims policy.
- `pyreon/no-missing-for-by` is promoted `warn` → `error`. It absorbed the deleted rule's severity so the gate is not silently weakened — the `error` half is the one that was enforcing this. Verified zero violations across `packages/`, `examples/` and `docs/`, so no existing code newly fails.

The rule count moves 99 → 98 and the `performance` category 6 → 5.

**Prevents recurrence.** `src/tests/rule-registry.test.ts` locks the class rather than the instance: it lints a corpus with every rule enabled and fails if two different rule ids ever emit an identical message at an identical span, so a future duplicate cannot be added silently. It also asserts every rule id is unique, that no rule object is registered twice in `allRules`, and pins `no-querySelector-cast-in-test` as the single known deviation from the `pyreon/<kebab-case>` id shape so that list can only shrink.

**Closes a gate hole (`@pyreon/cli`).** The `doc-claims` gate checked the lint rule count against CLAUDE.md, both READMEs, `docs/lint.md` and the manifest — but not `packages/tools/lint/package.json`, which is the published npm description and the first count a consumer sees. It had drifted to "56 rules" against an actual 98 and no gate noticed. That file and `.claude/rules/code-style.md` (stale at 97) are now covered; the gate checks 33 claim sites, up from 30.
