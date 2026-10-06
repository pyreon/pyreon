/**
 * native-audit gate — wraps `@pyreon/native-compiler/audit:auditNative`.
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

import type { NativeAuditResult, NativeFindingCode } from '@pyreon/native-compiler/audit'

import type { Finding, GateResult, Severity } from '../types'

/**
 * The audit lives in `@pyreon/native-compiler` (the native story), not in the
 * web compiler `@pyreon/cli` always ships with. It is an OPTIONAL peer, so it
 * is loaded lazily and its absence is an honest SKIP -- never a crash, and
 * never a clean 100: a skipped gate's category is excluded from doctor's mean,
 * so a project is not awarded a multiplatform story nothing measured.
 */
export interface NativeAuditModule {
  auditNative: (cwd: string) => NativeAuditResult
}

export const NATIVE_COMPILER_NOT_INSTALLED =
  '@pyreon/native-compiler is not installed — install it to audit multiplatform sources ' +
  '(`bun add -d @pyreon/native-compiler`, or the equivalent for your package manager)'

const isModuleNotFound = (err: unknown): boolean => {
  const code = (err as { code?: unknown } | null)?.code
  // Bun reports a bare specifier miss as ERR_MODULE_NOT_FOUND / MODULE_NOT_FOUND;
  // the message check covers runtimes that omit the code. Anything ELSE (a
  // throw while the audit module evaluates) is a real bug and must surface.
  return (
    code === 'ERR_MODULE_NOT_FOUND' ||
    code === 'MODULE_NOT_FOUND' ||
    /Cannot find (?:module|package) '@pyreon\/native-compiler/.test(String((err as Error)?.message))
  )
}

/** Dynamic import of the audit subpath; `undefined` when the peer is absent. */
export const loadNativeAudit = async (): Promise<NativeAuditModule | undefined> => {
  try {
    return (await import('@pyreon/native-compiler/audit')) as NativeAuditModule
  } catch (err) {
    if (isModuleNotFound(err)) return undefined
    throw err
  }
}

const SEVERITY_BY_CODE: Record<NativeFindingCode, Severity> = {
  'web-only-package-import': 'warning',
  'native-unsupported-decl': 'warning',
}

export interface NativeAuditGateOptions {
  cwd: string
  /** Injectable for tests; defaults to the lazy dynamic import. */
  loadAudit?: (() => Promise<NativeAuditModule | undefined>) | undefined
}

export const runNativeAuditGate = async (
  opts: NativeAuditGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const audit = await (opts.loadAudit ?? loadNativeAudit)()

  if (!audit) {
    return {
      gate: 'native-audit',
      category: 'architecture',
      findings: [],
      meta: {
        elapsedMs: Date.now() - start,
        skipped: true,
        skipReason: NATIVE_COMPILER_NOT_INSTALLED,
      },
    }
  }

  const result = audit.auditNative(opts.cwd)

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
