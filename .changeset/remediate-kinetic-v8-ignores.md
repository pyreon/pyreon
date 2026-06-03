---
"@pyreon/kinetic": patch
---

test(kinetic): remove cosmetic v8-ignore annotations; honest threshold

Removes the 23 `/* v8 ignore */` annotations introduced in PR #1298 across 9 files. The pre-cosmetic baseline was already strong at 91.15% branches — the v8-ignores existed only to lift the gate to 95%, not to cover real-test gaps.

Coverage trajectory:
- Pre-PR-1298 baseline: 91.15% branches (real tests, no annotations)
- PR #1298 (cosmetic): 95.38% via v8-ignores (gaming the gate)
- Now: 91.15% branches via removal (no real-test change — baseline was honest)

Threshold lowered from 95 → 91 with documented rationale. The remaining 40 uncov branches are optional-CSS-property fallbacks and animation-lifecycle defensive guards (config.leaveStyle, config.enterTransition, ref-null during onEnd) reached only under very specific timing + config permutations. The real-Chromium e2e suite at `e2e/ui-showcase-regression.spec.ts` exercises these in a real browser; vitest measures the unit-test-process coverage only.

Reaching 95% would require either v8-ignores (gaming) or a combinatorial test matrix that doesn't scale to the maintenance cost.
