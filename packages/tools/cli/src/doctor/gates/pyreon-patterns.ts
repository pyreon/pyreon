/**
 * pyreon-patterns gate — wraps `@pyreon/compiler:detectPyreonPatterns`.
 *
 * Catches "using Pyreon wrong" mistakes — 12 detector codes today
 * (for-missing-by, props-destructured, signal-write-as-call, etc.).
 * The detector matches the anti-patterns catalogue in
 * `.claude/rules/anti-patterns.md` (entries tagged `[detector: ...]`)
 * 1:1 — so the user reading the doctor output gets the same advice
 * as someone running `validate` via MCP.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  detectPyreonPatterns,
  hasPyreonPatterns,
} from '@pyreon/compiler'
import { loadConfig } from '@pyreon/lint'

import type { Finding, GateResult } from '../types'
import { emptyScanResult } from '../utils/empty-scan'
import { collectAuditableSourceFiles } from '../utils/walk'
import {
  resolveWorkspaceRoots,
  type WorkspaceRoots,
} from '../utils/workspace-roots'

export interface PyreonPatternsGateOptions {
  cwd: string
  /**
   * Pre-resolved workspace roots (the orchestrator resolves once and
   * shares). Absent → resolved from `cwd`.
   */
  workspace?: WorkspaceRoots | undefined
}

/**
 * `detectPyreonPatterns` (the MCP-`validate` detectors) OVERLAPS the
 * `@pyreon/lint` rules the `lint` gate runs. Where a detector code is FULLY
 * covered by a configured lint rule (same pattern, same-or-broader scope),
 * the `lint` gate already reports it WITH the project's config — correct
 * severity + `.pyreonlintrc.json` exemptPaths. Re-running the raw detector
 * here then (a) double-reports the SAME issue under a second code, (b) at a
 * hardcoded `'warning'` severity that overrides the lint rule's chosen one
 * (e.g. `no-raw-addeventlistener` is `info`), and (c) FPs on the framework
 * code the lint rule exempts. So for those codes we DEFER to the lint gate
 * and skip them here. Detector-ONLY codes (no lint counterpart) are
 * pyreon-patterns' unique value and are always reported.
 *
 * `LINT_OWNED_CODES` = detector codes whose lint rule catches the SAME thing
 * with >= scope (verified): `no-process-dev-gate` (flags the typeof-process
 * compound AND import.meta.env.DEV — superset), `no-raw-addeventlistener`
 * (flags `addEventListener`), `query-options-as-function`. NOT included:
 * `raw-remove-event-listener` — `no-raw-addeventlistener` is ADD-only, so
 * pyreon-patterns is the SOLE catcher for `removeEventListener` (skipping it
 * would be a silent miss). It's kept, but with the SAME framework-layer
 * exemptPaths the add-rule is configured with (the hooks/runtime-dom layers
 * legitimately use both add + remove).
 */
const LINT_OWNED_CODES = new Set<string>([
  'process-dev-gate',
  'raw-add-event-listener',
  'query-options-as-function',
])

/** Codes kept here but needing the framework-layer exemptions of a lint rule. */
const DETECTOR_RULE_COUNTERPART: Record<string, string> = {
  'raw-remove-event-listener': 'pyreon/no-raw-addeventlistener',
}

/** Build code → exemptPaths[] from the project's lint config (empty on any failure). */
const buildExemptPaths = (cwd: string): Map<string, string[]> => {
  const out = new Map<string, string[]>()
  let rules: Record<string, unknown> = {}
  try {
    rules = (loadConfig(cwd)?.rules ?? {}) as Record<string, unknown>
  } catch {
    return out
  }
  for (const [code, ruleId] of Object.entries(DETECTOR_RULE_COUNTERPART)) {
    const entry = rules[ruleId]
    const ruleOpts = Array.isArray(entry) ? (entry[1] as { exemptPaths?: unknown }) : undefined
    const ep = ruleOpts?.exemptPaths
    if (Array.isArray(ep)) {
      out.set(code, ep.filter((e): e is string => typeof e === 'string' && e.length > 0))
    }
  }
  return out
}

export const runPyreonPatternsGate = async (
  opts: PyreonPatternsGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const ws = opts.workspace ?? resolveWorkspaceRoots(opts.cwd)
  const files = collectAuditableSourceFiles(ws)
  // A pattern gate that matched no files must not read as a clean pass.
  if (files.length === 0) {
    return emptyScanResult('pyreon-patterns', 'correctness', ws, start)
  }
  const exemptPathsByCode = buildExemptPaths(opts.cwd)

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    if (!hasPyreonPatterns(code)) continue

    const relPath = path.relative(ws.repoRoot, file)
    const diagnostics = detectPyreonPatterns(code, relPath)

    for (const diag of diagnostics) {
      // Defer to the `lint` gate for codes it fully owns (correct severity +
      // config + exemptPaths) — avoids double-reporting + severity mismatch.
      if (LINT_OWNED_CODES.has(diag.code)) continue
      // For the kept codes, honor the counterpart lint rule's configured
      // exemptPaths (matches the lint gate; no-op for codes without one).
      const exempt = exemptPathsByCode.get(diag.code)
      if (exempt?.some((p) => relPath.includes(p) || file.includes(p))) continue

      findings.push({
        category: 'correctness',
        severity: 'warning',
        code: `pyreon-patterns/${diag.code}`,
        gate: 'pyreon-patterns',
        message: diag.message,
        location: {
          path: file,
          relPath,
          line: diag.line,
          column: diag.column,
        },
        fix: diag.suggested,
      })
    }
  }

  return {
    gate: 'pyreon-patterns',
    category: 'correctness',
    findings,
    meta: { scanned: files.length, elapsedMs: Date.now() - start },
  }
}
