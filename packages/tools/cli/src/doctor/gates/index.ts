/**
 * Barrel export for all programmatic doctor gates.
 *
 * Each gate exports a `run<Name>Gate(opts): Promise<GateResult>` function.
 * The aggregator iterates a curated list of these to produce the
 * unified `DoctorReport`; consumers can also import individual gates
 * for standalone use (the existing `scripts/check-*.ts` wrappers do this).
 */

export { runAuditLeakClassesGate, type AuditLeakClassesGateOptions } from './audit-leak-classes'
export { runAuditTypesGate, type AuditTypesGateOptions } from './audit-types'
export { runBundleBudgetsGate, type BundleBudgetsGateOptions } from './bundle-budgets'
export { runDistributionGate, type DistributionGateOptions } from './distribution'
export { runDocClaimsGate, type DocClaimsGateOptions } from './doc-claims'
export { runReactPatternsGate, type ReactPatternsGateOptions } from './react-patterns'
export { runPyreonPatternsGate, type PyreonPatternsGateOptions } from './pyreon-patterns'
export { runAuditTestsGate, type AuditTestsGateOptions } from './audit-tests'
export { runIslandsAuditGate, type IslandsAuditGateOptions } from './islands-audit'
export { runSsgAuditGate, type SsgAuditGateOptions } from './ssg-audit'
export { runCheckDedupGate, type CheckDedupGateOptions } from './check-dedup'
export { runLintGate, type LintGateOptions } from './lint'
