/**
 * audit-tests gate — wraps `@pyreon/compiler:auditTestEnvironment`.
 *
 * Catches mock-vnode test patterns (the PR #197 bug class — tests
 * that hand-construct `{ type, props, children }` literals or use a
 * `vnode()` helper instead of going through real `h()` from
 * `@pyreon/core`). Three risk tiers (HIGH / MEDIUM / LOW) from the
 * balance of mockVNodeLiteralCount + mockHelperCount +
 * mockHelperCallCount + realHCallCount + importsH. The adapter
 * maps tier → severity (high=error, medium=warning, low=info).
 */

import { auditTestEnvironment } from '@pyreon/compiler'
import type { AuditRisk } from '@pyreon/compiler'

import type { Finding, GateResult, Severity } from '../types'

const SEVERITY_BY_RISK: Record<AuditRisk, Severity> = {
  high: 'error',
  medium: 'warning',
  low: 'info',
}

export interface AuditTestsGateOptions {
  cwd: string
  /** Minimum risk to surface. Defaults to `'medium'`. */
  minRisk?: AuditRisk
}

const RISK_RANK: Record<AuditRisk, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

export const runAuditTestsGate = async (opts: AuditTestsGateOptions): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const minRisk = opts.minRisk ?? 'medium'
  const minRank = RISK_RANK[minRisk] ?? 0

  const result = auditTestEnvironment(opts.cwd)

  for (const entry of result.entries) {
    const rank = RISK_RANK[entry.risk] ?? 0
    if (rank < minRank) continue
    const severity = SEVERITY_BY_RISK[entry.risk] ?? 'warning'

    findings.push({
      category: 'testing',
      severity,
      code: `audit-tests/mock-vnode-${entry.risk}`,
      gate: 'audit-tests',
      message: `Mock-vnode test pattern (risk: ${entry.risk}). Literals: ${entry.mockVNodeLiteralCount}, helper defs: ${entry.mockHelperCount}, helper calls: ${entry.mockHelperCallCount}, real h() calls: ${entry.realHCallCount}. ${entry.realHCallCount === 0 ? 'No real-h() coverage — every contract assertion is mock-only.' : 'Has real-h() coverage but mock-vnode patterns still dominate.'}`,
      location: { path: entry.path, relPath: entry.relPath },
    })
  }

  return {
    gate: 'audit-tests',
    category: 'testing',
    findings,
    meta: {
      scanned: result.entries.length,
      elapsedMs: Date.now() - start,
    },
  }
}
