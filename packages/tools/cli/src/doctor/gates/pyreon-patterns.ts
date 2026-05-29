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

import { detectPyreonPatterns, hasPyreonPatterns } from '@pyreon/compiler'

import type { Finding, GateResult } from '../types'
import { collectFirstPartySourceFiles } from '../utils/walk'

export interface PyreonPatternsGateOptions {
  cwd: string
}

export const runPyreonPatternsGate = async (
  opts: PyreonPatternsGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  const files = collectFirstPartySourceFiles(opts.cwd)

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    if (!hasPyreonPatterns(code)) continue

    const relPath = path.relative(opts.cwd, file)
    const diagnostics = detectPyreonPatterns(code, relPath)

    for (const diag of diagnostics) {
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
