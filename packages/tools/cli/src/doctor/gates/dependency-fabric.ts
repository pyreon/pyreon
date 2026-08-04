/**
 * Dependency-fabric gate — the workspace's own dependency health, from loom.
 *
 * ── Why this does not add a dependency ────────────────────────────────────
 *
 * `@pyreon/cli` has exactly two runtime deps and this gate adds none. The
 * repo's established shape for reaching a sibling tool is dependency-free
 * delegation: `pyreon loom` shells out to whatever `@pyreon/loom` the project
 * has. This gate follows it, with one deliberate difference.
 *
 * `pyreon loom` uses `npx --yes`, which FETCHES when the package is absent —
 * correct there, because the user typed `loom` and asked for it. `pyreon
 * doctor` did not ask for it, so silently downloading a package mid-audit
 * would be a surprise install on someone's machine and a network dependency in
 * a command advertised as fast and local. So this RESOLVES the project's own
 * install and skips when there is none.
 *
 * ── Why skipping is honest here ───────────────────────────────────────────
 *
 * A skipped gate's category is excluded from doctor's mean rather than scored
 * as 100 — so a project without loom is not silently awarded dependency health
 * it was never measured for. That is the same rule the multiplatform-tier gate
 * follows: an empty scan is a SKIP, never a clean pass.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Finding, GateResult, Severity } from '../types'

/** Loom's issue codes → doctor severities. Loom already grades honestly; this
 * preserves its judgement rather than re-deciding it. */
const SEVERITY_BY_LOOM: Record<string, Severity> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
}

interface LoomIssue {
  code: string
  severity: string
  pkg: string
  dep?: string
  message: string
}

interface LoomReport {
  issues?: LoomIssue[]
  stats?: Record<string, number>
}

/**
 * The project's OWN `@pyreon/loom` bin, or undefined.
 *
 * Resolution goes through the project's `node_modules`, never a global or a
 * fetch — "is it installed here?" is exactly the question, and `createRequire`
 * anchored at the scanned directory is how to ask it.
 */
export function resolveLoomBin(cwd: string): string | undefined {
  try {
    const req = createRequire(join(cwd, 'package.json'))
    const pkgJson = req.resolve('@pyreon/loom/package.json')
    const bin = join(pkgJson, '..', 'bin', 'loom.js')
    return existsSync(bin) ? bin : undefined
  } catch {
    return undefined
  }
}

/** Turn loom's report into doctor findings. Pure — unit-testable. */
export function findingsFromReport(report: LoomReport): Finding[] {
  const findings: Finding[] = []
  for (const issue of report.issues ?? []) {
    // `unused-dep` is loom's own info tier because it is lexical evidence
    // rather than proof; carrying its severity through keeps doctor from
    // promoting a "verify before removing" hint into an actionable defect.
    const severity = SEVERITY_BY_LOOM[issue.severity] ?? 'info'
    findings.push({
      category: 'architecture',
      severity,
      code: `dependency-fabric/${issue.code}`,
      gate: 'dependency-fabric',
      message: issue.dep ? `${issue.message}` : issue.message,
    })
  }
  return findings
}

export const runDependencyFabricGate = async (opts: {
  cwd: string
}): Promise<GateResult> => {
  const start = Date.now()
  const bin = resolveLoomBin(opts.cwd)

  if (!bin) {
    return {
      gate: 'dependency-fabric',
      category: 'architecture',
      findings: [],
      meta: {
        elapsedMs: Date.now() - start,
        skipped: true,
        skipReason:
          '@pyreon/loom is not installed in this project — install it (`pyreon add @pyreon/loom`) ' +
          'to include dependency health in the score, or run `pyreon loom scan .` directly. ' +
          'Not scored rather than assumed healthy.',
      },
    }
  }

  let report: LoomReport
  try {
    // `--json` + `--no-write` — doctor is an audit, so it must not leave a
    // `loom-report.json` behind in someone's repo as a side effect.
    const stdout = execFileSync('node', [bin, 'scan', opts.cwd, '--json', '--no-write'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
    report = JSON.parse(stdout) as LoomReport
  } catch (err) {
    // A scan that throws is loom telling us something real (not a workspace
    // root, a malformed config). Surface it as ONE finding rather than
    // pretending the fabric is clean — and never crash the whole audit.
    return {
      gate: 'dependency-fabric',
      category: 'architecture',
      findings: [
        {
          category: 'architecture',
          severity: 'warning',
          code: 'dependency-fabric/scan-failed',
          gate: 'dependency-fabric',
          message:
            'loom scan could not analyze this workspace: ' +
            `${(err as Error)?.message ?? String(err)}`.split('\n')[0],
        },
      ],
      meta: { elapsedMs: Date.now() - start },
    }
  }

  const findings = findingsFromReport(report)
  return {
    gate: 'dependency-fabric',
    category: 'architecture',
    findings,
    meta: {
      scanned: report.stats?.internal ?? 0,
      elapsedMs: Date.now() - start,
    },
  }
}
