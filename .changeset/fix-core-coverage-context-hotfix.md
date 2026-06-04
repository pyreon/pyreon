---
"@pyreon/core": patch
---

fix(core): unblock Coverage (Full) — add 7 tests for owner-based context (#1338)

PR #1338's owner-based context refactor consolidated 600 lines into 250 but
the new arms (owner-present branches in `provide` / `withContext`, the
`setSnapshotCapture` round-trip, defensive `popContext` / `removeContextFrame`
when stack is empty / frame missing) had no direct unit coverage. `@pyreon/core`
fell to 94.74% statements + 93.51% functions, failing both the package
threshold and unblocking nobody's PR.

This hotfix adds `context-coverage.test.ts` with 7 specs:
- `withContext` owner-present path (lines 211-214)
- `provide` owner-present path (lines 197-198)
- `withContext` no-owner SSR fallback throws-and-pops correctly
- `popContext` no-op when stack is empty (defensive arm)
- `removeContextFrame` no-op when frame not on stack (lastIndexOf -1)
- `removeContextFrame` finds + removes by identity (the load-bearing path)
- SSR-style nested push/pop walks correctly

Coverage delta:
- statements 94.74% → 96.10% ✅
- functions 93.51% → 94.44% ✅
- branches 93.11% → 94.01%
- lines 96.16% → 97.51%
