/**
 * islands-audit gate — wraps `@pyreon/compiler:auditIslands`.
 *
 * Project-wide cross-file detectors for the island architecture
 * (duplicate names, dead islands, registry drift, nested islands,
 * never-with-registry-entry). Per-finding severity is derived from
 * the finding code: `dead-island` is a warning (might be intentional
 * during refactor), everything else is an error (silent runtime
 * failure mode).
 */

import { auditIslands, type IslandFindingCode } from '@pyreon/compiler'

import type { Finding, GateResult, Severity } from '../types'

const SEVERITY_BY_CODE: Record<IslandFindingCode, Severity> = {
  'duplicate-name': 'error',
  'never-with-registry-entry': 'error',
  'registry-mismatch': 'error',
  'nested-island': 'error',
  'dead-island': 'warning',
}

export interface IslandsAuditGateOptions {
  cwd: string
}

export const runIslandsAuditGate = async (opts: IslandsAuditGateOptions): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const result = auditIslands(opts.cwd)

  for (const f of result.findings) {
    findings.push({
      category: 'architecture',
      severity: SEVERITY_BY_CODE[f.code] ?? 'error',
      code: `islands-audit/${f.code}`,
      gate: 'islands-audit',
      message: f.message,
      location: {
        path: f.location.path,
        relPath: f.location.relPath,
        line: f.location.line,
        column: f.location.column,
      },
      relatedLocations: f.related?.map((r) => ({
        path: r.path,
        relPath: r.relPath,
        line: r.line,
        column: r.column,
      })),
    })
  }

  return {
    gate: 'islands-audit',
    category: 'architecture',
    findings,
    meta: {
      scanned: result.findings.length,
      elapsedMs: Date.now() - start,
    },
  }
}
