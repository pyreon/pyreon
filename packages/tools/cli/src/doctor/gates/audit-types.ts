/**
 * audit-types gate — programmatic API.
 *
 * Catches typed-but-unimplemented public-interface fields. Walks every
 * exported interface in each high-risk package and counts non-type
 * references; fields with zero references are flagged HIGH. Catches the
 * 0.14.0-class bug (`mode: "ssg"` typed but never read by runtime).
 *
 * **Implementation note (subprocess adapter).** This gate invokes the
 * standalone `scripts/audit-types.ts` script via `--json --all` and
 * parses the output. The script is 476 lines of mature AST-walking
 * logic with its own test suite; rather than surgically extract it
 * mid-shape, the adapter shape keeps PR 1 tractable and lets PR 2's
 * aggregation layer consume the same `Finding[]` shape as the other
 * gates. Adapter cost is ~50ms subprocess overhead — noise within the
 * gate's 1-5s scan runtime. Full extraction is a deferred follow-up
 * (the doctor aggregator doesn't care HOW the gate runs).
 */

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import type { Finding, GateResult, Severity } from '../types'

interface ScriptFieldFinding {
  package: string
  interface: string
  field: string
  declaredIn: string
  declaredLine: number
  refCount: number
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'OK'
}

interface ScriptAuditResult {
  package: string
  packageDir: string
  findings: ScriptFieldFinding[]
}

const mapSeverity = (s: ScriptFieldFinding['severity']): Severity | null => {
  switch (s) {
    case 'HIGH':
      return 'error'
    case 'MEDIUM':
      return 'warning'
    case 'LOW':
      return 'info'
    case 'OK':
      return null // suppress — field has references, not a finding
  }
}

export interface AuditTypesGateOptions {
  /** Repository root directory */
  cwd: string
  /** Path to bun executable. Defaults to `'bun'`. */
  bun?: string
  /**
   * Specific packages to audit. Defaults to `--all` (high-risk list
   * baked into the script: zero, router, core, server, runtime-server,
   * vite-plugin).
   */
  packages?: string[]
}

export const runAuditTypesGate = async (
  opts: AuditTypesGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const scriptPath = join(opts.cwd, 'scripts/audit-types.ts')
  const args = ['run', scriptPath, '--json']
  if (opts.packages && opts.packages.length > 0) {
    args.push(...opts.packages)
  } else {
    args.push('--all')
  }

  let scannedPackages = 0
  try {
    const out = execFileSync(opts.bun ?? 'bun', args, {
      cwd: opts.cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024, // 16MB — audit can produce large output
    })
    const results = JSON.parse(out) as ScriptAuditResult[]
    scannedPackages = results.length

    for (const r of results) {
      for (const f of r.findings) {
        const severity = mapSeverity(f.severity)
        if (severity === null) continue

        findings.push({
          category: 'architecture',
          severity,
          code: `audit-types/typed-but-unimplemented-${f.severity.toLowerCase()}`,
          gate: 'audit-types',
          message: `${f.package}: \`${f.interface}.${f.field}\` is typed in the public API but has ${f.refCount} non-type reference(s) in the package — likely typed-but-unimplemented.`,
          location: {
            path: join(opts.cwd, f.declaredIn),
            relPath: f.declaredIn,
            line: f.declaredLine,
          },
        })
      }
    }
  } catch (err) {
    // Script failure — surface as a single ERROR finding so the
    // gate doesn't silently skip. Captures "script not found",
    // parse errors, exec errors, etc.
    findings.push({
      category: 'architecture',
      severity: 'error',
      code: 'audit-types/gate-failed',
      gate: 'audit-types',
      message: `audit-types gate failed to run: ${(err as Error).message}`,
    })
  }

  return {
    gate: 'audit-types',
    category: 'architecture',
    findings,
    meta: {
      scanned: scannedPackages,
      elapsedMs: Date.now() - start,
    },
  }
}
