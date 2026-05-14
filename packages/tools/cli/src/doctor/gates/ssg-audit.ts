/**
 * ssg-audit gate — wraps `@pyreon/compiler:auditSsg`.
 *
 * SSG / ISR convention checker (M3.4): `_404.tsx` placement, dynamic
 * routes missing `getStaticPaths`, non-literal revalidate exports.
 * Severities mirror the gate's intent: missing-getStaticPaths is a
 * warn (legit under `mode: 'ssr' | 'isr'`), the other two are errors
 * (silently broken under `mode: 'ssg'`).
 */

import { auditSsg, type SsgFindingCode } from '@pyreon/compiler'

import type { Finding, GateResult, Severity } from '../types'

const SEVERITY_BY_CODE: Record<SsgFindingCode, Severity> = {
  '404-outside-layout-dir': 'error',
  'dynamic-route-missing-get-static-paths': 'warning',
  'non-literal-revalidate-export': 'error',
}

export interface SsgAuditGateOptions {
  cwd: string
}

export const runSsgAuditGate = async (
  opts: SsgAuditGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const result = auditSsg(opts.cwd)

  for (const f of result.findings) {
    findings.push({
      category: 'architecture',
      severity: SEVERITY_BY_CODE[f.code] ?? 'error',
      code: `ssg-audit/${f.code}`,
      gate: 'ssg-audit',
      message: f.message,
      location: {
        path: f.location.path,
        relPath: f.location.relPath,
        line: f.location.line,
        column: f.location.column,
      },
    })
  }

  return {
    gate: 'ssg-audit',
    category: 'architecture',
    findings,
    meta: {
      scanned: result.findings.length,
      elapsedMs: Date.now() - start,
    },
  }
}
