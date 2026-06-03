---
"@pyreon/lint": patch
---

test(lint): add 10 real tests for runner.ts applyFixes + lintFile contracts

10 new tests in `branch-coverage-real.test.ts` covering:
- `applyFixes` empty-diagnostics fast path (line 254)
- single-fix application
- multi-fix reverse-order offset preservation
- mixed fixable + non-fixable diagnostic handling
- `lintFile` basic surface (clean file, empty rules, .tsx, .js, .d.ts skip)

Branches lifted 90.32% → 90.47% via real tests.
