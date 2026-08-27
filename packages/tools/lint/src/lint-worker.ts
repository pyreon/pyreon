import { readFileSync, writeFileSync } from 'node:fs'
import { parentPort, workerData } from 'node:worker_threads'
import { allRules } from './rules/index'
import { applyFixes, lintFile } from './runner'
import type { ConfigDiagnostic, LintConfig, LintFileResult } from './types'

/**
 * Worker entry for the parallel lint path.
 *
 * Linting is embarrassingly parallel — each file's diagnostics depend only on
 * that file plus the resolved config — but the engine ran every file on one
 * core while the other thirteen sat idle.
 *
 * The config is resolved ONCE on the main thread and handed over as plain
 * data, so a worker never re-reads `.pyreonlintrc.json`, never re-resolves the
 * preset, and cannot disagree with its siblings about what is enabled.
 *
 * Own-file writes: a worker applies `--fix` to the files it was given. That is
 * safe precisely because the partition is by file — no two workers ever touch
 * the same path — and it keeps the fixed source out of the message channel.
 */

export interface LintWorkerInput {
  files: string[]
  config: LintConfig
  fix: boolean
  quiet: boolean
}

export interface LintWorkerOutput {
  files: LintFileResult[]
  configDiagnostics: ConfigDiagnostic[]
}

/** Lint one slice. Exported so the logic is testable without spawning. */
export function lintSlice(input: LintWorkerInput): LintWorkerOutput {
  const { files, config, fix, quiet } = input
  const configDiagnostics: ConfigDiagnostic[] = []
  const results: LintFileResult[] = []

  for (const filePath of files) {
    let source: string
    try {
      source = readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }
    const fileResult = lintFile(filePath, source, allRules, config, undefined, configDiagnostics)

    if (fix) {
      const fixable = fileResult.diagnostics.filter((d) => d.fix)
      if (fixable.length > 0) {
        const fixed = applyFixes(source, fileResult.diagnostics)
        writeFileSync(filePath, fixed, 'utf-8')
        fileResult.fixedSource = fixed
        fileResult.diagnostics = fileResult.diagnostics.filter((d) => !d.fix)
      }
    }
    if (quiet) {
      fileResult.diagnostics = fileResult.diagnostics.filter((d) => d.severity === 'error')
    }
    results.push(fileResult)
  }

  return { files: results, configDiagnostics }
}

if (parentPort) {
  const out = lintSlice(workerData as LintWorkerInput)
  parentPort.postMessage(out)
}
