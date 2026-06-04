---
"@pyreon/compiler": patch
---

test(compiler): add 20 real branch-coverage tests; branches 84.63% → 85.34% (clears MINIMUM_BRANCH_FLOOR=85)

`branch-coverage-real.test.ts` covers uncov arms in 3 small-helper modules:

- **reactivity-lens.ts** (68.75% → 81.25%): `analyzeReactivity({ knownSignals })` truthy/falsy arms; `formatReactivityLens` code-badge branch (footgun vs no-code finding); parse-failure catch path
- **lpih.ts** (82.6% → 97.1%): `mergeFireDataIntoFindings` nullish rate1s + kind aggregation arms; `firesToCreationSiteFindings` same-line aggregation with lastFire flip + kind-undefined fallback; sort comparator column branch
- **test-audit.ts** (85.54% → 95.18%): `formatTestAudit` risk-level / singular-vs-plural arms (1 literal vs 2 literals, etc.), `importsH`-no-calls path, `describeRisk` low arm via `minRisk: 'low'`

Threshold lifted: branches 84 → 85 in `vitest.config.ts`. `BELOW_FLOOR_EXEMPTIONS` entry updated: `currentBranches: 84 → 85`. Compiler now clears `MINIMUM_BRANCH_FLOOR=85`; exemption persists for STATEMENTS only (92.65% vs floor 95).

Bisect-verified: with new file removed, branches fall to 84.63%, gate fails with `Coverage for branches (84.63%) does not meet global threshold (85%)`. Restored → 85.34%, gate passes.
