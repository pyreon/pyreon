/**
 * react-patterns gate — wraps `@pyreon/compiler:detectReactPatterns`.
 *
 * Catches "coming from React" mistakes: `useState` / `useEffect`,
 * `className` / `htmlFor`, `onChange` on inputs, React-package
 * imports, etc. The detector is already used standalone by the
 * pre-PR-2 `pyreon doctor` legacy path; this adapter just emits its
 * findings in the unified `Finding[]` shape so the v2 aggregator can
 * fold them into the score.
 *
 * `--fix` mode delegates to `migrateReactCode` and reports BOTH the
 * applied changes (as `info` findings) AND any residual diagnostics
 * the migration didn't auto-resolve.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import { detectReactPatterns, hasReactPatterns, migrateReactCode } from '@pyreon/compiler'

import type { Finding, GateResult } from '../types'
import { collectFirstPartySourceFiles, isCompatPackageFile } from '../utils/walk'

export interface ReactPatternsGateOptions {
  cwd: string
  /** Apply `migrateReactCode` to each file with React patterns (writes to disk). */
  fix?: boolean | undefined
}

export const runReactPatternsGate = async (opts: ReactPatternsGateOptions): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  // First-party source only, and NOT the `*-compat` packages: a React/
  // Vue/etc. compatibility shim exposing `useState` / `className` is its
  // literal purpose — flagging it is a definitional false positive.
  const files = collectFirstPartySourceFiles(opts.cwd).filter((f) => !isCompatPackageFile(f))

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    if (!hasReactPatterns(code)) continue

    const relPath = path.relative(opts.cwd, file)

    if (opts.fix) {
      const migrated = migrateReactCode(code, relPath)
      if (migrated.changes.length > 0) {
        fs.writeFileSync(file, migrated.code, 'utf-8')
        for (const ch of migrated.changes) {
          findings.push({
            category: 'correctness',
            severity: 'info',
            code: `react-patterns/auto-fixed-${ch.type}`,
            gate: 'react-patterns',
            message: `Auto-fixed: ${ch.description}`,
            location: { path: file, relPath, line: ch.line },
          })
        }
      }
      const remaining = detectReactPatterns(migrated.code, relPath)
      for (const diag of remaining) {
        findings.push({
          category: 'correctness',
          severity: diag.fixable ? 'warning' : 'error',
          code: `react-patterns/${diag.code}`,
          gate: 'react-patterns',
          message: diag.message,
          location: {
            path: file,
            relPath,
            line: diag.line,
            column: diag.column,
          },
          fix: diag.suggested,
          fixable: diag.fixable,
        })
      }
    } else {
      const diagnostics = detectReactPatterns(code, relPath)
      for (const diag of diagnostics) {
        findings.push({
          category: 'correctness',
          severity: diag.fixable ? 'warning' : 'error',
          code: `react-patterns/${diag.code}`,
          gate: 'react-patterns',
          message: diag.message,
          location: {
            path: file,
            relPath,
            line: diag.line,
            column: diag.column,
          },
          fix: diag.suggested,
          fixable: diag.fixable,
        })
      }
    }
  }

  return {
    gate: 'react-patterns',
    category: 'correctness',
    findings,
    meta: { scanned: files.length, elapsedMs: Date.now() - start },
  }
}
