---
'@pyreon/cli': minor
---

Foundation for `pyreon doctor` v2 — unified gate API + 4 programmatic gates.

Introduces a shared `Finding` + `GateResult` shape (`packages/tools/cli/src/doctor/types.ts`) every doctor gate emits, and extracts four standalone-script gates as programmatic functions so the follow-up aggregator can produce a unified `DoctorReport` with per-category subscores + an overall 0-100 health score:

- `runDistributionGate({ cwd })` — pure-function port of `scripts/check-distribution.ts`. Emits `distribution/missing-sideEffects`, `distribution/missing-map-exclusion`, `distribution/tarball-contains-map` findings under `category: 'architecture'`.
- `runDocClaimsGate({ cwd })` — pure-function port of `scripts/check-doc-claims.ts`. Emits `doc-claims/<check>-drift` / `-hedged` / `-pattern-miss` / `-file-missing` findings under `category: 'documentation'`.
- `runAuditTypesGate({ cwd })` — subprocess adapter over `scripts/audit-types.ts --json --all`. Maps HIGH/MEDIUM/LOW script severities onto `error`/`warning`/`info` and emits `audit-types/typed-but-unimplemented-<severity>` under `category: 'architecture'`. The script is 476 lines of mature AST-walking logic; the adapter shape keeps this PR tractable while letting the aggregator consume the same `Finding[]` as the other gates.
- `runBundleBudgetsGate({ cwd })` — subprocess adapter over `scripts/check-bundle-budgets.ts --json`. Emits `bundle-budgets/over-budget`, `bundle-budgets/missing-budget`, `bundle-budgets/bundle-failed` under `category: 'performance'`. Slowest gate by a wide margin (~15-30s); doctor's follow-up `--full` flag is what enables it.

The standalone scripts (`scripts/check-distribution.ts`, `scripts/check-doc-claims.ts`) are now thin CLI wrappers that delegate to the gate functions and preserve their historical JSON output shape (`{ violations, totalPackages }` / `{ drifts }`) for backward compat with any CI consumers parsing the output.

No behavior change for CI gates or end users in this PR — this is foundation work for the upcoming `pyreon doctor` v2 aggregation + scoring + beautiful CLI output.
