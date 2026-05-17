---
'@pyreon/reactivity': patch
---

Coverage-harden `@pyreon/reactivity` — close the RED coverage gate on the foundation package.

**Finding (measured, not speculative).** `@pyreon/reactivity` — the package every other Pyreon package transitively depends on (signal / computed / effect / batch) — had drifted **below its own enforced coverage threshold**: branches at **87.38%**, under the 90% global threshold that `@vitus-labs/tools-vitest`'s `createVitestConfig()` sets. The package's own `bun run test` was exiting **non-zero** (`ERROR: Coverage for branches (87.38%) does not meet global threshold (90%)`). The previously-documented invariant "All packages maintain >95% on all 4 metrics" was doubly inaccurate: the enforced gate is 90% (not 95%), and reactivity wasn't even at 90%. Untested branches in the reactivity core are the single highest-leverage release-stability risk in the monorepo.

**No bug found.** Every uncovered region was a genuine untested edge case in *correct* code — error-handler branches (throwing computed / throwing inner-effect disposal), the batching-vs-inline dual notify paths, the `setSnapshotCapture` DI-hook restore branch, multi-dependency `renderEffect` cleanup, `Cell` single→Set listener promotion, `createSelector` bucket-notify branches, and `reactive-trace`'s `preview()` value-shape matrix (arrays / named instances / >4-key objects / unstringifiable revoked-Proxy / long-string truncation). This is coverage hardening + a doc-accuracy correction, NOT a fix PR — so the bisect-verify mandate (revert fix → assert failure) does not apply; there is no fix to revert. Each of the 16 added tests asserts real observable behaviour (notify ordering, recovered-after-throw values, restore-call sequencing), not coverage-gaming shape.

**Result.** `packages/core/reactivity/src/tests/coverage-hardening.test.ts` (+16 tests). Reactivity coverage moved **statements 94.64 → 96.47 · branches 87.38 → 90.76 · functions 95.48 → 97.74 · lines 95.94 → 97.62**; all 4 metrics now ≥90%, `bun run test` **exits 0** (gate GREEN). 311/311 reactivity tests pass.

**Doc-hygiene (same PR, per continuous-learning).** `.claude/rules/testing.md`'s "All packages maintain >95% on all 4 metrics" line was false on both counts; corrected to state the *real enforced contract* (90% global threshold = the blocking gate; >95% is the aspiration, not a guaranteed invariant) with the reactivity drift as the worked example.

**Known remaining (deliberate, tracked follow-ups — not silently dropped):**
- `tracking.ts` 72-73 (the `cleanupEffect` WeakMap `effectDeps` branch) appears genuinely **unreachable** in the current codebase — both `effect` and `computed` always set a deps-collector around `withTracking`, so `trackSubscriber` never takes the WeakMap path. That is a *suspected-dead-code* finding that needs its own rigorous reachability proof + removal PR ("understand before changing" / "one concern per PR") — not something to rip out of framework infrastructure inside a coverage PR.
- `batch.ts` 104-116 (the `MAX_PASSES` infinite-re-enqueue dev guard) is exercised by a test that passes in isolation but is global-batch-state-fragile across the full suite; a deterministic, non-flaky cover for it is a separate hardening task (a flaky test is worse than an uncovered defensive `__DEV__` branch).
- Other packages were not surveyed for coverage drift in this PR — scope was deliberately bounded to the one package whose gate was RED. A monorepo-wide coverage-drift sweep is a worthwhile separate effort.
