/**
 * Doctor orchestrator — picks the gate list per mode, runs them in
 * parallel where safe, collects results, hands off to the aggregator.
 *
 * **Gate categorization by speed** (the authoritative lists are the
 * `FAST_GATES` / `SLOW_GATES` arrays below — keep this comment in sync):
 *   - FAST gates (default, 11): react-patterns, pyreon-patterns, lint,
 *     distribution, doc-claims, islands-audit, ssg-audit, content-audit,
 *     audit-tests, check-dedup, audit-leak-classes.
 *     Total runtime ~2-5s on the real Pyreon repo.
 *   - SLOW gates (`--full` opt-in, 2): audit-types (TS compiler-API walk
 *     across 6 packages, ~1-30s), bundle-budgets (Bun.build of every
 *     published package, ~15-30s).
 *
 * **Gate isolation**: each gate runs inside a try/catch — a gate that
 * throws is recorded as a single `<gate>/gate-failed` ERROR finding
 * instead of rejecting `Promise.all` and taking down the whole report.
 *
 * **Why parallel**: the gates are fully independent — no shared
 * state, no file-write contention (only `--fix` writes, and lint /
 * react-patterns target disjoint file patterns). Running them via
 * `Promise.all` cuts wall-clock from ~5s sequential to ~1-2s for the
 * fast set on a warm cache.
 *
 * **Skip filtering**: `--only` and `--skip` operate on gate names.
 * Skipped gates appear in the report with `meta.skipped: true` so
 * the renderer shows them in the footer ("Skipped: bundle-budgets").
 */

import {
  runAuditLeakClassesGate,
  runAuditTestsGate,
  runAuditTypesGate,
  runBundleBudgetsGate,
  runCheckDedupGate,
  runContentAuditGate,
  runDistributionGate,
  runDocClaimsGate,
  runIslandsAuditGate,
  runLintGate,
  runPyreonPatternsGate,
  runReactPatternsGate,
  runSsgAuditGate,
} from './gates'
import { buildReport } from './report'
import type { DoctorReport, GateResult } from './types'

export type GateName =
  | 'react-patterns'
  | 'pyreon-patterns'
  | 'lint'
  | 'distribution'
  | 'doc-claims'
  | 'audit-tests'
  | 'islands-audit'
  | 'ssg-audit'
  | 'content-audit'
  | 'check-dedup'
  | 'audit-leak-classes'
  | 'audit-types'
  | 'bundle-budgets'

/** Gates that run by default (fast). */
export const FAST_GATES: GateName[] = [
  'react-patterns',
  'pyreon-patterns',
  'lint',
  'distribution',
  'doc-claims',
  'islands-audit',
  'ssg-audit',
  'content-audit',
  'audit-tests',
  'check-dedup',
  'audit-leak-classes',
]

/** Gates that require `--full` to enable. */
export const SLOW_GATES: GateName[] = ['audit-types', 'bundle-budgets']

export interface OrchestratorOptions {
  cwd: string
  /** Enable slow gates (audit-types, bundle-budgets). */
  full?: boolean | undefined
  /** Run ONLY these gates (overrides `--full` / default selection). */
  only?: GateName[] | undefined
  /** Exclude these gates from whatever set would otherwise run. */
  skip?: GateName[] | undefined
  /** Apply auto-fixes where supported (lint + react-patterns). */
  fix?: boolean | undefined
  /** Min risk for the test-environment audit. Defaults to `'medium'`. */
  auditMinRisk?: 'high' | 'medium' | 'low' | undefined
}

const skippedGate = (
  gate: GateName,
  category: GateResult['category'],
  reason: string,
): GateResult => ({
  gate,
  category,
  findings: [],
  meta: { elapsedMs: 0, skipped: true, skipReason: reason },
})

const ALL_GATE_CATEGORIES: Record<GateName, GateResult['category']> = {
  'react-patterns': 'correctness',
  'pyreon-patterns': 'correctness',
  lint: 'correctness',
  distribution: 'architecture',
  'doc-claims': 'documentation',
  'audit-tests': 'testing',
  'islands-audit': 'architecture',
  'ssg-audit': 'architecture',
  'content-audit': 'architecture',
  'check-dedup': 'architecture',
  // Advisory: leak-class heuristics are false-positive-prone (manual triage),
  // so they're VISIBLE but excluded from the grade + --ci (see the gate's JSDoc).
  'audit-leak-classes': 'best-practices',
  'audit-types': 'architecture',
  'bundle-budgets': 'performance',
}

/**
 * Resolve which gates to run.
 *
 * Precedence: `--only` > `--skip` > (`--full` toggles slow gates) > default fast set.
 */
export const resolveGates = (opts: OrchestratorOptions): GateName[] => {
  if (opts.only && opts.only.length > 0) {
    const skip = new Set(opts.skip ?? [])
    return opts.only.filter((g) => !skip.has(g))
  }
  const base: GateName[] = opts.full ? [...FAST_GATES, ...SLOW_GATES] : [...FAST_GATES]
  const skip = new Set(opts.skip ?? [])
  return base.filter((g) => !skip.has(g))
}

/**
 * Run the gates and build the report. Wall-clock is measured here
 * (vs the aggregator's sum-of-elapsedMs which is total CPU time).
 */
export const runDoctor = async (
  opts: OrchestratorOptions,
): Promise<DoctorReport> => {
  const start = Date.now()
  const selected = new Set(resolveGates(opts))
  const all: GateName[] = [...FAST_GATES, ...SLOW_GATES]

  const promises = all.map(async (gate): Promise<GateResult> => {
    if (!selected.has(gate)) {
      // Distinguish "user explicitly skipped" from "needs --full".
      const reason = SLOW_GATES.includes(gate) && !opts.full
        ? 'enable with --full'
        : 'skipped'
      return skippedGate(gate, ALL_GATE_CATEGORIES[gate], reason)
    }
    try {
      return await runGate(gate, opts)
    } catch (err) {
      // A gate that throws must NOT take down the whole run — `Promise.all`
      // would reject and we'd lose every other gate's findings + the score.
      // Isolate it as a single `gate-failed` ERROR finding (the same shape
      // `bundle-budgets` uses for its own internal catch) so the report
      // still renders and the failure is surfaced, not swallowed.
      const category = ALL_GATE_CATEGORIES[gate]
      return {
        gate,
        category,
        findings: [
          {
            category,
            severity: 'error',
            code: `${gate}/gate-failed`,
            gate,
            message: `${gate} gate threw and was isolated: ${(err as Error)?.message ?? String(err)}`,
          },
        ],
        meta: { elapsedMs: 0 },
      }
    }
  })

  const gates = await Promise.all(promises)
  const report = buildReport(gates)
  // Overwrite the sum-of-elapsedMs proxy with the real wall-clock.
  return { ...report, elapsedMs: Date.now() - start }
}

const runGate = async (
  gate: GateName,
  opts: OrchestratorOptions,
): Promise<GateResult> => {
  switch (gate) {
    case 'react-patterns':
      return runReactPatternsGate({ cwd: opts.cwd, fix: opts.fix })
    case 'pyreon-patterns':
      return runPyreonPatternsGate({ cwd: opts.cwd })
    case 'lint':
      return runLintGate({ cwd: opts.cwd, fix: opts.fix })
    case 'distribution':
      return runDistributionGate({ cwd: opts.cwd, skipPackProbe: true })
    case 'doc-claims':
      return runDocClaimsGate({ cwd: opts.cwd })
    case 'audit-tests':
      return runAuditTestsGate({
        cwd: opts.cwd,
        minRisk: opts.auditMinRisk ?? 'medium',
      })
    case 'islands-audit':
      return runIslandsAuditGate({ cwd: opts.cwd })
    case 'ssg-audit':
      return runSsgAuditGate({ cwd: opts.cwd })
    case 'content-audit':
      return runContentAuditGate({ cwd: opts.cwd })
    case 'check-dedup':
      return runCheckDedupGate({ cwd: opts.cwd })
    case 'audit-leak-classes':
      return runAuditLeakClassesGate({ cwd: opts.cwd })
    case 'audit-types':
      return runAuditTypesGate({ cwd: opts.cwd })
    case 'bundle-budgets':
      return runBundleBudgetsGate({ cwd: opts.cwd })
  }
}
