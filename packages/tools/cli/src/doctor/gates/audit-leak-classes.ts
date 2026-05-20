/**
 * audit-leak-classes gate — programmatic API.
 *
 * Catches the 5 memory-leak classes catalogued in
 * `.claude/rules/anti-patterns.md` "Memory Leak Classes" section. The
 * script ships 4 detectors (Class A / C / D / I) that are too
 * context-dependent for a per-file lint rule but tractable as an
 * advisory project-wide scan. See #748 (the audit script PR) and the
 * leak-class taxonomy (#746) for the full story.
 *
 * **Severity mapping**: every audit finding maps to severity `'info'`
 * by design. The audit is advisory — false positives are expected,
 * the report is for manual triage, NOT a CI gate. Mapping to
 * `'warning'` or `'error'` would push the score down for known-bounded
 * patterns (Chrome extension scripts, framework-owned lifecycles,
 * enum-keyed caches) which the audit deliberately flags. Treating
 * them as info keeps the doctor's overall grade honest.
 *
 * **Implementation note (subprocess adapter).** Mirrors `audit-types.ts`
 * — invokes the standalone `scripts/audit-leak-classes.ts` via
 * `--json` and parses the output. ~70-80ms total runtime (fast gate).
 */

import { execFileSync } from 'node:child_process'
import { join, relative } from 'node:path'
import type { Finding, GateResult } from '../types'

interface ScriptFinding {
  detector: string
  file: string
  line: number
  message: string
  context: string
  leakClass: 'A' | 'C' | 'D' | 'I'
}

interface ScriptOutput {
  findings: ScriptFinding[]
  total: number
}

/**
 * Pure parse-and-map function — public so tests can exercise the JSON
 * → `Finding[]` translation without spawning a subprocess. Exported as
 * `_internal` (unstable API surface).
 */
export const _parseAuditLeakClassesOutput = (
  raw: string,
  cwd: string,
): { findings: Finding[]; total: number } => {
  const parsed = JSON.parse(raw) as ScriptOutput
  const findings: Finding[] = parsed.findings.map((f) => ({
    category: 'architecture' as const,
    // ALWAYS info — advisory audit. See JSDoc above for the rationale.
    severity: 'info' as const,
    code: `audit-leak-classes/class-${f.leakClass.toLowerCase()}-${f.detector}`,
    gate: 'audit-leak-classes',
    message: `[Class ${f.leakClass}] ${f.message}`,
    location: {
      path: f.file,
      relPath: relative(cwd, f.file),
      line: f.line,
    },
  }))
  return { findings, total: parsed.total }
}

export interface AuditLeakClassesGateOptions {
  /** Repository root directory */
  cwd: string
  /** Path to bun executable. Defaults to `'bun'`. */
  bun?: string
}

export const runAuditLeakClassesGate = async (
  opts: AuditLeakClassesGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const scriptPath = join(opts.cwd, 'scripts/audit-leak-classes.ts')

  let total = 0
  try {
    const out = execFileSync(opts.bun ?? 'bun', ['run', scriptPath, '--json'], {
      cwd: opts.cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024, // 16MB — audit can produce large output
    })
    const parsed = _parseAuditLeakClassesOutput(out, opts.cwd)
    findings.push(...parsed.findings)
    total = parsed.total
  }
  catch (err) {
    findings.push({
      category: 'architecture',
      severity: 'error',
      code: 'audit-leak-classes/gate-failed',
      gate: 'audit-leak-classes',
      message: `audit-leak-classes gate failed to run: ${(err as Error).message}`,
    })
  }

  return {
    gate: 'audit-leak-classes',
    category: 'architecture',
    findings,
    meta: {
      scanned: total,
      elapsedMs: Date.now() - start,
    },
  }
}
