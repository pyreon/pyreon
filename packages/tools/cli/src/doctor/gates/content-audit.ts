/**
 * content-audit gate — wraps `@pyreon/compiler:auditContent`.
 *
 * Project-wide cross-file detectors for `@pyreon/zero-content`-shaped
 * apps: missing frontmatter titles, broken internal links between
 * markdown pages, orphaned `.md` files outside any declared
 * collection. Per-finding severity derived from the code:
 *   - missing title → error (schema-required field)
 *   - broken link → error (runtime 404)
 *   - orphaned file → warning (might be intentional WIP)
 */

import { auditContent, type ContentFindingCode } from '@pyreon/compiler'

import type { Finding, GateResult, Severity } from '../types'

const SEVERITY_BY_CODE: Record<ContentFindingCode, Severity> = {
  'missing-frontmatter-title': 'error',
  'broken-internal-link': 'error',
  'orphaned-md-file': 'warning',
}

export interface ContentAuditGateOptions {
  cwd: string
}

export const runContentAuditGate = async (
  opts: ContentAuditGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const result = auditContent(opts.cwd)

  for (const f of result.findings) {
    findings.push({
      category: 'architecture',
      severity: SEVERITY_BY_CODE[f.code] ?? 'error',
      code: `content-audit/${f.code}`,
      gate: 'content-audit',
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
    gate: 'content-audit',
    category: 'architecture',
    findings,
    meta: {
      scanned: result.summary.mdFilesScanned,
      elapsedMs: Date.now() - start,
    },
  }
}
