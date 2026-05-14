/**
 * Barrel export for all programmatic doctor gates.
 *
 * Each gate exports a `run<Name>Gate(opts): Promise<GateResult>` function.
 * PR 2's aggregation layer iterates a curated list of these to produce
 * the unified `DoctorReport`; consumers can also import individual gates
 * for standalone use (the existing `scripts/check-*.ts` wrappers do this).
 */

export {
  runAuditTypesGate,
  type AuditTypesGateOptions,
} from './audit-types'
export {
  runBundleBudgetsGate,
  type BundleBudgetsGateOptions,
} from './bundle-budgets'
export {
  runDistributionGate,
  type DistributionGateOptions,
} from './distribution'
export {
  runDocClaimsGate,
  type DocClaimsGateOptions,
} from './doc-claims'
