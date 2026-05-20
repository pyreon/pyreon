/**
 * Doctor orchestrator — picks the gate list per mode, runs them in
 * parallel where safe, collects results, hands off to the aggregator.
 *
 * **Gate categorization by speed**:
 *   - FAST gates (default): react-patterns, pyreon-patterns, lint,
 *     distribution, doc-claims, islands-audit, ssg-audit, audit-tests.
 *     Total runtime ~2-5s on the real Pyreon repo.
 *   - SLOW gates (`--full` opt-in): audit-types (TS compiler-API walk
 *     across 6 packages, ~1-30s), bundle-budgets (Bun.build of every
 *     published package, ~15-30s).
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
  | 'audit-leak-classes'
  | 'audit-types'
  | 'bundle-budgets'

/** Gates that run by default (fast). */
const FAST_GATES: GateName[] = [
  'react-patterns',
  'pyreon-patterns',
  'lint',
  'distribution',
  'doc-claims',
  'islands-audit',
  'ssg-audit',
  'audit-tests',
  'audit-leak-classes',
]

/** Gates that require `--full` to enable. */
const SLOW_GATES: GateName[] = ['audit-types', 'bundle-budgets']

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
  'audit-leak-classes': 'architecture',
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
    return runGate(gate, opts)
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
    case 'audit-leak-classes':
      return runAuditLeakClassesGate({ cwd: opts.cwd })
    case 'audit-types':
      return runAuditTypesGate({ cwd: opts.cwd })
    case 'bundle-budgets':
      return runBundleBudgetsGate({ cwd: opts.cwd })
  }
}
