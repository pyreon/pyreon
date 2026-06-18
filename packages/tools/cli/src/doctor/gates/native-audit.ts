/**
 * native-audit gate — wraps `@pyreon/compiler:auditNative`.
 *
 * Multiplatform (PMTC) build-hazard checker for `.tsx` files that import
 * `@pyreon/primitives`:
 *  - `web-only-package-import` (warning) — a package that can't be
 *    native-rendered imported alongside multiplatform components.
 *  - `native-unsupported-decl` (warning) — a top-level interface / TS enum
 *    / class that PMTC silently drops on native.
 *
 * Both are `warning` (architecture category): they don't break the WEB
 * build, only the native one — and only if the project actually targets
 * iOS/Android. Surfaced for the AI/dev building multiplatform, not a hard
 * web-CI failure.
 */

import { auditNative, type NativeFindingCode } from '@pyreon/compiler'

import type { Finding, GateResult, Severity } from '../types'

const SEVERITY_BY_CODE: Record<NativeFindingCode, Severity> = {
  'web-only-package-import': 'warning',
  'native-unsupported-decl': 'warning',
}

export interface NativeAuditGateOptions {
  cwd: string
}

export const runNativeAuditGate = async (
  opts: NativeAuditGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const result = auditNative(opts.cwd)

  // No multiplatform files (no `@pyreon/primitives` importer) → skip
  // gracefully; the gate is only meaningful for multiplatform projects.
  if (result.summary.multiplatformFiles === 0) {
    return {
      gate: 'native-audit',
      category: 'architecture',
      findings: [],
      meta: {
        scanned: result.summary.filesScanned,
        elapsedMs: Date.now() - start,
        skipped: true,
        skipReason: 'no @pyreon/primitives importers found (not a multiplatform project)',
      },
    }
  }

  for (const f of result.findings) {
    findings.push({
      category: 'architecture',
      severity: SEVERITY_BY_CODE[f.code] ?? 'warning',
      code: `native-audit/${f.code}`,
      gate: 'native-audit',
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
    gate: 'native-audit',
    category: 'architecture',
    findings,
    meta: {
      scanned: result.summary.multiplatformFiles,
      elapsedMs: Date.now() - start,
    },
  }
}
