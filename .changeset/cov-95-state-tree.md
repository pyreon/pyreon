---
"@pyreon/state-tree": patch
---

test(state-tree): cover applyPatch error paths to lift coverage 94.98% → 96.55%

Adds 7 focused tests for the validation throw branches in
`applyPatch` (patch.ts lines 109, 114, 122, 126, 129, 133, 142, 147)
that previously had no coverage:

- unsupported op
- empty path
- reserved property name (intermediate segment) via `__proto__`
- unknown intermediate state key
- intermediate segment is not a nested model instance
- reserved property at final segment
- unknown final state key

All 7 tests assert the documented error messages, so a future refactor
that silently changes the messaging will fail the test.

Lifts `state-tree` statements 94.98% → 96.55%; threshold bumped 94 → 95
to lock in the actuals.

Part of the user-approved "whole-repo coverage ≥ 95%" incremental plan.
Tier 2 follow-up: charts, elements, hooks, hotkeys, lint, router each
within 1pt of 95 — addressed in separate PRs.
